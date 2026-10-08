import { login } from '@/services/authService';
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
