import { changePassword, deleteAccount, login, logoutOthers } from '@/services/authService';
import { apiFetch } from '@/services/httpClient';
import { ApiError } from '@/services/ApiError';

jest.mock('@/services/httpClient');
beforeEach(() => jest.mocked(apiFetch).mockReset());

it('transmet les identifiants au contrat de connexion et renvoie la session', async () => {
  const result = {
    jeton: 'token-test',
    refresh_token: 'refresh-test',
    utilisateur: { id: 'alice', pseudo: 'Alice', courriel: 'alice@example.test', role: 'user' },
  };
  jest.mocked(apiFetch).mockResolvedValueOnce(result);
  await expect(login('alice', 'password-test')).resolves.toEqual(result);
  expect(apiFetch).toHaveBeenCalledWith('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ identifiant: 'alice', mot_de_passe: 'password-test' }),
  }, { authenticated: false });
});

it('remonte l’erreur de connexion sans la masquer', async () => {
  const error = new ApiError('unauthorized', 'x', 401);
  jest.mocked(apiFetch).mockRejectedValueOnce(error);
  await expect(login('alice', 'invalid')).rejects.toBe(error);
});

it('modifie le mot de passe et supprime le compte avec le mot de passe actuel, sans renouveler la session', async () => {
  jest.mocked(apiFetch).mockResolvedValue(undefined);
  await changePassword('ancien-test', 'nouveau-test');
  expect(apiFetch).toHaveBeenLastCalledWith('/api/auth/me', {
    method: 'PATCH', body: JSON.stringify({ mot_de_passe_actuel: 'ancien-test', mot_de_passe: 'nouveau-test' }),
  }, { retryUnauthorized: false });
  await deleteAccount('ancien-test');
  expect(apiFetch).toHaveBeenLastCalledWith('/api/auth/me', {
    method: 'DELETE', body: JSON.stringify({ mot_de_passe_actuel: 'ancien-test' }),
  }, { retryUnauthorized: false });
});

it('traduit le refus du mot de passe actuel et laisse passer les autres erreurs', async () => {
  jest.mocked(apiFetch).mockRejectedValueOnce(new ApiError('unauthorized', 'x', 401));
  await expect(changePassword('faux', 'nouveau-test')).rejects.toMatchObject({ kind: 'wrong_password', status: 401 });
  const network = new ApiError('network', 'x');
  jest.mocked(apiFetch).mockRejectedValueOnce(network);
  await expect(deleteAccount('faux')).rejects.toBe(network);
});

it('déconnecte les autres appareils et renvoie la nouvelle session de celui-ci', async () => {
  const session = { jeton: 'nouveau', refresh_token: 'refresh', utilisateur: { id: 'alice', pseudo: 'Alice', courriel: 'alice@example.test', role: 'utilisateur' } };
  jest.mocked(apiFetch).mockResolvedValueOnce(session);
  await expect(logoutOthers()).resolves.toEqual(session);
  expect(apiFetch).toHaveBeenLastCalledWith('/api/auth/logout-others', { method: 'POST' });
  jest.mocked(apiFetch).mockResolvedValueOnce({ jeton: '' });
  await expect(logoutOthers()).rejects.toMatchObject({ kind: 'invalid_response' });
});
