import * as http from '@/services/httpClient';
import { MIN_QUERY_LENGTH, normalizeQuery, searchMessages } from '@/services/searchService';

jest.mock('@/services/httpClient');
const apiFetch = http.apiFetch as jest.Mock;

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const ROOM = '33333333-3333-4333-8333-333333333333';
const dm = {
  conversationId: `dm:${OTHER}`,
  kind: 'dm',
  message: { id: 'm1', senderId: OTHER, recipientId: ME, content: 'bonjour', createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-02T10:00:00Z' },
};
const room = {
  conversationId: `room:${ROOM}`,
  kind: 'room',
  message: { id: 'm2', roomId: ROOM, authorId: ME, content: 'salut', createdAt: '2026-10-01T09:00:00Z' },
};

beforeEach(() => apiFetch.mockReset());

describe('normalizeQuery', () => {
  it('retire les espaces et refuse un texte trop court', () => {
    expect(normalizeQuery('  ab  ')).toBe('ab');
    expect(normalizeQuery(' a ')).toBeNull();
    expect(normalizeQuery('')).toBeNull();
    expect(MIN_QUERY_LENGTH).toBe(2);
    expect(normalizeQuery('x'.repeat(150))).toHaveLength(100);
  });
});

describe('searchMessages', () => {
  it("n'appelle pas l'API pour un texte trop court", async () => {
    await expect(searchMessages({ q: ' a ' })).rejects.toMatchObject({ kind: 'bad_request' });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('refuse une conversation invalide avant tout appel', async () => {
    await expect(searchMessages({ q: 'bonjour', conversationId: 'room:invalide' })).rejects.toMatchObject({ kind: 'not_found' });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('cherche dans toutes les conversations et enrichit les pseudos', async () => {
    apiFetch.mockImplementation(async (path: string) =>
      path.startsWith('/api/users/lookup')
        ? [
            { id: OTHER, pseudo: 'oli' },
            { id: ME, pseudo: 'mia' },
          ]
        : { results: [dm, room], nextCursor: 'curseur-2' },
    );
    const page = await searchMessages({ q: ' bonjour ', limit: 5 });
    expect(apiFetch).toHaveBeenNthCalledWith(1, '/api/messages/search?q=bonjour&limit=5', { signal: undefined });
    expect(page.nextCursor).toBe('curseur-2');
    expect(page.results).toEqual([
      {
        id: 'm1',
        conversationId: `dm:${OTHER}`,
        kind: 'dm',
        senderId: OTHER,
        senderName: 'oli',
        conversationTitle: 'oli',
        content: 'bonjour',
        createdAt: '2026-10-01T10:00:00Z',
        updatedAt: '2026-10-02T10:00:00Z',
      },
      {
        id: 'm2',
        conversationId: `room:${ROOM}`,
        kind: 'room',
        senderId: ME,
        senderName: 'mia',
        conversationTitle: undefined,
        content: 'salut',
        createdAt: '2026-10-01T09:00:00Z',
        updatedAt: '2026-10-01T09:00:00Z',
      },
    ]);
  });

  it('limite la recherche à une conversation et transmet curseur et signal', async () => {
    const controller = new AbortController();
    apiFetch.mockImplementation(async (path: string) =>
      path.startsWith('/api/users/lookup') ? [] : { results: [], nextCursor: null },
    );
    const page = await searchMessages({ q: 'texte', conversationId: `room:${ROOM}`, cursor: 'c1', signal: controller.signal });
    const [url, init] = apiFetch.mock.calls[0];
    expect(url).toBe(`/api/messages/search?q=texte&limit=20&cursor=c1&conversationId=room%3A${ROOM}`);
    expect(init.signal).toBe(controller.signal);
    expect(page).toEqual({ results: [], nextCursor: null });
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('ignore les entrées mal formées et un curseur vide, et tolère les pseudos indisponibles', async () => {
    const bad = [
      { conversationId: 'dm:xx', message: dm.message },
      { conversationId: dm.conversationId },
      { conversationId: dm.conversationId, message: { ...dm.message, id: 3 } },
      { conversationId: dm.conversationId, message: { ...dm.message, senderId: undefined } },
      { conversationId: room.conversationId, message: { ...room.message, authorId: undefined } },
    ];
    apiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith('/api/users/lookup')) throw new Error('503');
      return { results: [...bad, dm], nextCursor: '' };
    });
    const page = await searchMessages({ q: 'bonjour' });
    expect(page.results).toHaveLength(1);
    expect(page.results[0].senderName).toBeUndefined();
    expect(page.nextCursor).toBeNull();
  });

  it('rejette une réponse invalide', async () => {
    apiFetch.mockResolvedValue({ results: 'non' });
    await expect(searchMessages({ q: 'bonjour' })).rejects.toMatchObject({ kind: 'invalid_response' });
    apiFetch.mockResolvedValue(null);
    await expect(searchMessages({ q: 'bonjour' })).rejects.toMatchObject({ kind: 'invalid_response' });
  });

  it('propage les erreurs de l\'API', async () => {
    apiFetch.mockRejectedValue(Object.assign(new Error('503'), { kind: 'server' }));
    await expect(searchMessages({ q: 'bonjour' })).rejects.toMatchObject({ kind: 'server' });
  });

  describe('noms affichés', () => {
    const SERVERS = [{ id: 's', nom: 'Chatvardage', salons: [{ id: ROOM, nom: 'général' }, { id: 'autre', nom: 'x' }] }, { id: 't' }];
    const systemRoom = {
      conversationId: `room:${ROOM}`,
      kind: 'room',
      message: { id: 'm3', roomId: ROOM, authorId: 'system', content: 'Bienvenue', createdAt: '2026-10-01T08:00:00Z' },
    };

    it("n'envoie que des identifiants valides à l'annuaire, nomme le salon et laisse l'auteur système sans pseudo", async () => {
      apiFetch.mockImplementation(async (path: string) => {
        if (path.startsWith('/api/users/lookup')) return [{ id: ME, pseudo: 'mia' }];
        if (path === '/api/servers') return SERVERS;
        return { results: [room, systemRoom], nextCursor: null };
      });
      const page = await searchMessages({ q: 'bonjour' });
      const lookup = apiFetch.mock.calls.map((c) => c[0] as string).find((p) => p.startsWith('/api/users/lookup'))!;
      expect(lookup).toBe(`/api/users/lookup?ids=${ME}`);
      expect(page.results.map((r) => [r.senderName, r.conversationTitle, r.serverName])).toEqual([
        ['mia', '#général', 'Chatvardage'],
        [undefined, '#général', 'Chatvardage'],
      ]);
    });

    it("n'interroge pas les serveurs sans résultat de salon, ni l'annuaire sans identifiant valide", async () => {
      apiFetch.mockResolvedValue({ results: [{ ...systemRoom, conversationId: `room:${ROOM}` }].slice(0, 0), nextCursor: null });
      await searchMessages({ q: 'bonjour' });
      expect(apiFetch).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['une panne', () => Promise.reject(new Error('503'))],
      ['une réponse invalide', () => Promise.resolve({ pas: 'une liste' })],
    ])('garde les résultats quand la liste des serveurs donne %s', async (_, servers) => {
      apiFetch.mockImplementation(async (path: string) => {
        if (path === '/api/servers') return servers();
        if (path.startsWith('/api/users/lookup')) return [];
        return { results: [room], nextCursor: null };
      });
      const page = await searchMessages({ q: 'bonjour' });
      expect(page.results).toHaveLength(1);
      expect(page.results[0].conversationTitle).toBeUndefined();
      expect(page.results[0].serverName).toBeUndefined();
    });
  });
});

