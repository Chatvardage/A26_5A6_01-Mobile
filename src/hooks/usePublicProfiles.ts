import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useSession } from '@/session/SessionContext';
import { getPublicProfiles, type PublicProfile } from '@/services/publicProfiles.service';
import type { RealtimeService } from '@/services/websocketService';
export type DisplayProfile = PublicProfile & { online: boolean };

/** Délai minimal entre deux `presence.suivre` : Message-Service refuse une demande plus rapprochée (1 s). */
export const PRESENCE_FOLLOW_INTERVAL_MS = 1100;

type Realtime = Partial<Pick<RealtimeService, 'followPresence' | 'onReady' | 'subscribe'>>;

/**
 * Suivi de présence PARTAGÉ par tous les écrans montés. Le serveur ne garde qu'un suivi par connexion :
 * chaque `presence.suivre` remplace le précédent. Des écrans qui suivaient chacun leur liste (liste des
 * messages privés, conversation, membres, fiche de profil) se coupaient donc mutuellement, ou se faisaient
 * refuser leur demande. Ici, une seule demande porte l'union des personnes affichées.
 */
function createPresenceTracker(realtime: Realtime) {
  const counts = new Map<string, number>();
  const listeners = new Set<() => void>();
  let online = new Set<string>();
  // Personnes dont la présence est connue (réponse ou événement) ; les autres sont supposées en ligne si actives.
  let known = new Set<string>();
  let version = 0;
  let lastSent = -Infinity;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let offEvents: (() => void)[] = [];
  const notify = () => { version++; listeners.forEach(listener => listener()); };

  async function send() {
    timer = null;
    const ids = [...counts.keys()];
    if (!ids.length || !realtime.followPresence) return;
    lastSent = Date.now();
    try {
      const enLigne = await realtime.followPresence(ids);
      online = new Set(enLigne);
      known = new Set(ids);
      notify();
    } catch { /* Hors connexion : nouvelle demande à la prochaine connexion prête ou au prochain changement. */ }
  }
  /** Regroupe les changements d'un même instant et respecte l'intervalle imposé par le serveur. */
  function schedule() {
    if (timer) return;
    timer = setTimeout(() => void send(), Math.max(0, lastSent + PRESENCE_FOLLOW_INTERVAL_MS - Date.now()));
  }
  function listen() {
    try {
      // Le serveur oublie le suivi à la reconnexion : redemandé à chaque connexion prête.
      offEvents.push(realtime.onReady?.(schedule) ?? (() => undefined));
      offEvents.push(realtime.subscribe?.('presence.changed', raw => {
        if (!raw || typeof raw !== 'object') return;
        const event = raw as { userId?: unknown; statut?: unknown };
        if (typeof event.userId !== 'string' || !counts.has(event.userId) || !['en-ligne', 'hors-ligne'].includes(String(event.statut))) return;
        known.add(event.userId);
        if (event.statut === 'en-ligne') online.add(event.userId);
        else online.delete(event.userId);
        notify();
      }) ?? (() => undefined));
    } catch { /* Canal non configuré : la présence suivra à la prochaine ouverture d'écran. */ }
  }

  return {
    /** Ajoute ces personnes au suivi ; la fonction rendue les retire. */
    follow(ids: string[]) {
      if (!counts.size) listen();
      ids.forEach(id => counts.set(id, (counts.get(id) ?? 0) + 1));
      schedule();
      return () => {
        ids.forEach(id => {
          const count = counts.get(id)! - 1;
          if (count) counts.set(id, count);
          else counts.delete(id);
        });
        if (counts.size) return schedule();
        // Plus personne d'affiché : on se désabonne (la connexion peut changer avec le compte).
        offEvents.forEach(off => off());
        offEvents = [];
        if (timer) clearTimeout(timer);
        timer = null;
        online = new Set();
        known = new Set();
      };
    },
    /** Présence connue de cette personne, ou `undefined` si aucune réponse ne la concerne encore. */
    isOnline: (id: string) => (known.has(id) ? online.has(id) : undefined),
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    getVersion: () => version,
  };
}

const trackers = new WeakMap<object, ReturnType<typeof createPresenceTracker>>();
function trackerFor(realtime: Realtime) {
  let tracker = trackers.get(realtime);
  if (!tracker) trackers.set(realtime, (tracker = createPresenceTracker(realtime)));
  return tracker;
}
const noSubscription = () => () => undefined;
const noVersion = () => 0;

/** Profils publics et presence effective, comme sur Electron. */
export function usePublicProfiles(ids: string[]): Record<string, DisplayProfile> {
  const { realtime } = useSession();
  const key = [...new Set(ids)].sort().join(',');
  const [profiles, setProfiles] = useState<Record<string, PublicProfile>>({});
  const tracker = realtime ? trackerFor(realtime) : null;
  // Nouveau rendu à chaque changement de présence connu du suivi partagé.
  useSyncExternalStore(tracker?.subscribe ?? noSubscription, tracker?.getVersion ?? noVersion);
  useEffect(() => {
    const targets = key ? key.split(',') : [];
    if (!targets.length) return;
    let alive = true;
    let sequence = 0;
    async function refresh() {
      const version = ++sequence;
      try {
        const values = await getPublicProfiles(targets);
        if (!alive || version !== sequence) return;
        setProfiles(Object.fromEntries(values.map(value => [value.idUtilisateur, value])));
      } catch { /* Une panne de profil ne masque pas les messages. */ }
    }
    void refresh();
    const unfollow = tracker?.follow(targets);
    let offProfile: (() => void) | undefined;
    try {
      offProfile = realtime?.subscribe?.('profil.changed', () => void refresh());
    } catch { /* Le REST reste disponible pendant la configuration de session. */ }
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 30_000);
    return () => { alive = false; sequence++; clearInterval(timer); unfollow?.(); offProfile?.(); };
  }, [key, realtime, tracker]);
  return Object.fromEntries(Object.entries(profiles).map(([id, value]) => [
    id,
    { ...value, online: value.actif && (tracker?.isOnline(id) ?? true) },
  ]));
}
