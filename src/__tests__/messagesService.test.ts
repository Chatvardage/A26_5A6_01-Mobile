import * as http from '@/services/httpClient';
import { ApiError } from '@/services/ApiError';
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
  it('tolère un auteur absent et une résolution des pseudos indisponible', async () => {
    apiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith('/api/users/lookup')) throw new Error('503');
      return [
        { ...msg('sans-auteur', '2026-10-01T10:00:00Z'), authorId: undefined },
        { ...msg('privé', '2026-10-01T10:00:00Z'), senderId: 'u2' },
      ];
    });
    const result = await fetchHistory(`dm:${ROOM}`, 10);
    expect(apiFetch).toHaveBeenCalledWith(`/api/messages/history/${ROOM}?limit=10`);
    expect(result.map((m) => m.senderId)).toEqual(['u2', '']);
    expect(result[0].senderName).toBeUndefined();
  });
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
  it('ne parse que les deux dates du nouvel événement après 500 messages déjà chargés', () => {
    const current = mergeMessages([], Array.from({ length: 500 }, (_, index) =>
      baseMessage(`loaded-${index}`, '2026-10-01T10:00:00Z'),
    ));
    const incoming = baseMessage('live', '2026-10-02T10:00:00Z');
    const parse = jest.spyOn(Date, 'parse');
    try {
      const merged = mergeMessages(current, [incoming]);
      expect(parse).toHaveBeenCalledTimes(2);
      expect(merged).toHaveLength(501);
      expect(merged[0]).toEqual(incoming);
      parse.mockClear();
      expect(mergeMessages(merged, [incoming])).toEqual(merged);
      expect(parse).not.toHaveBeenCalled();
    } finally {
      parse.mockRestore();
    }
  });

  it.each(['createdAt', 'updatedAt'] as const)('invalide le cache si une date %s déjà validée change', (field) => {
    const current = mergeMessages([], [baseMessage('one', '2026-10-01T10:00:00Z')]);
    current[0][field] = '2026-10-02T10:00:00Z';
    expect(mergeMessages(current, [])).toEqual(current);
    current[0][field] = 'invalide';
    expect(() => mergeMessages(current, [])).toThrow(expect.objectContaining({ kind: 'invalid_response' }));
  });

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

  it('préserve le pseudo connu lorsque REST ne le fournit pas', () => {
    const current = { ...baseMessage('one', '2026-10-01T10:00:00Z'), senderName: 'Alice' };
    const incoming = { ...current, senderName: undefined, content: 'version reçue' };
    expect(mergeMessages([current], [incoming])).toEqual([{ ...incoming, senderName: 'Alice' }]);
  });

  it.each(['createdAt', 'updatedAt'] as const)('rejette une date %s invalide sans modifier les listes', (field) => {
    const original = baseMessage('one', '2026-10-01T10:00:00Z');
    const current = [original];
    const incoming = [{ ...original, content: 'invalide', [field]: 'date-invalide' }];
    const currentSnapshot = current.map((item) => ({ ...item }));
    const incomingSnapshot = incoming.map((item) => ({ ...item }));
    expect(() => mergeMessages(current, incoming)).toThrow(expect.objectContaining({ kind: 'invalid_response' }));
    expect(() => mergeMessages([], incoming)).toThrow(expect.objectContaining({ kind: 'invalid_response' }));
    expect(() => mergeMessages(incoming, [])).toThrow(expect.objectContaining({ kind: 'invalid_response' }));
    expect(current).toEqual(currentSnapshot);
    expect(incoming).toEqual(incomingSnapshot);
  });
});

describe('dates des réponses REST', () => {
  const invalidDates = [
    { label: 'vide', value: '' },
    { label: 'non interprétable', value: 'date-invalide' },
    { label: 'absente', value: undefined },
    { label: 'nulle', value: null },
    { label: 'numérique', value: 0 },
    { label: 'booléenne', value: true },
    { label: 'objet', value: {} },
    { label: 'tableau coercible en date', value: ['2026-10-01T10:00:00Z'] },
  ];
  it.each(
    (['createdAt', 'updatedAt'] as const).flatMap((field) =>
      invalidDates.map((invalidDate) => ({ field, ...invalidDate })),
    ),
  )('rejette une date $field $label dans toutes les réponses', async ({ field, value }) => {
    const invalid = { ...baseMessage('one', '2026-10-01T10:00:00Z'), [field]: value };
    apiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith('/api/users/lookup')) return [];
      if (path.includes('/history')) return [invalid];
      return invalid;
    });
    for (const conversationId of [`dm:${DM}`, `room:${ROOM}`]) {
      for (const request of [
        () => fetchHistory(conversationId),
        () => sendMessage(conversationId, 'texte'),
        () => editMessage(conversationId, 'one', 'texte'),
      ]) {
        const response = request();
        await expect(response).rejects.toBeInstanceOf(ApiError);
        await expect(response).rejects.toMatchObject({ kind: 'invalid_response' });
      }
    }
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
