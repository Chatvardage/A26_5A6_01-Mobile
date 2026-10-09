import * as http from '@/services/httpClient';
import { fetchCanModerate, fetchServerChannels, fetchServers } from '@/services/serversService';

jest.mock('@/services/httpClient');
const apiFetch = http.apiFetch as jest.Mock;

const S = '44444444-4444-4444-8444-444444444444';
const C1 = '55555555-5555-4555-8555-555555555555';
const C2 = '66666666-6666-4666-8666-666666666666';
const server = {
  id: S,
  nom: 'Chatvardage',
  nombreMembres: 12,
  salons: [
    { id: C1, nom: 'annonces' },
    { id: C2, nom: 'general' },
  ],
};

beforeEach(() => apiFetch.mockReset());

describe('fetchServers', () => {
  it('utilise des compteurs nuls en l’absence de source', async () => {
    apiFetch.mockResolvedValue([server]);
    expect((await fetchServers())[0].unreadCount).toBe(0);
  });
  it('résume chaque serveur et additionne les non-lus de ses salons', async () => {
    apiFetch.mockResolvedValue([server]);
    const [result] = await fetchServers({
      getCounts: async () => ({ [`room:${C1}`]: 2, [`room:${C2}`]: 5, [`room:other`]: 9 }),
    });
    // Réponse d'activité invalide (ici la liste des serveurs) : aucune activité connue.
    expect(result).toEqual({ id: S, name: 'Chatvardage', memberCount: 12, channelIds: [C1, C2], unreadCount: 7, lastActivity: null });
  });

  it('trie du serveur le plus récemment actif au moins actif, sans activité en dernier', async () => {
    const calme = { ...server, id: 'calme', salons: [{ id: 'c3', nom: 'x' }] };
    const vide = { ...server, id: 'vide', salons: [{ id: 'c4', nom: 'y' }] };
    apiFetch.mockImplementation(async (path: string) =>
      path === '/api/messages/activity'
        ? { rooms: { [`room:${C1}`]: '2026-10-01T10:00:00.000Z', [`room:${C2}`]: '2026-10-08T10:00:00.000Z', 'room:c3': '2026-10-05T10:00:00.000Z' } }
        : [vide, calme, server],
    );
    const result = await fetchServers();
    expect(result.map((s) => s.id)).toEqual([S, 'calme', 'vide']);
    expect(result[0].lastActivity).toBe('2026-10-08T10:00:00.000Z');
    expect(apiFetch).toHaveBeenCalledWith('/api/messages/activity');
    // Activité indisponible : l'ordre de l'API est conservé.
    apiFetch.mockImplementation(async (path: string) => {
      if (path === '/api/messages/activity') throw new Error('503');
      return [vide, calme, server];
    });
    expect((await fetchServers()).map((s) => s.id)).toEqual(['vide', 'calme', S]);
  });

  it('classe une date d’activité illisible comme sans activité', async () => {
    const calme = { ...server, id: 'calme', salons: [{ id: 'c3', nom: 'x' }] };
    apiFetch.mockImplementation(async (path: string) =>
      path === '/api/messages/activity' ? { rooms: { [`room:${C1}`]: 'pas une date', 'room:c3': '2026-10-05T10:00:00.000Z' } } : [server, calme],
    );
    expect((await fetchServers()).map((s) => s.id)).toEqual(['calme', S]);
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

describe('fetchCanModerate', () => {
  const other = { id: 'autre-serveur', nom: 'Autre', nombreMembres: 3, salons: [{ id: 'salon-autre', nom: 'x' }] };

  it.each([
    ['moderateur', true],
    ['proprietaire', true],
    ['admin', true],
    ['membre', false],
  ])("lit le rôle effectif du serveur du salon : %s → %s", async (monRole, expected) => {
    apiFetch.mockResolvedValue([{ ...other, monRole: 'admin' }, { ...server, monRole }]);
    expect(await fetchCanModerate(`room:${C1}`)).toBe(expected);
    expect(apiFetch).toHaveBeenCalledWith('/api/servers');
  });

  it('répond non pour un message privé sans appel réseau', async () => {
    expect(await fetchCanModerate(`dm:${S}`)).toBe(false);
    expect(await fetchCanModerate('invalide')).toBe(false);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("répond non quand le salon n'est dans aucun serveur ou que le rôle est absent", async () => {
    apiFetch.mockResolvedValue([other]);
    expect(await fetchCanModerate(`room:${C1}`)).toBe(false);
    apiFetch.mockResolvedValue([server]);
    expect(await fetchCanModerate(`room:${C1}`)).toBe(false);
  });

  it('propage une erreur réseau', async () => {
    apiFetch.mockRejectedValueOnce(new Error('503'));
    await expect(fetchCanModerate(`room:${C1}`)).rejects.toThrow('503');
  });

  it.each([[null], [{ pas: 'une liste' }], ['texte']])('répond non pour une réponse inattendue (%j)', async (reponse) => {
    apiFetch.mockResolvedValue(reponse);
    expect(await fetchCanModerate(`room:${C1}`)).toBe(false);
  });

  it('ignore un serveur sans liste de salons ou nul', async () => {
    apiFetch.mockResolvedValue([null, { id: 'x', nom: 'X', nombreMembres: 1, monRole: 'admin' }, { ...server, monRole: 'moderateur' }]);
    expect(await fetchCanModerate(`room:${C1}`)).toBe(true);
  });
});
