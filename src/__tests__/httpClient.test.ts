import { ApiError, userMessage } from '@/services/ApiError';
import { apiFetch, configureHttpClient, resetHttpClient } from '@/services/httpClient';

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  resetHttpClient();
  jest.useRealTimers();
});

describe('apiFetch', () => {
  it('transmet une annulation en cours sans la convertir en erreur réseau ou délai', async () => {
    const controller = new AbortController();
    const abort = Object.assign(new Error('annulation'), { name: 'AbortError' });
    global.fetch = jest.fn((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(abort));
    }));
    const removeListener = jest.spyOn(controller.signal, 'removeEventListener');
    const pending = apiFetch('/x', { signal: controller.signal });
    const assertion = expect(pending).rejects.toBe(abort);
    controller.abort();
    await assertion;
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
    removeListener.mockRestore();
  });

  it('transmet aussi un signal déjà annulé au transport', async () => {
    const controller = new AbortController();
    controller.abort();
    const abort = Object.assign(new Error('annulation'), { name: 'AbortError' });
    const fetchMock = jest.fn().mockRejectedValue(abort);
    global.fetch = fetchMock;
    await expect(apiFetch('/x', { signal: controller.signal })).rejects.toBe(abort);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it('renvoie le JSON, les en-têtes personnalisés et les réponses sans corps', async () => {
    const fetch = jest.fn().mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'one' }) })
      .mockResolvedValueOnce({ ok: true, status: 204 });
    global.fetch = fetch;
    configureHttpClient({ getToken: () => 'token-test' });
    await expect(apiFetch('/x', { method: 'POST', body: '{"content":"test"}', headers: { 'X-Test': 'yes' } })).resolves.toEqual({ id: 'one' });
    expect(fetch.mock.calls[0][1]).toMatchObject({
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Test': 'yes' },
      method: 'POST',
    });
    await expect(apiFetch<void>('/x')).resolves.toBeUndefined();
  });

  it('déclenche AbortController après dix secondes', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('timeout'), { name: 'AbortError' })));
    }));
    const pending = apiFetch('/x');
    const assertion = expect(pending).rejects.toMatchObject({ kind: 'timeout' });
    await jest.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(jest.getTimerCount()).toBe(0);
  });

  it('ne divulgue pas le détail du serveur et garde le statut si le corps n’est pas JSON', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ message: 'détail' }) })
      .mockResolvedValueOnce({ ok: false, status: 502, json: async () => { throw new SyntaxError('HTML'); } });
    await expect(apiFetch('/x')).rejects.toMatchObject({ kind: 'server', message: 'HTTP 500' });
    await expect(apiFetch('/x')).rejects.toMatchObject({ kind: 'server', message: 'HTTP 502' });
  });
  it('distingue un délai dépassé d’une panne réseau', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    global.fetch = jest.fn().mockRejectedValue(abort);
    await expect(apiFetch('/x')).rejects.toMatchObject({ kind: 'timeout' });

    global.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    await expect(apiFetch('/x')).rejects.toMatchObject({ kind: 'network' });
  });

  it('traduit un code HTTP et le message { erreur } de l’API', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ erreur: 'interdit' }),
    });
    const error = await apiFetch('/x').catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      kind: 'forbidden',
      status: 403,
      message: 'HTTP 403',
    });
  });

  it('donne un message utilisateur propre à chaque cas', () => {
    expect(userMessage(new ApiError('timeout', 'x'))).toMatch(/trop de temps/);
    expect(userMessage(new ApiError('bad_request', 'x'))).toMatch(/invalide/);
    expect(userMessage(new ApiError('rate_limited', 'x'))).toMatch(/rapidement/);
    expect(userMessage(new Error('boom'))).toBe('Une erreur est survenue.');
  });

  it('reconnaît les erreurs HTTP 400 et 429', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({}) });
    await expect(apiFetch('/x')).rejects.toMatchObject({ kind: 'bad_request' });
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
    await expect(apiFetch('/x')).rejects.toMatchObject({ kind: 'rate_limited' });
  });
});

describe('configuration du client', () => {
  it('n’envoie pas de jeton avant la première configuration du client', async () => {
    let freshClient!: typeof import('@/services/httpClient');
    jest.isolateModules(() => {
      freshClient = jest.requireActual<typeof import('@/services/httpClient')>('@/services/httpClient');
    });
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 'public' }) });
    global.fetch = fetchMock;
    await expect(freshClient.apiFetch('/public')).resolves.toEqual({ id: 'public' });
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ Accept: 'application/json' });
  });

  it('joint le jeton, déconnecte sur un 401 avec jeton, mais pas sans jeton', async () => {
    const onUnauthorized = jest.fn();
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    global.fetch = fetchMock;

    await apiFetch('/x').catch(() => undefined);
    expect(onUnauthorized).not.toHaveBeenCalled();

    configureHttpClient({ getToken: () => 'jeton-test', onUnauthorized });
    await apiFetch('/x').catch(() => undefined);
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer jeton-test');
    expect(onUnauthorized).toHaveBeenCalledTimes(1);

    resetHttpClient();
    await apiFetch('/x').catch(() => undefined);
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBeUndefined();
  });
});
