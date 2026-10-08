import * as SecureStore from 'expo-secure-store';
import { storage } from '@/session/storage.adapter';
import * as auth from '@/services/authService';
import { apiFetch, configureHttpClient, resetHttpClient } from '@/services/httpClient';
import { ApiError, kindFromStatus, userMessage } from '@/services/ApiError';

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 7,
}));
const user = { id: 'u', pseudo: 'alice', courriel: 'alice@example.com', role: 'utilisateur' };
const session = { jeton: 'access-fixture', refresh_token: 'refresh-fixture', utilisateur: user };
const fetchMock = jest.fn();
const response = (status: number, body: unknown = {}) => ({ ok: status < 400, status, json: async () => body });
beforeEach(() => {
  jest.resetAllMocks();
  global.fetch = fetchMock;
  resetHttpClient();
});
afterEach(() => {
  resetHttpClient();
  jest.useRealTimers();
});

describe('secure storage', () => {
  it('saves only session credentials, loads and clears', async () => {
    await storage.save({ ...session, password: 'must-not-persist' } as typeof session);
    const stored = jest.mocked(SecureStore.setItemAsync).mock.calls[0][1];
    expect(stored).not.toContain('password');
    expect(stored).not.toContain('must-not-persist');
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(stored);
    expect(await storage.load()).toEqual(session);
    await storage.clear();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
  });
  it('handles absence and corrupt or invalid data', async () => {
    jest
      .mocked(SecureStore.getItemAsync)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('{')
      .mockResolvedValueOnce('{}');
    expect(await storage.load()).toBeNull();
    expect(await storage.load()).toBeNull();
    expect(await storage.load()).toBeNull();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledTimes(2);
  });
  it('reports read/write/delete errors without native details', async () => {
    for (const method of [SecureStore.getItemAsync, SecureStore.setItemAsync, SecureStore.deleteItemAsync])
      jest.mocked(method).mockRejectedValue(new Error('sensitive-native-detail'));
    await expect(storage.save(session)).rejects.toMatchObject({ kind: 'storage' });
    await expect(storage.load()).rejects.toMatchObject({ kind: 'storage' });
    await expect(storage.clear()).rejects.toMatchObject({ kind: 'storage' });
  });
});

describe('auth service through HTTP', () => {
  it('login, register, refresh, me and logout follow the backend contract', async () => {
    configureHttpClient({ getToken: () => session.jeton });
    fetchMock
      .mockResolvedValueOnce(response(200, session))
      .mockResolvedValueOnce(response(201, session))
      .mockResolvedValueOnce(response(200, session))
      .mockResolvedValueOnce(response(200, user))
      .mockResolvedValueOnce(response(204));
    expect(await auth.login('alice', 'password-fixture')).toEqual(session);
    expect(await auth.register({ pseudo: 'alice', courriel: user.courriel, mot_de_passe: 'password-fixture' })).toEqual(
      session,
    );
    expect(await auth.refresh(session.refresh_token)).toEqual(session);
    expect(await auth.me()).toEqual(user);
    expect(await auth.logout(session.refresh_token)).toBeUndefined();
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      identifiant: 'alice',
      mot_de_passe: 'password-fixture',
    });
    expect(fetchMock.mock.calls[3][1].headers.Authorization).toBe(`Bearer ${session.jeton}`);
  });
  it.each([400, 401, 409, 429, 500])('handles status %s without exposing server data', async (status) => {
    fetchMock.mockResolvedValue(response(status, { erreur: 'sensitive-data' }));
    await expect(auth.login('alice', 'bad')).rejects.toMatchObject({ status, message: `HTTP ${status}` });
    await expect(
      auth.register({ pseudo: 'alice', courriel: user.courriel, mot_de_passe: 'bad' }),
    ).rejects.toMatchObject({ status });
  });
  it('rejects invalid sessions, profiles and malformed JSON', async () => {
    for (const value of [
      null,
      1,
      {},
      { ...session, jeton: '' },
      { ...session, refresh_token: '' },
      { ...session, utilisateur: {} },
    ]) {
      fetchMock.mockResolvedValue(response(200, value));
      await expect(auth.refresh('fixture')).rejects.toMatchObject({ kind: 'invalid_response' });
    }
    fetchMock.mockResolvedValue(response(200, {}));
    await expect(auth.me()).rejects.toMatchObject({ kind: 'invalid_response' });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('bad JSON');
      },
    });
    await expect(auth.login('a', 'b')).rejects.toMatchObject({ kind: 'invalid_response' });
  });
  it('handles network and real timeout including response body', async () => {
    fetchMock.mockRejectedValue(new Error('network-details'));
    await expect(auth.login('a', 'b')).rejects.toMatchObject({ kind: 'network' });
    jest.useFakeTimers();
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init.signal.addEventListener('abort', () => reject(Object.assign(new Error(), { name: 'AbortError' }))),
        ),
    );
    const pending = expect(auth.login('a', 'b')).rejects.toMatchObject({ kind: 'timeout' });
    await jest.advanceTimersByTimeAsync(10_000);
    await pending;
    fetchMock.mockImplementation((_url, init) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          new Promise((_resolve, reject) =>
            init.signal.addEventListener('abort', () => reject(Object.assign(new Error(), { name: 'AbortError' }))),
          ),
      }),
    );
    const body = expect(auth.login('a', 'b')).rejects.toMatchObject({ kind: 'timeout' });
    await jest.advanceTimersByTimeAsync(10_000);
    await body;
  });
});

describe('401 renewal', () => {
  it('shares a single refresh across concurrent and late 401s', async () => {
    let token = 'old';
    let finish!: () => void;
    const refreshSession = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = () => {
            token = 'new';
            resolve();
          };
        }),
    );
    const onUnauthorized = jest.fn();
    configureHttpClient({ getToken: () => token, refreshSession, onUnauthorized });
    fetchMock.mockImplementation((_url, init) =>
      Promise.resolve(response(init.headers.Authorization === 'Bearer old' ? 401 : 200, { ok: true })),
    );
    const a = apiFetch('/protected');
    const b = apiFetch('/protected');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(refreshSession).toHaveBeenCalledTimes(1);
    finish();
    expect(await Promise.all([a, b])).toEqual([{ ok: true }, { ok: true }]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
  it('never retries twice, clears on second 401, public login never triggers refresh', async () => {
    let token = 'old';
    const refreshSession = jest.fn(async () => {
      token = 'new';
    });
    const onUnauthorized = jest.fn();
    configureHttpClient({ getToken: () => token, refreshSession, onUnauthorized });
    fetchMock.mockResolvedValue(response(401));
    await expect(apiFetch('/protected')).rejects.toMatchObject({ status: 401 });
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    await expect(auth.login('a', 'bad')).rejects.toMatchObject({ status: 401 });
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
  it('does not retry a failed refresh', async () => {
    const refreshSession = jest.fn().mockRejectedValue(new ApiError('unauthorized', 'expired'));
    configureHttpClient({ getToken: () => 'old', refreshSession });
    fetchMock.mockResolvedValue(response(401));
    await expect(apiFetch('/x')).rejects.toThrow('expired');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('does not replay across a changed HTTP owner or cleared token', async () => {
    configureHttpClient({
      getToken: () => 'old',
      refreshSession: async () => {
        resetHttpClient();
      },
    });
    fetchMock.mockResolvedValue(response(401));
    await expect(apiFetch('/x')).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('safe error messages', () => {
  it.each([400, 401, 403, 404, 409, 429, 500, 418])('maps %s', (status) => {
    expect(userMessage(new ApiError(kindFromStatus(status), 'sensitive', status))).not.toContain('sensitive');
  });
  it.each(['storage', 'invalid_response', 'network', 'timeout'] as const)('maps %s', (kind) =>
    expect(userMessage(new ApiError(kind, 'sensitive'))).not.toContain('sensitive'),
  );
});

it('validates malformed user primitives', () => {
  for (const value of [null, 1, 'user']) expect(auth.isUser(value)).toBe(false);
});
it('late 401 reuses the newer access without a second renewal', async () => {
  let token = 'old';
  let late!: (value: unknown) => void;
  const refreshSession = jest.fn(async () => {
    token = 'new';
  });
  configureHttpClient({ getToken: () => token, refreshSession });
  fetchMock
    .mockImplementationOnce(() => Promise.resolve(response(401)))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          late = resolve;
        }),
    )
    .mockResolvedValue(response(200, { ok: true }));
  const a = apiFetch('/a');
  const b = apiFetch('/b');
  await a;
  late(response(401));
  await b;
  expect(refreshSession).toHaveBeenCalledTimes(1);
});
it('non-401 retry errors do not clear a session', async () => {
  let token = 'old';
  const onUnauthorized = jest.fn();
  configureHttpClient({
    getToken: () => token,
    refreshSession: async () => {
      token = 'new';
    },
    onUnauthorized,
  });
  fetchMock.mockResolvedValueOnce(response(401)).mockResolvedValueOnce(response(500));
  await expect(apiFetch('/a')).rejects.toMatchObject({ status: 500 });
  expect(onUnauthorized).not.toHaveBeenCalled();
});
it('does not replay a request from a previous session generation', async () => {
  let late!: (value: unknown) => void;
  const onUnauthorized = jest.fn();
  configureHttpClient({ getToken: () => 'old', onUnauthorized });
  fetchMock.mockReturnValue(
    new Promise((resolve) => {
      late = resolve;
    }),
  );
  const request = apiFetch('/a');
  resetHttpClient();
  late(response(401));
  await expect(request).rejects.toMatchObject({ status: 401 });
  expect(onUnauthorized).not.toHaveBeenCalled();
});

it('a shared refresh superseded by reconfiguration cannot replay old requests', async () => {
  let resolve!: () => void;
  const pending = new Promise<void>((done) => {
    resolve = done;
  });
  configureHttpClient({ getToken: () => 'old', refreshSession: () => pending });
  fetchMock.mockResolvedValue(response(401));
  const request = apiFetch('/a');
  const assertion = expect(request).rejects.toMatchObject({ status: 401 });
  for (let i = 0; i < 5; i++) await Promise.resolve();
  resetHttpClient();
  resolve();
  await assertion;
});
