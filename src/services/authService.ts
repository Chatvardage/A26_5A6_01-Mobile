import { apiFetch } from './httpClient';
import { ApiError } from './ApiError';
import { getTranslations } from '@/i18n';

export type AuthUser = { id: string; pseudo: string; courriel: string; role: string };
export type AuthResult = { jeton: string; refresh_token: string; utilisateur: AuthUser };
export type Registration = { pseudo: string; courriel: string; mot_de_passe: string };

export function isUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== 'object') return false;
  const u = value as Record<string, unknown>;
  return ['id', 'pseudo', 'courriel', 'role'].every((key) => typeof u[key] === 'string' && u[key] !== '');
}
export function isSession(value: unknown): value is AuthResult {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.jeton === 'string' &&
    s.jeton.length > 0 &&
    typeof s.refresh_token === 'string' &&
    s.refresh_token.length > 0 &&
    isUser(s.utilisateur)
  );
}
async function sessionRequest(path: string, body: unknown): Promise<AuthResult> {
  const result = await apiFetch<unknown>(
    path,
    { method: 'POST', body: JSON.stringify(body) },
    { authenticated: false },
  );
  if (!isSession(result)) throw new ApiError('invalid_response', getTranslations().errors.invalidSessionResponse);
  return { jeton: result.jeton, refresh_token: result.refresh_token, utilisateur: result.utilisateur };
}
export function login(identifiant: string, motDePasse: string) {
  return sessionRequest('/api/auth/login', { identifiant, mot_de_passe: motDePasse });
}
export function register(input: Registration) {
  return sessionRequest('/api/auth/register', input);
}
export function refresh(refreshToken: string) {
  return sessionRequest('/api/auth/refresh', { refresh_token: refreshToken });
}
export async function me(): Promise<AuthUser> {
  const result = await apiFetch<unknown>('/api/auth/me', {}, { retryUnauthorized: false });
  if (!isUser(result)) throw new ApiError('invalid_response', getTranslations().errors.invalidProfile);
  return result;
}
export function logout(refreshToken: string): Promise<void> {
  return apiFetch(
    '/api/auth/logout',
    { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }) },
    { authenticated: false },
  );
}

/**
 * Le mot de passe actuel est vérifié par Authentification (401 s'il est faux) : ce 401 ne doit ni renouveler
 * ni fermer la session, et s'affiche « Mot de passe actuel incorrect ».
 */
async function withCurrentPassword<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) throw new ApiError('wrong_password', getTranslations().errors.wrongPassword, 401);
    throw error;
  }
}

/** Nouveau mot de passe ; Authentification révoque alors tous les jetons, celui-ci compris. */
export function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return withCurrentPassword(() =>
    apiFetch<void>(
      '/api/auth/me',
      { method: 'PATCH', body: JSON.stringify({ mot_de_passe_actuel: currentPassword, mot_de_passe: newPassword }) },
      { retryUnauthorized: false },
    ),
  );
}

/** Suppression définitive du compte (données des autres services comprises). */
export function deleteAccount(currentPassword: string): Promise<void> {
  return withCurrentPassword(() =>
    apiFetch<void>(
      '/api/auth/me',
      { method: 'DELETE', body: JSON.stringify({ mot_de_passe_actuel: currentPassword }) },
      { retryUnauthorized: false },
    ),
  );
}

/**
 * Déconnecte tous les autres appareils : Authentification invalide toutes les sessions du compte et renvoie
 * une nouvelle session pour celui-ci.
 */
export async function logoutOthers(): Promise<AuthResult> {
  const result = await apiFetch<unknown>('/api/auth/logout-others', { method: 'POST' });
  if (!isSession(result)) throw new ApiError('invalid_response', getTranslations().errors.invalidSessionResponse);
  return { jeton: result.jeton, refresh_token: result.refresh_token, utilisateur: result.utilisateur };
}
