import { ApiError, userMessage } from '@/services/ApiError';
import { apiFetch } from '@/services/httpClient';

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

describe('apiFetch', () => {
  it('distingue un délai dépassé d’une panne réseau', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    global.fetch = jest.fn().mockRejectedValue(abort);
    await expect(apiFetch('/x')).rejects.toMatchObject({ kind: 'timeout' });

    global.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    await expect(apiFetch('/x')).rejects.toMatchObject({ kind: 'network' });
  });

  it('traduit un code HTTP et le message { erreur } de l’API', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ erreur: 'interdit' }) });
    const error = await apiFetch('/x').catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'forbidden', status: 403, message: 'interdit' });
  });

  it('donne un message utilisateur propre à chaque cas', () => {
    expect(userMessage(new ApiError('timeout', 'x'))).toMatch(/trop de temps/);
    expect(userMessage(new Error('boom'))).toBe('Une erreur est survenue.');
  });
});
