/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const scriptDir = path.resolve(__dirname, '../../scripts');
const source = fs.readFileSync(path.join(scriptDir, 'start.js'), 'utf8');

function runStart({
  platform = 'win32',
  args = [] as string[],
  missingCli = false,
  env = {} as Record<string, string>,
  dotEnvContent = '',
  networkInterfaces = { WiFi: [{ family: 'IPv4', internal: false, address: '192.168.1.20' }] },
} = {}) {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  const child = { on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
    handlers[event] = handler;
  }) };
  const spawn = jest.fn(
    (_command: string, _args: string[], _options: { stdio: string; env: Record<string, string | undefined> }) => child,
  );
  const spawnSync = jest.fn();
  const writeFileSync = jest.fn();
  const exit = jest.fn(() => { throw new Error('process.exit'); });
  const consoleMock = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const resolve = jest.fn(() => {
    if (missingCli) throw new Error('Cannot find module expo/bin/cli');
    return '/project/node_modules/expo/bin/cli';
  });
  const requireMock = Object.assign((name: string) => {
    if (name === 'node:child_process') return { spawn, spawnSync };
    if (name === 'node:fs') return {
      readFileSync: (file: string) => file === '/proc/version' ? 'Microsoft WSL2' : dotEnvContent,
      writeFileSync,
    };
    if (name === 'node:path') return path;
    if (name === './update-api-ip') return {
      buildApiUrl: (configuredUrl: string | null, ip: string) => configuredUrl
        ? (() => {
          const url = new URL(configuredUrl);
          url.hostname = ip;
          return url.toString().replace(/\/$/, '');
        })()
        : `http://${ip}:3000`,
      getLocalIpv4Addresses: () => Object.values(networkInterfaces)
        .flatMap((interfaces) => interfaces ?? [])
        .filter((network) => network.family === 'IPv4' && !network.internal)
        .map((network) => network.address),
      readConfiguredUrl: (content: string) => content.match(/^\s*EXPO_PUBLIC_API_URL\s*=\s*(\S+)\s*$/m)?.[1] ?? null,
      updateEnvContent: (content: string, apiUrl: string) => {
        const line = `EXPO_PUBLIC_API_URL=${apiUrl}`;
        const expression = /^(\s*EXPO_PUBLIC_API_URL\s*=\s*)[^\r\n]*$/m;
        return expression.test(content)
          ? content.replace(expression, line)
          : `${content.replace(/\s*$/, '')}\n${line}\n`;
      },
    };
    throw new Error(`Unexpected module: ${name}`);
  }, { resolve });
  const context = {
    require: requireMock,
    __dirname: scriptDir,
    process: { platform, execPath: '/runtime/node', argv: ['node', 'start.js', ...args], env, exit },
    console: consoleMock,
  };
  const run = () => vm.runInNewContext(source, context);
  return { run, spawn, spawnSync, writeFileSync, exit, consoleMock, handlers, resolve };
}

test.each(['win32', 'darwin'])('lance Expo avec le même Node sans npx sur %s', (platform) => {
  const launcher = runStart({ platform, args: ['--lan', '-c'], env: { CUSTOM: 'value' } });
  launcher.run();
  expect(launcher.resolve).toHaveBeenCalledWith('expo/bin/cli');
  expect(launcher.spawn).toHaveBeenCalledWith('/runtime/node',
    ['/project/node_modules/expo/bin/cli', 'start', '--lan', '-c'],
    { stdio: 'inherit', env: { CUSTOM: 'value' } });
});

test('met à jour l adresse API dans .env hors WSL2 avant de lancer Expo', () => {
  const launcher = runStart({ platform: 'win32' });

  launcher.run();

  expect(launcher.writeFileSync).toHaveBeenCalledWith(
    expect.stringContaining('.env'),
    '\nEXPO_PUBLIC_API_URL=http://192.168.1.20:3000\n',
  );
  expect(launcher.consoleMock.log).toHaveBeenCalledWith('[start] API mise à jour : http://192.168.1.20:3000');
});

test("ne remplace pas une URL déjà définie dans l'environnement hors WSL2", () => {
  const launcher = runStart({
    platform: 'win32',
    env: { EXPO_PUBLIC_API_URL: 'http://10.0.2.2:3000' },
  });

  launcher.run();

  expect(launcher.writeFileSync).not.toHaveBeenCalled();
});

test('actualise une URL déjà présente dans .env hors WSL2', () => {
  const launcher = runStart({
    platform: 'win32',
    dotEnvContent: 'EXPO_PUBLIC_API_URL=http://192.168.1.42:3000\n',
  });

  launcher.run();

  expect(launcher.writeFileSync).toHaveBeenCalledWith(
    expect.stringContaining('.env'),
    'EXPO_PUBLIC_API_URL=http://192.168.1.20:3000\n',
  );
});

test.each([
  { args: ['-c'], expected: ['--tunnel', '-c'] },
  { args: ['--lan', '-c'], expected: ['--lan', '-c'] },
  { args: ['--localhost'], expected: ['--localhost'] },
  { args: ['--tunnel'], expected: ['--tunnel'] },
])('préserve les options réseau sous WSL : $args', ({ args, expected }) => {
  const launcher = runStart({ platform: 'linux', args, env: { EXPO_PUBLIC_API_URL: 'http://192.168.1.10:3001' } });
  launcher.run();
  expect(launcher.spawn.mock.calls[0]).toEqual(['/runtime/node',
    ['/project/node_modules/expo/bin/cli', 'start', ...expected],
    { stdio: 'inherit', env: { EXPO_PUBLIC_API_URL: 'http://192.168.1.10:3001' } }]);
  expect(launcher.spawnSync).not.toHaveBeenCalled();
});

test('déduit le port mobile documenté lorsque WSL fournit automatiquement l’adresse Windows', () => {
  const launcher = runStart({ platform: 'linux' });
  launcher.spawnSync
    .mockReturnValueOnce({ status: 0, stdout: '192.168.1.10\r\n' })
    .mockReturnValueOnce({ status: 0, stdout: '0.0.0.0 3006 127.0.0.1 3000' });

  launcher.run();

  expect(launcher.spawn.mock.calls[0][2].env.EXPO_PUBLIC_API_URL).toBe('http://192.168.1.10:3006');
  expect(launcher.consoleMock.warn).not.toHaveBeenCalled();
});

test('signale une CLI absente et ne lance aucun processus', () => {
  const launcher = runStart({ missingCli: true });
  expect(launcher.run).toThrow('process.exit');
  expect(launcher.consoleMock.error).toHaveBeenCalledWith(expect.stringContaining('exécuter npm ci'));
  expect(launcher.exit).toHaveBeenCalledWith(1);
  expect(launcher.spawn).not.toHaveBeenCalled();
});

test('signale les erreurs de lancement et propage le code de sortie Expo', () => {
  const launcher = runStart();
  launcher.run();
  expect(() => launcher.handlers.error(new Error('spawn failed'))).toThrow('process.exit');
  expect(launcher.consoleMock.error).toHaveBeenCalledWith('[start] Impossible de lancer expo : spawn failed');
  expect(launcher.exit).toHaveBeenLastCalledWith(1);
  expect(() => launcher.handlers.exit(2)).toThrow('process.exit');
  expect(launcher.exit).toHaveBeenLastCalledWith(2);
});
