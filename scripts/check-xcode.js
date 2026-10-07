const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const xcode = require('xcode');

const requireFromXcode = createRequire(require.resolve('xcode/package.json'));
assert.equal(requireFromXcode('uuid/package.json').version, '11.1.1');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chatvardage-xcode-'));
const projectPath = path.join(directory, 'project.pbxproj');
const groupId = '111111111111111111111111';
const initialFileId = '222222222222222222222222';
const fixture = `// !$*UTF8*$!
{
  archiveVersion = 1;
  classes = {};
  objectVersion = 56;
  objects = {
/* Begin PBXGroup section */
    ${groupId} = {
      isa = PBXGroup;
      children = (${initialFileId},);
      sourceTree = "<group>";
    };
/* End PBXGroup section */
/* Begin PBXFileReference section */
    ${initialFileId} = {
      isa = PBXFileReference;
      path = Seed.swift;
      sourceTree = "<group>";
    };
/* End PBXFileReference section */
  };
  rootObject = ${groupId};
}
`;

try {
  fs.writeFileSync(projectPath, fixture);
  const project = xcode.project(projectPath).parseSync();
  const generated = new Set();
  for (let index = 0; index < 100; index++) {
    const id = project.generateUuid();
    assert.match(id, /^[A-F0-9]{24}$/);
    assert.ok(!generated.has(id), 'Les identifiants Xcode doivent être uniques');
    generated.add(id);
  }

  const file = project.addFile('Smoke.swift', groupId);
  assert.ok(file, 'Le fichier doit être ajouté');
  assert.match(file.fileRef, /^[A-F0-9]{24}$/);
  assert.ok(project.getPBXGroupByKey(groupId).children.some((child) => child.value === file.fileRef));
  assert.equal(project.addFile('Smoke.swift', groupId), null);

  fs.writeFileSync(projectPath, project.writeSync());
  const reloaded = xcode.project(projectPath).parseSync();
  assert.ok(reloaded.hasFile('Smoke.swift'), 'Le fichier doit survivre à la sérialisation');
  assert.ok(reloaded.allUuids().includes(file.fileRef));
  reloaded.removeFile('Smoke.swift', groupId);
  assert.ok(!reloaded.hasFile('Smoke.swift'));
  fs.writeFileSync(projectPath, reloaded.writeSync());
  assert.ok(!xcode.project(projectPath).parseSync().hasFile('Smoke.swift'));
  console.log('Compatibilité xcode / uuid 11.1.1 : identifiants, ajout, suppression et sérialisation validés.');
} finally {
  if (fs.existsSync(projectPath)) fs.unlinkSync(projectPath);
  fs.rmdirSync(directory);
}
