const { buildApiUrl, isPrivateIpv4, updateEnvContent } = require('./update-api-ip');

test('reconnaît les IPv4 privées et exclut les autres adresses', () => {
  expect(isPrivateIpv4('192.168.1.10')).toBe(true);
  expect(isPrivateIpv4('172.31.0.4')).toBe(true);
  expect(isPrivateIpv4('8.8.8.8')).toBe(false);
  expect(isPrivateIpv4('192.168.1.999')).toBe(false);
});

test('force le port 3000 sous Linux natif et conserve le chemin de l URL existante', () => {
  expect(buildApiUrl('http://192.168.1.10:3006/api', '192.168.1.20')).toBe('http://192.168.1.20:3000/api');
});

test('remplace seulement la variable API dans le fichier env', () => {
  const content = '# commentaire\nOTHER=value\nEXPO_PUBLIC_API_URL=http://192.168.1.10:3000\n';
  expect(updateEnvContent(content, 'http://192.168.1.20:3000')).toBe(
    '# commentaire\nOTHER=value\nEXPO_PUBLIC_API_URL=http://192.168.1.20:3000\n',
  );
});
