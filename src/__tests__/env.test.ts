import { isLocalHost, resolveApiUrl } from '@/config/env';

describe('resolveApiUrl', () => {
  it("privilégie la variable d'environnement et retire le / final", () => {
    expect(resolveApiUrl('http://10.0.0.121:3001/', '192.168.0.5:8081')).toBe('http://10.0.0.121:3001');
  });
  it('déduit la machine qui sert Metro', () => {
    expect(resolveApiUrl(undefined, '192.168.0.5:8081')).toBe('http://192.168.0.5:3000');
    expect(resolveApiUrl('  ', '192.168.0.5:8081')).toBe('http://192.168.0.5:3000');
  });
  it('ignore un tunnel et retombe sur localhost', () => {
    expect(resolveApiUrl(undefined, 'abc-anonymous-8082.exp.direct')).toBe('http://localhost:3000');
  });
  it('retombe sur localhost sans information', () => {
    expect(resolveApiUrl(undefined, null)).toBe('http://localhost:3000');
  });
});

describe('isLocalHost', () => {
  it.each(['localhost', 'poste.local', '10.0.0.121', '192.168.1.5', '172.16.0.1', '172.31.255.1', '127.0.0.1', '169.254.1.2'])('accepte %s', (h) =>
    expect(isLocalHost(h)).toBe(true),
  );
  it.each(['abc-anonymous-8082.exp.direct', 'x.trycloudflare.com', 'x.loca.lt', '8.8.8.8', '172.32.0.1', '172.15.0.1', '169.253.1.2'])('refuse %s', (h) =>
    expect(isLocalHost(h)).toBe(false),
  );
  it('ignore un tunnel quel que soit le fournisseur', () => {
    expect(resolveApiUrl(undefined, 'x.trycloudflare.com:443')).toBe('http://localhost:3000');
  });
});
