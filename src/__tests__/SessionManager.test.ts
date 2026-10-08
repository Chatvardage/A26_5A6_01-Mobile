import * as auth from '@/services/authService';
import { storage } from '@/session/storage.adapter';
import { SessionManager } from '@/session/SessionManager';
import { ApiError } from '@/services/ApiError';
import { apiFetch, resetHttpClient } from '@/services/httpClient';
import { createRealtimeService } from '@/services/websocketService';

jest.mock('@/services/websocketService', () => ({
  createRealtimeService: jest.fn(),
}));

const configureRealtime = jest.fn<void, [Parameters<ReturnType<typeof createRealtimeService>['configureRealtime']>[0]]>();
const disconnectRealtime = jest.fn();
jest.mock('@/session/storage.adapter', () => ({
  storage: { save: jest.fn(), load: jest.fn(), clear: jest.fn() },
}));
jest.mock('@/services/authService', () => ({
  login: jest.fn(),
  register: jest.fn(),
  me: jest.fn(),
  refresh: jest.fn(),
  logout: jest.fn(),
}));
const user = {
  id: 'u',
  pseudo: 'alice',
  courriel: 'a@example.com',
  role: 'utilisateur',
};
const session = {
  jeton: 'access-fixture',
  refresh_token: 'refresh-fixture',
  utilisateur: user,
};
const renewed = {
  ...session,
  jeton: 'new-access-fixture',
  refresh_token: 'new-refresh-fixture',
};
let manager: SessionManager;
beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(storage.load).mockResolvedValue(null);
  jest.mocked(storage.save).mockResolvedValue();
  jest.mocked(storage.clear).mockResolvedValue();
  jest.mocked(auth.logout).mockResolvedValue();
  jest.mocked(auth.login).mockResolvedValue(session);
  jest.mocked(auth.register).mockResolvedValue(session);
  jest.mocked(auth.me).mockResolvedValue(user);
  jest.mocked(auth.refresh).mockResolvedValue(renewed);
  jest.mocked(createRealtimeService).mockReturnValue({
    ...jest.requireActual<typeof import('@/services/websocketService')>('@/services/websocketService').createRealtimeService(),
    configureRealtime,
    disconnectRealtime,
  });
  manager = new SessionManager();
});
afterEach(() => {
  manager.dispose();
  resetHttpClient();
});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

it('configure le temps réel avant de publier la session restaurée', async () => {
  jest.mocked(storage.load).mockResolvedValue(session);
  const listener = jest.fn(() => {
    if (manager.state.status === 'signedIn') {
      expect(configureRealtime).toHaveBeenCalled();
    }
  });
  manager.subscribe(listener);
  await manager.start();
  const options = jest.mocked(configureRealtime).mock.calls[0][0];
  expect(options.getToken()).toBe(session.jeton);
  expect(manager.state.status).toBe('signedIn');
  await manager.refreshSession();
  expect(options.getToken()).toBe(renewed.jeton);
  expect(configureRealtime).toHaveBeenCalledTimes(2);
});

it.each(['signIn', 'register'] as const)('configure le temps réel après %s et efface la session révoquée', async (operation) => {
  await manager.start();
  expect(configureRealtime).not.toHaveBeenCalled();
  if (operation === 'signIn') await manager.signIn('alice', 'fixture');
  else await manager.register({ pseudo: 'alice', courriel: user.courriel, mot_de_passe: 'fixture' });
  const options = jest.mocked(configureRealtime).mock.calls[0][0];
  expect(options.getToken()).toBe(session.jeton);
  jest.mocked(disconnectRealtime).mockClear();
  options.onUnauthorized();
  expect(manager.state).toEqual({ status: 'signedOut', user: null, error: null });
  expect(options.getToken()).toBeNull();
  expect(disconnectRealtime).toHaveBeenCalledTimes(1);
});

it('ferme le temps réel à la déconnexion et à la destruction du gestionnaire', async () => {
  await manager.start();
  await manager.signIn('alice', 'fixture');
  jest.mocked(disconnectRealtime).mockClear();
  await manager.signOut();
  expect(disconnectRealtime).toHaveBeenCalledTimes(1);
  await manager.signIn('alice', 'fixture');
  manager.dispose();
  expect(disconnectRealtime).toHaveBeenCalledTimes(2);
  expect(jest.mocked(configureRealtime).mock.calls.at(-1)?.[0].getToken()).toBeNull();
});

it('preserves inaccessible secure storage and validates the session after retry', async () => {
  jest
    .mocked(storage.load)
    .mockRejectedValueOnce(new ApiError('storage', 'private native detail'))
    .mockResolvedValueOnce(session);
  await manager.start();
  expect(manager.state).toEqual({
    status: 'loading',
    user: null,
    error: 'Le stockage sécurisé est indisponible. Réessayez.',
  });
  expect(storage.clear).not.toHaveBeenCalled();
  expect(storage.save).not.toHaveBeenCalled();
  expect(auth.me).not.toHaveBeenCalled();
  await manager.restoreSession();
  expect(auth.me).toHaveBeenCalledTimes(1);
  expect(manager.state).toEqual({ status: 'signedIn', user, error: null });
});

it('ignores a late storage failure after logout', async () => {
  let reject!: (error: Error) => void;
  jest.mocked(storage.load).mockReturnValueOnce(
    new Promise((_resolve, fail) => {
      reject = fail;
    }),
  );
  const pending = manager.start();
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await manager.signOut();
  reject(new ApiError('storage', 'unavailable'));
  await pending;
  expect(manager.state).toEqual({ status: 'signedOut', user: null, error: null });
});

it('starts loading, restores absence to signedOut and notifies subscribers', async () => {
  const listener = jest.fn();
  const unsubscribe = manager.subscribe(listener);
  expect(manager.state.status).toBe('loading');
  await manager.start();
  expect(manager.state).toEqual({
    status: 'signedOut',
    user: null,
    error: null,
  });
  expect(listener).toHaveBeenCalled();
  unsubscribe();
});
it('restores validated profile, persisting the current user', async () => {
  jest.mocked(storage.load).mockResolvedValue(session);
  const pending = deferred<auth.AuthUser>();
  jest.mocked(auth.me).mockReturnValue(pending.promise);
  const restoration = manager.start();
  expect(manager.restoreSession()).toBe(restoration);
  await Promise.resolve();
  expect(manager.state.status).toBe('loading');
  pending.resolve({ ...user, pseudo: 'updated' });
  await restoration;
  expect(manager.state.user?.pseudo).toBe('updated');
  expect(storage.save).toHaveBeenCalledWith({
    ...session,
    utilisateur: { ...user, pseudo: 'updated' },
  });
});
it('restores expired access by real renewal', async () => {
  jest.mocked(storage.load).mockResolvedValue(session);
  jest.mocked(auth.me).mockRejectedValue(new ApiError('unauthorized', 'expired', 401));
  await manager.start();
  expect(auth.refresh).toHaveBeenCalledWith(session.refresh_token);
  expect(storage.save).toHaveBeenCalledWith(renewed);
  expect(manager.state.status).toBe('signedIn');
});
it.each(['refresh', 'validation', 'storage'] as const)('cleans restoration failure: %s', async (failure) => {
  jest.mocked(storage.load).mockResolvedValue(session);
  if (failure === 'storage') jest.mocked(storage.load).mockRejectedValue(new Error());
  else
    jest
      .mocked(auth.me)
      .mockRejectedValue(
        new ApiError(
          failure === 'refresh' ? 'unauthorized' : 'invalid_response',
          'failed',
          failure === 'refresh' ? 401 : undefined,
        ),
      );
  jest.mocked(auth.refresh).mockRejectedValue(new Error());
  await manager.start();
  expect(manager.state.status).toBe('signedOut');
  expect(manager.state.user).toBeNull();
  expect(storage.clear).toHaveBeenCalled();
});
it.each(['network', 'timeout', 'server', 'rate_limit'] as const)(
  'preserves storage and retries startup after %s',
  async (kind) => {
    jest.mocked(storage.load).mockResolvedValue(session);
    jest.mocked(auth.me).mockRejectedValueOnce(new ApiError(kind, 'private detail'));
    await manager.start();
    expect(manager.state).toMatchObject({ status: 'loading', user: null });
    expect(manager.state.error).toBeTruthy();
    expect(manager.state.error).not.toContain('private detail');
    expect(storage.clear).not.toHaveBeenCalled();
    expect(storage.save).not.toHaveBeenCalled();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    await apiFetch('/x');
    expect(jest.mocked(global.fetch).mock.calls[0][1]?.headers).not.toHaveProperty('Authorization');
    await manager.restoreSession();
    expect(manager.state).toEqual({ status: 'signedIn', user, error: null });
    expect(auth.me).toHaveBeenCalledTimes(2);
  },
);
it('login and register publish signedIn only after saving', async () => {
  await manager.start();
  const pending = deferred<void>();
  jest.mocked(storage.save).mockReturnValueOnce(pending.promise);
  const login = manager.signIn('alice', 'fixture');
  await Promise.resolve();
  expect(manager.state.status).toBe('signedOut');
  pending.resolve();
  await login;
  expect(manager.state.status).toBe('signedIn');
  await manager.signOut();
  await manager.register({
    pseudo: 'alice',
    courriel: user.courriel,
    mot_de_passe: 'fixture',
  });
  expect(manager.state.status).toBe('signedIn');
});
it('bad credentials and register conflict do not trigger logout', async () => {
  await manager.start();
  jest.mocked(storage.clear).mockClear();
  jest.mocked(auth.login).mockRejectedValue(new ApiError('unauthorized', 'bad', 401));
  jest.mocked(auth.register).mockRejectedValue(new ApiError('conflict', 'bad', 409));
  await expect(manager.signIn('a', 'b')).rejects.toMatchObject({ status: 401 });
  await expect(manager.register({ pseudo: 'a', courriel: 'b', mot_de_passe: 'c' })).rejects.toMatchObject({
    status: 409,
  });
  expect(storage.clear).not.toHaveBeenCalled();
  expect(auth.refresh).not.toHaveBeenCalled();
});
it('shares refresh and cleans failed renewal and HTTP credentials', async () => {
  await manager.start();
  await manager.signIn('a', 'b');
  const pending = deferred<auth.AuthResult>();
  jest.mocked(auth.refresh).mockReturnValueOnce(pending.promise);
  const a = manager.refreshSession();
  const b = manager.refreshSession();
  expect(a).toBe(b);
  pending.resolve(renewed);
  await a;
  expect(auth.refresh).toHaveBeenCalledTimes(1);
  expect(manager.state.status).toBe('signedIn');
  jest.mocked(auth.refresh).mockRejectedValue(new Error());
  await expect(manager.refreshSession()).rejects.toThrow();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  await apiFetch('/x');
  expect(jest.mocked(global.fetch).mock.calls[0][1]?.headers).not.toHaveProperty('Authorization');
  expect(manager.state.status).toBe('signedOut');
});
it.each([false, true])('local logout succeeds even with server failure %s', async (fail) => {
  await manager.start();
  await manager.signIn('a', 'b');
  if (fail) jest.mocked(auth.logout).mockRejectedValue(new Error());
  await manager.signOut();
  expect(storage.clear).toHaveBeenCalled();
  expect(manager.state.user).toBeNull();
  expect(manager.state.status).toBe('signedOut');
  expect(auth.logout).toHaveBeenCalledWith(session.refresh_token);
});
it('surfaces secure deletion failure while clearing memory', async () => {
  await manager.start();
  await manager.signIn('a', 'b');
  jest.mocked(storage.clear).mockRejectedValue(new Error());
  await manager.signOut();
  expect(manager.state.status).toBe('signedOut');
  expect(manager.state.error).toMatch(/effacé/);
});
it('save failure revokes the returned credentials and clears', async () => {
  await manager.start();
  jest.mocked(storage.save).mockRejectedValue(new Error('save failure'));
  await expect(manager.signIn('a', 'b')).rejects.toThrow('save failure');
  expect(auth.logout).toHaveBeenCalledWith(session.refresh_token);
  expect(manager.state.status).toBe('signedOut');
});
it('late login cannot resurrect logout', async () => {
  await manager.start();
  const pending = deferred<auth.AuthResult>();
  jest.mocked(auth.login).mockReturnValue(pending.promise);
  const login = manager.signIn('a', 'b');
  await manager.signOut();
  pending.resolve(session);
  await login;
  expect(storage.save).not.toHaveBeenCalled();
  expect(manager.state.status).toBe('signedOut');
  expect(auth.logout).toHaveBeenCalledWith(session.refresh_token);
});
it('logout waits behind an in-progress write and clears it, late refresh is revoked', async () => {
  await manager.start();
  await manager.signIn('a', 'b');
  const pending = deferred<void>();
  jest.mocked(storage.save).mockReturnValueOnce(pending.promise);
  const refresh = manager.refreshSession();
  await Promise.resolve();
  await Promise.resolve();
  const logout = manager.signOut();
  pending.resolve();
  await Promise.all([refresh, logout]);
  expect(manager.state.status).toBe('signedOut');
  expect(auth.logout).toHaveBeenCalledWith(renewed.refresh_token);
  expect(jest.mocked(storage.clear).mock.invocationCallOrder.at(-1)).toBeGreaterThan(
    jest.mocked(storage.save).mock.invocationCallOrder.at(-1)!,
  );
});
it('logout during storage load prevents restoration', async () => {
  const pending = deferred<auth.AuthResult | null>();
  jest.mocked(storage.load).mockReturnValue(pending.promise);
  const restoration = manager.start();
  await manager.signOut();
  pending.resolve(session);
  await restoration;
  expect(auth.me).not.toHaveBeenCalled();
  expect(manager.state.status).toBe('signedOut');
});
it('missing session refresh fails cleanly', async () => {
  await manager.start();
  await expect(manager.refreshSession()).rejects.toMatchObject({
    kind: 'unauthorized',
  });
});

it('restarts a disposed loading manager (StrictMode lifecycle)', async () => {
  const first = deferred<auth.AuthResult | null>();
  jest.mocked(storage.load).mockReturnValueOnce(first.promise).mockResolvedValueOnce(session);
  const old = manager.start();
  await Promise.resolve();
  await Promise.resolve();
  manager.dispose();
  const fresh = manager.start();
  first.resolve(session);
  await Promise.all([old, fresh]);
  expect(manager.state.status).toBe('signedIn');
});
it('failed persistence remains cleared when revoke also fails', async () => {
  await manager.start();
  jest.mocked(storage.save).mockRejectedValue(new Error());
  jest.mocked(auth.logout).mockRejectedValue(new Error());
  await expect(manager.signIn('a', 'b')).rejects.toThrow();
  expect(manager.state.status).toBe('signedOut');
});
it('logout while refresh is pending revokes its late result despite server failure', async () => {
  await manager.start();
  await manager.signIn('a', 'b');
  const pending = deferred<auth.AuthResult>();
  jest.mocked(auth.refresh).mockReturnValue(pending.promise);
  const renewal = manager.refreshSession();
  await manager.signOut();
  jest.mocked(auth.logout).mockRejectedValue(new Error());
  pending.resolve(renewed);
  await renewal;
  expect(manager.state.status).toBe('signedOut');
  expect(auth.logout).toHaveBeenCalledWith(renewed.refresh_token);
});
it('logout while profile validation is pending prevents restoration', async () => {
  jest.mocked(storage.load).mockResolvedValue(session);
  const pending = deferred<auth.AuthUser>();
  jest.mocked(auth.me).mockReturnValue(pending.promise);
  const restoration = manager.start();
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await manager.signOut();
  pending.resolve(user);
  await restoration;
  expect(manager.state.status).toBe('signedOut');
});

it('clears after a protected request remains unauthorized following renewal', async () => {
  await manager.start();
  await manager.signIn('a', 'b');
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 });
  await expect(apiFetch('/protected')).rejects.toMatchObject({ status: 401 });
  expect(manager.state.status).toBe('signedOut');
  expect(storage.clear).toHaveBeenCalled();
});
it('late rejected refresh cannot clear a newer session', async () => {
  await manager.start();
  await manager.signIn('a', 'b');
  let reject!: (error: Error) => void;
  jest.mocked(auth.refresh).mockReturnValueOnce(
    new Promise((_resolve, fail) => {
      reject = fail;
    }),
  );
  const pending = manager.refreshSession();
  const assertion = expect(pending).rejects.toThrow('offline');
  await manager.signOut();
  await manager.signIn('new', 'fixture');
  reject(new Error('offline'));
  await assertion;
  expect(manager.state.status).toBe('signedIn');
});
it('logout during validation rejection does not restart renewal', async () => {
  jest.mocked(storage.load).mockResolvedValue(session);
  let reject!: (error: Error) => void;
  jest.mocked(auth.me).mockReturnValueOnce(
    new Promise((_resolve, fail) => {
      reject = fail;
    }),
  );
  const restoration = manager.start();
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await manager.signOut();
  reject(new ApiError('unauthorized', 'expired', 401));
  await restoration;
  expect(auth.refresh).not.toHaveBeenCalled();
  expect(manager.state.status).toBe('signedOut');
});
it('storage write completing after logout cannot republish credentials, even if server revoke fails', async () => {
  await manager.start();
  await manager.signIn('a', 'b');
  const pending = deferred<void>();
  jest.mocked(storage.save).mockReturnValueOnce(pending.promise);
  const renewal = manager.refreshSession();
  for (let i = 0; i < 5; i++) await Promise.resolve();
  const logout = manager.signOut();
  jest.mocked(auth.logout).mockRejectedValue(new Error());
  pending.resolve();
  await Promise.all([renewal, logout]);
  expect(manager.state.status).toBe('signedOut');
});
it('a failed save after a concurrent logout does not change session state', async () => {
  await manager.start();
  let reject!: (error: Error) => void;
  jest.mocked(storage.save).mockReturnValueOnce(
    new Promise((_resolve, fail) => {
      reject = fail;
    }),
  );
  const login = manager.signIn('a', 'b');
  const assertion = expect(login).rejects.toThrow('save failed');
  for (let i = 0; i < 5; i++) await Promise.resolve();
  const logout = manager.signOut();
  reject(new Error('save failed'));
  await Promise.all([assertion, logout]);
  expect(manager.state.status).toBe('signedOut');
});
