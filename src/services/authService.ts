import { apiFetch } from './httpClient';

export type AuthUser = { id: string; pseudo: string; courriel: string; role: string };
export type AuthResult = { jeton: string; utilisateur: AuthUser };

export function login(identifiant: string, motDePasse: string): Promise<AuthResult> {
  return apiFetch<AuthResult>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifiant, mot_de_passe: motDePasse }),
  });
}
