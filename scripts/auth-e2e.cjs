/* Runs the actual Mobile HTTP/auth/session code through a real Gateway and Auth/PostgreSQL.
 * Build Serveur-API first. Point AUTH_E2E_SERVICE_URL at an isolated migrated Auth instance.
 * AUTH_E2E_JWT_SECRET must be that instance's temporary signing key (never a production key).
 * The native SecureStore API is replaced with an in-memory adapter only in this Node test.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const Module = require('node:module');

async function main() {
  assert.ok(process.env.AUTH_E2E_SERVICE_URL, 'Set AUTH_E2E_SERVICE_URL to an isolated Auth server');
  assert.ok(process.env.AUTH_E2E_JWT_SECRET, 'Set the temporary Auth signing key');
  process.env.AUTH_SERVICE_URL = process.env.AUTH_E2E_SERVICE_URL;
  process.env.AUTH_RATE_LIMIT_MAX = '100';
  let app;
  let gatewayUrl = process.env.AUTH_E2E_GATEWAY_URL;
  if (!gatewayUrl) {
    const { createApplication } = require('../../A26_5A6_01-Serveur-API/dist/main');
    app = await createApplication();
    await app.listen(0, '127.0.0.1');
    gatewayUrl = await app.getUrl();
  }
  let saved = null;
  const storage = {
    save: async (value) => {
      saved = structuredClone(value);
    },
    load: async () => saved,
    clear: async () => {
      saved = null;
    },
  };
  const cache = new Map();
  function load(relative) {
    const filename = path.resolve(__dirname, '..', 'src', relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const compiled = new Module(filename, module);
    cache.set(filename, compiled);
    compiled.filename = filename;
    compiled.paths = Module._nodeModulePaths(path.dirname(filename));
    const normalRequire = compiled.require.bind(compiled);
    compiled.require = (name) => {
      if (name === '@/config/env') return { API_URL: gatewayUrl };
      if (name === './storage.adapter') return { storage };
      if (name.startsWith('@/')) return load(name.slice(2) + '.ts');
      if (name.startsWith('./'))
        return load(
          path.relative(path.resolve(__dirname, '..', 'src'), path.resolve(path.dirname(filename), name)) + '.ts',
        );
      return normalRequire(name);
    };
    const source = fs.readFileSync(filename, 'utf8');
    compiled._compile(
      ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText,
      filename,
    );
    return compiled.exports;
  }
  const auth = load('services/authService.ts');
  const http = load('services/httpClient.ts');
  const { SessionManager } = load('session/SessionManager.ts');
  const suffix = crypto.randomBytes(5).toString('hex');
  const password = crypto.randomBytes(24).toString('hex');
  const registration = { pseudo: `e2e_${suffix}`, courriel: `e2e_${suffix}@example.com`, mot_de_passe: password };
  let manager = new SessionManager();
  let refreshRequests = 0;
  const realFetch = global.fetch;
  global.fetch = async (url, init) => {
    if (String(url).startsWith(gatewayUrl) && String(url).endsWith('/api/auth/refresh')) refreshRequests++;
    return realFetch(url, init);
  };
  function expire(token) {
    const [header, payload] = token.split('.');
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    claims.exp = Math.floor(Date.now() / 1000) - 3600;
    const content = `${header}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}`;
    return `${content}.${crypto.createHmac('sha256', process.env.AUTH_E2E_JWT_SECRET).update(content).digest('base64url')}`;
  }
  try {
    await manager.start();
    assert.equal(manager.state.status, 'signedOut');
    await manager.register(registration);
    assert.equal(manager.state.status, 'signedIn');
    assert.equal(saved.utilisateur.pseudo, registration.pseudo);
    assert.ok(!JSON.stringify(saved).includes(password));
    await assert.rejects(auth.register(registration), (error) => error.status === 409);
    await assert.rejects(auth.login(registration.pseudo, 'invalid-fixture'), (error) => error.status === 401);
    assert.equal(manager.state.status, 'signedIn');
    manager.dispose();
    manager = new SessionManager();
    await manager.start();
    assert.equal(manager.state.status, 'signedIn');
    manager.dispose();
    saved.jeton = expire(saved.jeton);
    manager = new SessionManager();
    refreshRequests = 0;
    await manager.start();
    assert.equal(manager.state.status, 'signedIn');
    assert.equal(refreshRequests, 1);
    const oldSession = structuredClone(saved);
    // Re-enter a session with an expired access token without running startup validation.
    const originalLogin = auth.login;
    auth.login = async () => ({ ...saved, jeton: expire(saved.jeton) });
    await manager.signIn(registration.pseudo, password);
    auth.login = originalLogin;
    refreshRequests = 0;
    const profiles = await Promise.all([
      http.apiFetch('/api/auth/me'),
      http.apiFetch('/api/auth/me'),
      http.apiFetch('/api/auth/me'),
    ]);
    assert.equal(refreshRequests, 1);
    assert.ok(profiles.every((profile) => profile.id === saved.utilisateur.id));
    assert.notEqual(saved.refresh_token, oldSession.refresh_token);
    await assert.rejects(auth.refresh(oldSession.refresh_token), (error) => error.status === 401);
    const current = structuredClone(saved);
    await manager.signOut();
    assert.equal(saved, null);
    assert.equal(manager.state.user, null);
    assert.equal(manager.state.status, 'signedOut');
    await assert.rejects(auth.refresh(current.refresh_token), (error) => error.status === 401);
    const rejected = await realFetch(`${gatewayUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${current.jeton}` },
    });
    assert.equal(rejected.status, 401);
    await manager.signIn(registration.pseudo, password);
    const invalidated = structuredClone(saved);
    const revoked = await http.apiFetch('/api/auth/logout-all', { method: 'POST' });
    assert.equal(revoked, undefined);
    manager.dispose();
    saved = invalidated;
    manager = new SessionManager();
    await manager.start();
    assert.equal(manager.state.status, 'signedOut');
    assert.equal(saved, null);
    console.log(
      'PASS: real Mobile -> Gateway -> Auth -> PostgreSQL: register, conflict, login, restore, refresh, concurrent 401, replay rejection, logout, revoked restoration.',
    );
  } finally {
    manager.dispose();
    global.fetch = realFetch;
    await app?.close();
  }
}
main().catch((error) => {
  console.error(
    'FAIL: authentication integration',
    error.name,
    String(error.stack)
      .split('\n')
      .filter((line) => line.trim().startsWith('at '))
      .slice(0, 3)
      .join('\n'),
  );
  process.exitCode = 1;
});
