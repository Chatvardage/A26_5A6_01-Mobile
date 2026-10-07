import * as http from '@/services/httpClient';
import { belongsTo, editMessage, fetchHistory, mergeMessages, sendMessage } from '@/services/messagesService';

jest.mock('@/services/httpClient');
const apiFetch = http.apiFetch as jest.Mock;

const ROOM = '22222222-2222-4222-8222-222222222222';
const DM = '11111111-1111-4111-8111-111111111111';
const ME = '33333333-3333-4333-8333-333333333333';
const baseMessage = (id: string, createdAt: string, updatedAt = createdAt) => ({
  id,
  senderId: ME,
  content: id,
  createdAt,
  updatedAt,
});
const msg = (id: string, createdAt: string) => ({
  id,
  authorId: ME,
  content: id,
  createdAt,
  updatedAt: createdAt,
});

beforeEach(() => apiFetch.mockReset());

describe('fetchHistory', () => {
  it("renvoie les messages du plus récent au plus ancien (l'API les donne du plus ancien au plus récent)", async () => {
    apiFetch.mockImplementation(async (path: string) =>
      path.startsWith('/api/users/lookup')
        ? [{ id: ME, pseudo: 'alice' }]
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

  it('encode le curseur sur les deux types de conversation', async () => {
    apiFetch.mockImplementation(async (path: string) =>
      path.startsWith('/api/users/lookup') ? [] : [],
    );
    await fetchHistory(`dm:${DM}`, 25, 'id avec espaces');
    await fetchHistory(`room:${ROOM}`, 25, 'cursor/id');
    expect(apiFetch.mock.calls[0][0]).toBe(`/api/messages/history/${DM}?limit=25&cursor=id+avec+espaces`);
    expect(apiFetch.mock.calls[1][0]).toBe(`/api/messages/rooms/${ROOM}/history?limit=25&cursor=cursor%2Fid`);
  });

  it('normalise les messages sans auteur résolvable et évite une recherche de pseudo vide', async () => {
    apiFetch.mockResolvedValueOnce([{ ...msg('sans-auteur', '2026-10-01T10:00:00Z'), authorId: undefined }]);
    const result = await fetchHistory(`room:${ROOM}`);
    expect(result[0]).toMatchObject({ id: 'sans-auteur', senderId: '' });
    expect(result[0].senderName).toBeUndefined();
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });
});

describe('sendMessage et editMessage', () => {
  it.each([
    [`dm:${DM}`, '/api/messages', { recipientId: DM, content: 'salut' }],
    [`room:${ROOM}`, `/api/messages/rooms/${ROOM}`, { content: 'salut' }],
  ])('envoie à la bonne route (%s)', async (conversationId, path, body) => {
    apiFetch.mockResolvedValue({ ...baseMessage('m1', '2026-10-01T10:00:00Z'), roomId: ROOM });
    const message = await sendMessage(conversationId, 'salut');
    expect(apiFetch).toHaveBeenCalledWith(path, { method: 'POST', body: JSON.stringify(body) });
    expect(message).toMatchObject({ id: 'm1', content: 'm1', senderId: ME });
  });

  it.each([
    [`dm:${DM}`, '/api/messages/m1'],
    [`room:${ROOM}`, `/api/messages/rooms/${ROOM}/m1`],
  ])('modifie à la bonne route (%s)', async (conversationId, path) => {
    apiFetch.mockResolvedValue(baseMessage('m1', '2026-10-01T10:00:00Z'));
    await editMessage(conversationId, 'm1', 'corrigé');
    expect(apiFetch).toHaveBeenCalledWith(path, { method: 'PATCH', body: JSON.stringify({ content: 'corrigé' }) });
  });

  it('refuse les identifiants invalides et remonte les erreurs REST telles quelles', async () => {
    await expect(sendMessage('invalid', 'x')).rejects.toMatchObject({ kind: 'not_found' });
    await expect(editMessage('invalid', 'id', 'x')).rejects.toMatchObject({ kind: 'not_found' });
    expect(apiFetch).not.toHaveBeenCalled();

    const error = new Error('échec API');
    apiFetch.mockRejectedValue(error);
    await expect(sendMessage(`dm:${DM}`, 'x')).rejects.toBe(error);
  });
});

describe('mergeMessages', () => {
  it('déduplique, conserve la modification la plus récente, trie et départage les dates par id', () => {
    const current = [
      baseMessage('b', '2026-10-01T11:00:00Z', '2026-10-01T11:00:00Z'),
      baseMessage('same', '2026-10-01T10:00:00Z', '2026-10-01T10:00:00Z'),
    ];
    const merged = mergeMessages(current, [
      baseMessage('a', '2026-10-01T11:00:00Z'),
      baseMessage('same', '2026-10-01T10:00:00Z', '2026-10-01T12:00:00Z'),
    ]);
    expect(merged.map((message) => message.id)).toEqual(['b', 'a', 'same']);
    expect(merged[2].updatedAt).toBe('2026-10-01T12:00:00Z');
    expect(merged.filter((message) => message.id === 'same')).toHaveLength(1);
  });

  it('garde le contenu le plus récent même si une ancienne version apporte un pseudo', () => {
    const recent = { ...baseMessage('one', '2026-10-01T10:00:00Z', '2026-10-02T10:00:00Z'), content: 'corrigé' };
    const older = { ...baseMessage('one', recent.createdAt), content: 'ancien', senderName: 'Alice' };
    const merged = mergeMessages([recent], [older]);
    expect(merged).toEqual([{ ...recent, senderName: 'Alice' }]);
    expect(mergeMessages(merged, [{ ...older, senderName: 'Autre' }])).toEqual(merged);
  });

  it('préserve le pseudo connu lorsque REST ne le fournit pas et normalise les dates invalides', () => {
    const current = { ...baseMessage('one', 'date-invalide'), senderName: 'Alice' };
    const incoming = { ...current, senderName: undefined, content: 'version reçue' };
    expect(mergeMessages([current], [incoming])).toEqual([{ ...incoming, senderName: 'Alice' }]);
  });
});

describe('belongsTo', () => {
  it('reconnaît les deux directions d’un DM et ne retient pas une autre conversation', () => {
    expect(belongsTo(`dm:${DM}`, ME, { senderId: ME, recipientId: DM })).toBe(true);
    expect(belongsTo(`dm:${DM}`, ME, { senderId: DM, recipientId: ME })).toBe(true);
    expect(belongsTo(`dm:${DM}`, ME, { senderId: ME, recipientId: ROOM })).toBe(false);
  });

  it('vérifie le salon et les données invalides', () => {
    expect(belongsTo(`room:${ROOM}`, ME, { roomId: ROOM })).toBe(true);
    expect(belongsTo(`room:${ROOM}`, ME, { roomId: DM })).toBe(false);
    expect(belongsTo('invalid', ME, {})).toBe(false);
    expect(belongsTo(`dm:${DM}`, ME, { authorId: DM, recipientId: ME })).toBe(true);
    expect(belongsTo(`dm:${DM}`, ME, {})).toBe(false);
  });
});
