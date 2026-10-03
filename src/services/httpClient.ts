import { API_URL } from '@/config/env';

import { ApiError, kindFromStatus } from './ApiError';

const REQUEST_TIMEOUT_MS = 10_000;

type TokenProvider = () => string | null;

// Configuration volontairement globale : la couche session la branche une seule fois au démarrage
// (`configureHttpClient`), pour que les services n'aient ni à connaître le jeton ni à le recevoir.
// Les tests qui l'appellent réinitialisent l'état avec `resetHttpClient()` (afterEach).
let tokenProvider: TokenProvider = () => null;
let onUnauthorized: (() => void) | null = null;

/** Branché par la couche session : le client HTTP ne sait pas où le jeton est stocké. */
export function configureHttpClient(options: { getToken: TokenProvider; onUnauthorized?: () => void }) {
  tokenProvider = options.getToken;
  onUnauthorized = options.onUnauthorized ?? null;
}

/** Remet la configuration par défaut (aucun jeton). Réservé aux tests, pour les isoler entre eux. */
export function resetHttpClient() {
  tokenProvider = () => null;
  onUnauthorized = null;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = tokenProvider();
  let response: Response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch (error) {
    // Le délai dépassé (abort du AbortController) est distingué d'une panne réseau.
    if (error instanceof Error && error.name === 'AbortError') throw new ApiError('timeout', 'Request timed out');
    throw new ApiError('network', 'Network request failed');
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      if (typeof body?.erreur === 'string') detail = body.erreur;
      else if (typeof body?.message === 'string') detail = body.message;
    } catch {
      // corps non JSON : on garde le statut
    }
    // Sans jeton, un 401 est une réponse normale (ex. mauvais mot de passe à la connexion) :
    // seule l'expiration d'une session existante déclenche la déconnexion.
    if (response.status === 401 && token) onUnauthorized?.();
    throw new ApiError(kindFromStatus(response.status), detail, response.status);
  }

  // Les réponses 204 n'ont pas de corps : l'appelant doit typer l'appel `apiFetch<void>`.
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
