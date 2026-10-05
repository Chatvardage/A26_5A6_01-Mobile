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
} = {}) {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  const child = { on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
    handlers[event] = handler;
  }) };
  const spawn = jest.fn(() => child);
  const spawnSync = jest.fn();
  const exit = jest.fn(() => { throw new Error('process.exit'); });
  const consoleMock = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const resolve = jest.fn(() => {
    if (missingCli) throw new Error('Cannot find module expo/bin/cli');
    return '/project/node_modules/expo/bin/cli';
  });
  const requireMock = Object.assign((name: string) => {
    if (name === 'node:child_process') return { spawn, spawnSync };
    if (name === 'node:fs') return { readFileSync: (file: string) => file === '/proc/version' ? 'Microsoft WSL2' : '' };
    if (name === 'node:path') return path;
    throw new Error(`Unexpected module: ${name}`);
  }, { resolve });
  const context = {
    require: requireMock,
    __dirname: scriptDir,
    process: { platform, execPath: '/runtime/node', argv: ['node', 'start.js', ...args], env, exit },
    console: consoleMock,
  };
  const run = () => vm.runInNewContext(source, context);
  return { run, spawn, spawnSync, exit, consoleMock, handlers, resolve };
}

test.each(['win32', 'darwin'])('lance Expo avec le même Node sans npx sur %s', (platform) => {
  const launcher = runStart({ platform, args: ['--lan', '-c'], env: { CUSTOM: 'value' } });
  launcher.run();
  expect(launcher.resolve).toHaveBeenCalledWith('expo/bin/cli');
  expect(launcher.spawn).toHaveBeenCalledWith('/runtime/node',
    ['/project/node_modules/expo/bin/cli', 'start', '--lan', '-c'],
    { stdio: 'inherit', env: { CUSTOM: 'value' } });
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
