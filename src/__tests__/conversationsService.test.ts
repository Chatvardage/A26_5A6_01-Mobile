import { fetchConversations } from '@/services/conversationsService';
import * as http from '@/services/httpClient';

jest.mock('@/services/httpClient');
const apiFetch = http.apiFetch as jest.Mock;

const DM = '11111111-1111-4111-8111-111111111111';
const CH = '22222222-2222-4222-8222-222222222222';

function mockApi(routes: Record<string, unknown>) {
  apiFetch.mockImplementation(async (path: string) => {
    for (const [prefix, value] of Object.entries(routes)) {
      if (path.startsWith(prefix)) {
        if (value instanceof Error) throw value;
        return value;
      }
    }
    throw new Error(`route non simulée: ${path}`);
  });
}

beforeEach(() => apiFetch.mockReset());

describe('fetchConversations', () => {
  it('fusionne DM et salons, trie par activité et applique les non-lus', async () => {
    mockApi({
      '/api/messages/conversations': [
        { otherUserId: DM, lastMessage: { id: 'm1', senderId: DM, content: 'salut', createdAt: '2026-10-01T10:00:00Z' } },
      ],
      '/api/users/lookup': [{ id: DM, pseudo: 'alice' }],
      '/api/servers': [{ id: 's', nom: 'Chatvardage', salons: [{ id: CH, nom: 'general' }] }],
      [`/api/messages/rooms/${CH}/history`]: [
        { id: 'm2', authorId: DM, content: 'bonjour', createdAt: '2026-10-02T10:00:00Z' },
      ],
    });
    const result = await fetchConversations({ getCounts: async () => ({ [`dm:${DM}`]: 3 }) });

    expect(result.map((c) => c.id)).toEqual([`room:${CH}`, `dm:${DM}`]);
    expect(result[0]).toMatchObject({ title: '#general', subtitle: 'Chatvardage', unreadCount: 0 });
    expect(result[1]).toMatchObject({ title: 'alice', unreadCount: 3 });
  });

  it("tolère l'échec du dernier message d'un salon", async () => {
    mockApi({
      '/api/messages/conversations': [],
      '/api/servers': [{ id: 's', nom: 'S', salons: [{ id: CH, nom: 'g' }] }],
      [`/api/messages/rooms/${CH}/history`]: new Error('403'),
    });
    const [room] = await fetchConversations();
    expect(room.lastMessage).toBeNull();
  });

  it('conserve les résultats partiels si une source échoue', async () => {
    mockApi({
      '/api/messages/conversations': new Error('boom'),
      '/api/servers': [{ id: 's', nom: 'S', salons: [{ id: CH, nom: 'g' }] }],
      [`/api/messages/rooms/${CH}/history`]: [],
    });
    expect(await fetchConversations()).toHaveLength(1);
  });

  it('échoue si toutes les sources échouent', async () => {
    mockApi({ '/api/messages/conversations': new Error('boom'), '/api/servers': new Error('boom') });
    await expect(fetchConversations()).rejects.toThrow('boom');
  });
});
