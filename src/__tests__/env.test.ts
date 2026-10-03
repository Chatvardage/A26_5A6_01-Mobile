import { resolveApiUrl } from '@/config/env';

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
