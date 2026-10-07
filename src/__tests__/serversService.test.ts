import * as http from '@/services/httpClient';
import { fetchServerChannels, fetchServers } from '@/services/serversService';

jest.mock('@/services/httpClient');
const apiFetch = http.apiFetch as jest.Mock;

const S = '44444444-4444-4444-8444-444444444444';
const C1 = '55555555-5555-4555-8555-555555555555';
const C2 = '66666666-6666-4666-8666-666666666666';
const server = { id: S, nom: 'Chatvardage', nombreMembres: 12, salons: [{ id: C1, nom: 'annonces' }, { id: C2, nom: 'general' }] };

beforeEach(() => apiFetch.mockReset());

describe('fetchServers', () => {
  it('utilise des compteurs nuls en l’absence de source', async () => {
    apiFetch.mockResolvedValue([server]);
    expect((await fetchServers())[0].unreadCount).toBe(0);
  });
  it('résume chaque serveur et additionne les non-lus de ses salons', async () => {
    apiFetch.mockResolvedValue([server]);
    const [result] = await fetchServers({ getCounts: async () => ({ [`room:${C1}`]: 2, [`room:${C2}`]: 5, [`room:other`]: 9 }) });
    expect(result).toEqual({ id: S, name: 'Chatvardage', memberCount: 12, channelIds: [C1, C2], unreadCount: 7 });
  });

  it('ignore les compteurs négatifs et une source de non-lus en panne', async () => {
    apiFetch.mockResolvedValue([server]);
    expect((await fetchServers({ getCounts: async () => ({ [`room:${C1}`]: -4 }) }))[0].unreadCount).toBe(0);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect((await fetchServers({ getCounts: async () => Promise.reject(new Error('x')) }))[0].unreadCount).toBe(0);
    expect(warn).toHaveBeenCalled(); // la panne est journalisée, pas avalée
    warn.mockRestore();
  });
});

describe('fetchServerChannels', () => {
  it("garde l'ordre des salons de l'API et affiche le dernier message", async () => {
    apiFetch.mockImplementation(async (path: string) => {
      if (path === `/api/servers/${S}`) return server;
      if (path.startsWith(`/api/messages/rooms/${C1}/history`)) {
        return [{ id: 'm1', authorId: 'u1', content: 'bienvenue', createdAt: '2026-10-01T10:00:00Z' }];
      }
      return [];
    });
    const result = await fetchServerChannels(S, { getCounts: async () => ({ [`room:${C2}`]: 3 }) });
    expect(result.name).toBe('Chatvardage');
    expect(result.channels.map((c) => c.title)).toEqual(['#annonces', '#general']);
    expect(result.channels[0].lastMessage?.content).toBe('bienvenue');
    expect(result.channels[1]).toMatchObject({ lastMessage: null, unreadCount: 3 });
  });

  it("tolère l'échec du dernier message d'un salon (accès refusé)", async () => {
    apiFetch.mockImplementation(async (path: string) => {
      if (path === `/api/servers/${S}`) return server;
      throw new Error('403');
    });
    const result = await fetchServerChannels(S);
    expect(result.channels).toHaveLength(2);
    expect(result.channels.every((c) => c.lastMessage === null)).toBe(true);
  });

  it('propage une erreur sur le serveur lui-même', async () => {
    apiFetch.mockRejectedValue(new Error('404'));
    await expect(fetchServerChannels(S)).rejects.toThrow('404');
  });
});
