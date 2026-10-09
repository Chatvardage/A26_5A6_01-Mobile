const { buildApiUrl, isPrivateIpv4, updateEnvContent } = require('./update-api-ip');

test('reconnaît les IPv4 privées et exclut les autres adresses', () => {
  expect(isPrivateIpv4('192.168.1.10')).toBe(true);
  expect(isPrivateIpv4('172.31.0.4')).toBe(true);
  expect(isPrivateIpv4('8.8.8.8')).toBe(false);
  expect(isPrivateIpv4('192.168.1.999')).toBe(false);
});

test.each([
  ['Linux natif', 'linux', 'Linux version 6.8', '3000'],
  ['WSL', 'linux', 'Linux version 6.8 microsoft-standard-WSL2', '3006'],
  ['Windows', 'win32', '', '3006'],
])('choisit le port sur %s et conserve le chemin configuré', (_name, platform, version, port) => {
  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  const read = jest.spyOn(require('node:fs'), 'readFileSync').mockReturnValue(version);
  try {
    expect(buildApiUrl('http://192.168.1.10:3006/api', '192.168.1.20')).toBe(`http://192.168.1.20:${port}/api`);
  } finally {
    read.mockRestore();
    Object.defineProperty(process, 'platform', descriptor);
  }
});

test('remplace seulement la variable API dans le fichier env', () => {
  const content = '# commentaire\nOTHER=value\nEXPO_PUBLIC_API_URL=http://192.168.1.10:3000\n';
  expect(updateEnvContent(content, 'http://192.168.1.20:3000')).toBe(
    '# commentaire\nOTHER=value\nEXPO_PUBLIC_API_URL=http://192.168.1.20:3000\n',
  );
});
