import * as http from '@/services/httpClient';
import { fetchHistory } from '@/services/messagesService';

jest.mock('@/services/httpClient');
const apiFetch = http.apiFetch as jest.Mock;

const ROOM = '22222222-2222-4222-8222-222222222222';
const msg = (id: string, createdAt: string) => ({
  id,
  authorId: 'u1',
  content: id,
  createdAt,
  updatedAt: createdAt,
});

beforeEach(() => apiFetch.mockReset());

describe('fetchHistory', () => {
  it("renvoie les messages du plus récent au plus ancien (l'API les donne du plus ancien au plus récent)", async () => {
    apiFetch.mockImplementation(async (path: string) =>
      path.startsWith('/api/users/lookup')
        ? [{ id: 'u1', pseudo: 'alice' }]
        : [msg('ancien', '2026-10-01T10:00:00Z'), msg('milieu', '2026-10-01T11:00:00Z'), msg('recent', '2026-10-01T12:00:00Z')],
    );
    const messages = await fetchHistory(`room:${ROOM}`);
    expect(messages.map((m) => m.id)).toEqual(['recent', 'milieu', 'ancien']);
    expect(messages[0].senderName).toBe('alice');
  });

  it("refuse un identifiant invalide sans appeler l'API", async () => {
    await expect(fetchHistory('nope')).rejects.toMatchObject({ kind: 'not_found' });
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
