import * as auth from '@/services/authService';
import { ApiError, userMessage } from '@/services/ApiError';
import { configureHttpClient, invalidateHttpRequests, resetHttpClient } from '@/services/httpClient';
import { createRealtimeService } from '@/services/websocketService';
import { storage } from './storage.adapter';
import { getTranslations } from '@/i18n';

export type SessionStatus = 'loading' | 'signedIn' | 'signedOut';
export type SessionState = {
  status: SessionStatus;
  user: auth.AuthUser | null;
  error: string | null;
};

/** One session owner, with serialized persistence and cancellation by generation. */
export class SessionManager {
  readonly realtime = createRealtimeService();
  drafts = new Map<string, string>();
  state: SessionState = { status: 'loading', user: null, error: null };
  private session: auth.AuthResult | null = null;
  private epoch = 0;
  private listeners = new Set<() => void>();
  private writes: Promise<void> = Promise.resolve();
  private renewal: Promise<void> | null = null;
  private restoration: Promise<void> | null = null;
  // Vrai pendant qu'Authentification remplace les jetons de cet appareil (mot de passe changé, autres appareils
  // déconnectés) : le `session.revoquee` reçu par l'ancien socket ne doit pas fermer la session, le socket se
  // reconnecte avec le nouveau jeton (voir configureRealtime).
  private rotating = false;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.state;
  private update(state: SessionState) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
  private persist(operation: () => Promise<void>) {
    const next = this.writes.then(operation, operation);
    this.writes = next.catch(() => undefined);
    return next;
  }
  start() {
    configureHttpClient({
      getToken: () => this.session?.jeton ?? null,
      refreshSession: this.refreshSession,
      onUnauthorized: () => this.clear(),
    });
    return this.restoreSession();
  }
  dispose() {
    this.epoch++;
    this.session = null;
    this.restoration = null;
    this.renewal = null;
    this.drafts.clear();
    this.drafts = new Map();
    this.realtime.disconnectRealtime();
    resetHttpClient();
  }
  private async clear(): Promise<void> {
    this.epoch++;
    invalidateHttpRequests();
    this.renewal = null;
    this.session = null;
    this.drafts.clear();
    this.drafts = new Map();
    this.realtime.disconnectRealtime();
    this.update({ status: 'signedOut', user: null, error: null });
    try {
      await this.persist(() => storage.clear());
    } catch {
      this.update({
        ...this.state,
        error: getTranslations().errors.clearSessionLogout,
      });
    }
  }
  private async accept(result: auth.AuthResult, epoch: number) {
    if (epoch !== this.epoch) {
      await auth.logout(result.refresh_token).catch(() => undefined);
      return;
    }
    try {
      await this.persist(() => storage.save(result));
      if (epoch !== this.epoch) {
        await auth.logout(result.refresh_token).catch(() => undefined);
        return;
      }
      if (this.session && this.session.utilisateur.id !== result.utilisateur.id) {
        this.drafts.clear();
        this.drafts = new Map();
        this.realtime.disconnectRealtime();
      }
      this.session = result;
      this.realtime.configureRealtime({
        getToken: () => this.session?.jeton ?? null,
        onUnauthorized: () => {
          if (!this.rotating) void this.clear();
        },
      });
      this.update({
        status: 'signedIn',
        user: result.utilisateur,
        error: null,
      });
    } catch (error) {
      const cleanup = epoch === this.epoch ? this.clear() : Promise.resolve();
      await Promise.all([cleanup, auth.logout(result.refresh_token).catch(() => undefined)]);
      throw error;
    }
  }
  signIn = async (identifiant: string, motDePasse: string) => {
    invalidateHttpRequests();
    this.renewal = null;
    const epoch = ++this.epoch;
    const result = await auth.login(identifiant, motDePasse);
    await this.accept(result, epoch);
  };
  register = async (input: auth.Registration) => {
    invalidateHttpRequests();
    this.renewal = null;
    const epoch = ++this.epoch;
    const result = await auth.register(input);
    await this.accept(result, epoch);
  };
  refreshSession = (): Promise<void> => {
    if (this.renewal) return this.renewal;
    const session = this.session;
    const epoch = this.epoch;
    const pending = (async () => {
      try {
        if (!session) throw new ApiError('unauthorized', 'Session absente');
        const result = await auth.refresh(session.refresh_token);
        await this.accept(result, epoch);
      } catch (error) {
        if (epoch === this.epoch) await this.clear();
        throw error;
      }
    })();
    this.renewal = pending;
    void pending
      .finally(() => {
        if (this.renewal === pending) this.renewal = null;
      })
      .catch(() => undefined);
    return pending;
  };
  restoreSession = (): Promise<void> => {
    if (this.restoration) return this.restoration;
    const epoch = this.epoch;
    this.update({ status: 'loading', user: null, error: null });
    const pending = (async () => {
      try {
        const stored = await this.persistLoad();
        if (epoch !== this.epoch) return;
        if (!stored) {
          await this.clear();
          return;
        }
        this.session = stored;
        try {
          const user = await auth.me();
          await this.accept({ ...stored, utilisateur: user }, epoch);
        } catch (error) {
          if (epoch !== this.epoch) return;
          if (error instanceof ApiError && error.status === 401) await this.refreshSession();
          else if (
            error instanceof ApiError &&
            ['network', 'timeout', 'server', 'rate_limit', 'rate_limited'].includes(error.kind)
          ) {
            this.session = null;
            this.update({
              status: 'loading',
              user: null,
              error: userMessage(error),
            });
          } else throw error;
        }
      } catch (error) {
        if (epoch !== this.epoch) return;
        if (error instanceof ApiError && error.kind === 'storage') {
          this.session = null;
          this.update({ status: 'loading', user: null, error: userMessage(error) });
        } else await this.clear();
      }
    })();
    this.restoration = pending;
    void pending.finally(() => {
      if (this.restoration === pending) this.restoration = null;
    });
    return pending;
  };
  private async persistLoad() {
    await this.writes;
    return storage.load();
  }
  /**
   * Authentification révoque tous les jetons quand le mot de passe change : on se reconnecte aussitôt avec le
   * nouveau (le socket repart avec le nouveau jeton, voir configureRealtime). Si cette reconnexion échoue, le
   * mot de passe est changé mais la session est perdue : retour à la connexion.
   */
  changePassword = async (currentPassword: string, newPassword: string) => {
    const user = this.session?.utilisateur;
    if (!user) throw new ApiError('unauthorized', 'Session absente');
    this.rotating = true;
    try {
      await auth.changePassword(currentPassword, newPassword);
      // Les requêtes encore en vol avec l'ancien jeton ne doivent pas tenter de renouveler la session.
      invalidateHttpRequests();
      try {
        await this.signIn(user.courriel, newPassword);
      } catch (error) {
        await this.clear();
        throw error;
      }
    } finally {
      this.rotating = false;
    }
  };
  /**
   * Déconnecte tous les autres appareils : Authentification invalide toutes les sessions et renvoie une nouvelle
   * session pour celui-ci, qui reste connecté (le socket repart avec le nouveau jeton).
   */
  logoutOthers = async () => {
    const epoch = this.epoch;
    this.rotating = true;
    try {
      const result = await auth.logoutOthers();
      invalidateHttpRequests();
      await this.accept(result, epoch);
    } finally {
      this.rotating = false;
    }
  };
  /** Compte supprimé : la session locale est effacée (le jeton n'existe plus côté serveur). */
  deleteAccount = async (currentPassword: string) => {
    await auth.deleteAccount(currentPassword);
    await this.clear();
  };
  signOut = async () => {
    const session = this.session;
    // Local cleanup starts immediately, independently of the network.
    const cleanup = this.clear();
    await Promise.all([
      cleanup,
      session ? auth.logout(session.refresh_token).catch(() => undefined) : Promise.resolve(),
    ]);
  };
}
