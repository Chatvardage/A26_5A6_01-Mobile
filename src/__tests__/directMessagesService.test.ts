import { fetchDirectMessages } from '@/services/directMessagesService';
import * as http from '@/services/httpClient';

jest.mock('@/services/httpClient');
const apiFetch = http.apiFetch as jest.Mock;

const A = '11111111-1111-4111-8111-111111111111';
const B = '33333333-3333-4333-8333-333333333333';
const dm = (otherUserId: string, createdAt: string) => ({
  otherUserId,
  lastMessage: { id: `m-${otherUserId}`, senderId: otherUserId, content: 'salut', createdAt },
});

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

describe('fetchDirectMessages', () => {
  it('résout les pseudos, trie par activité récente et applique les non-lus', async () => {
    mockApi({
      '/api/messages/conversations': [dm(A, '2026-10-01T10:00:00Z'), dm(B, '2026-10-02T10:00:00Z')],
      '/api/users/lookup': [
        { id: A, pseudo: 'alice' },
        { id: B, pseudo: 'bob' },
      ],
    });
    const result = await fetchDirectMessages({ getCounts: async () => ({ [`dm:${A}`]: 3 }) });
    expect(result.map((c) => c.title)).toEqual(['bob', 'alice']);
    expect(result.find((c) => c.title === 'alice')?.unreadCount).toBe(3);
    expect(result.find((c) => c.title === 'bob')?.unreadCount).toBe(0);
  });

  it("garde la liste si la résolution des pseudos échoue", async () => {
    mockApi({ '/api/messages/conversations': [dm(A, '2026-10-01T10:00:00Z')], '/api/users/lookup': new Error('503') });
    const [only] = await fetchDirectMessages();
    expect(only.title).toBe('Utilisateur inconnu');
  });

  it("propage l'erreur si la liste elle-même échoue", async () => {
    mockApi({ '/api/messages/conversations': new Error('boom') });
    await expect(fetchDirectMessages()).rejects.toThrow('boom');
  });
});
