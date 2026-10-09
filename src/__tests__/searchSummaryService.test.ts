import { searchSummary } from '@/services/searchSummaryService';
import { apiFetch } from '@/services/httpClient';
import { lookupDisplayNames } from '@/services/usersService';
import { ApiError } from '@/services/ApiError';
jest.mock('@/services/httpClient');
jest.mock('@/services/usersService', () => ({ lookupDisplayNames: jest.fn() }));
const ID = '22222222-2222-4222-8222-222222222222';
const SERVER = '33333333-3333-4333-8333-333333333333';
const ROOM = '44444444-4444-4444-8444-444444444444';
const raw = { directMessages: [{ conversationId: `dm:${ID}`, count: 80 }], servers: [{ serverId: SERVER, count: 7, channels: [{ conversationId: `room:${ROOM}`, count: 7 }] }] };
beforeEach(() => {
  jest.mocked(apiFetch).mockReset().mockImplementation(async path => path === '/api/servers'
    ? [{ id: SERVER, nom: 'Chatvardage', salons: [{ id: ROOM, nom: 'annonces' }] }] : raw);
  jest.mocked(lookupDisplayNames).mockReset().mockResolvedValue({ [ID]: 'florenceead' });
});
it('enrichit les comptes exacts avec les noms, sans charger des messages', async () => {
  const signal = new AbortController().signal;
  expect(await searchSummary(' bonjour ', signal)).toEqual({
    directMessages: [{ conversationId: `dm:${ID}`, count: 80, title: 'florenceead' }],
    servers: [{ serverId: SERVER, title: 'Chatvardage', count: 7, channels: [{ conversationId: `room:${ROOM}`, title: '#annonces', count: 7 }] }],
  });
  expect(apiFetch).toHaveBeenCalledWith('/api/messages/search/summary?q=bonjour', { signal });
  expect(apiFetch).toHaveBeenCalledTimes(2);
});
it('ne montre pas les comptes nuls et ne charge pas de noms pour une réponse vide', async () => {
  jest.mocked(apiFetch).mockResolvedValue({ directMessages: [{ conversationId: `dm:${ID}`, count: 0 }], servers: [{ ...raw.servers[0], count: 0, channels: [{ conversationId: `room:${ROOM}`, count: 0 }] }] });
  expect(await searchSummary('bonjour')).toEqual({ directMessages: [], servers: [] });
  expect(apiFetch).toHaveBeenCalledTimes(1);
  expect(lookupDisplayNames).not.toHaveBeenCalled();
});
it('conserve les comptes si les noms sont indisponibles', async () => {
  jest.mocked(lookupDisplayNames).mockRejectedValue(new Error('réseau'));
  jest.mocked(apiFetch).mockImplementation(async path => { if (path === '/api/servers') throw new Error('réseau'); return raw; });
  expect((await searchSummary('bonjour')).directMessages[0].count).toBe(80);
});
it.each([null, {}, { servers: [] }, { directMessages: [], servers: [{}] }, { directMessages: [{ conversationId: `dm:${ID}`, count: -1 }], servers: [] }, { directMessages: [{ conversationId: `room:${ROOM}`, count: 1 }], servers: [] }])('refuse une réponse invalide %j', async response => {
  jest.mocked(apiFetch).mockResolvedValue(response);
  await expect(searchSummary('bonjour')).rejects.toMatchObject({ kind: 'invalid_response' });
});
it('refuse un texte trop court sans appel HTTP', async () => {
  await expect(searchSummary('a')).rejects.toMatchObject({ kind: 'bad_request' });
  expect(apiFetch).not.toHaveBeenCalled();
});
it.each(['unauthorized', 'forbidden', 'network'] as const)('propage l’erreur %s', async kind => {
  jest.mocked(apiFetch).mockRejectedValue(new ApiError(kind, 'échec'));
  await expect(searchSummary('bonjour')).rejects.toMatchObject({ kind });
});
it('garde les comptes sans nom si la liste des serveurs est mal formée', async () => {
  jest.mocked(apiFetch).mockImplementation(async path => (path === '/api/servers' ? { erreur: 'inattendu' } : raw));
  const result = await searchSummary('bonjour');
  expect(result.servers).toEqual([{ serverId: SERVER, title: undefined, count: 7, channels: [{ conversationId: `room:${ROOM}`, title: undefined, count: 7 }] }]);
});
