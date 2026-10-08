/** @jest-environment node */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';

const source = fs.readFileSync(path.resolve(__dirname, '../../scripts/check-xcode.js'), 'utf8');

it.each(['write', 'parse'] as const)('nettoie uniquement son répertoire temporaire après un échec de %s', (step) => {
  const directory = path.join(os.tmpdir(), 'chatvardage-xcode-test');
  const failure = new Error('Échec de contrôle Xcode');
  const remove = jest.fn();
  const write = jest.fn(() => {
    if (step === 'write') throw failure;
  });
  const parse = jest.fn(() => { throw failure; });
  const createDirectory = jest.fn(() => directory);
  const requireMock = Object.assign((name: string) => {
    switch (name) {
      case 'node:assert/strict': return assert;
      case 'node:fs': return { mkdtempSync: createDirectory, writeFileSync: write, rmSync: remove };
      case 'node:os': return os;
      case 'node:path': return path;
      case 'node:module': return { createRequire: () => () => ({ version: '11.1.1' }) };
      case 'xcode': return { project: () => ({ parseSync: parse }) };
      default: throw new Error(`Module inattendu : ${name}`);
    }
  }, { resolve: () => 'xcode/package.json' });

  let propagated: unknown;
  try {
    vm.runInNewContext(source, { require: requireMock });
  } catch (error) {
    propagated = error;
  }
  expect(propagated).toBe(failure);
  expect(createDirectory).toHaveBeenCalledWith(path.join(os.tmpdir(), 'chatvardage-xcode-'));
  expect(write).toHaveBeenCalledWith(path.join(directory, 'project.pbxproj'), expect.any(String));
  expect(remove).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledWith(directory, { recursive: true, force: true });
  expect(parse).toHaveBeenCalledTimes(step === 'parse' ? 1 : 0);
});
