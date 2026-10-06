import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useMessages } from '@/hooks/useMessages';
import { ApiError } from '@/services/ApiError';
import * as messageService from '@/services/messagesService';
import * as realtime from '@/services/websocketService';
import { lookupPseudos } from '@/services/usersService';

jest.mock('@/services/messagesService', () => {
  const actual = jest.requireActual('@/services/messagesService');
  return { ...actual, fetchHistory: jest.fn(), sendMessage: jest.fn(), editMessage: jest.fn() };
});
jest.mock('@/services/usersService', () => ({ lookupPseudos: jest.fn() }));
jest.mock('@/services/websocketService', () => ({
  getRealtimeState: jest.fn(() => 'ready'),
  hasRealtimeBeenReady: jest.fn(() => false),
  joinRoom: jest.fn(() => Promise.resolve()),
  leaveRoom: jest.fn(() => Promise.resolve()),
  onConnectionState: jest.fn(() => jest.fn()),
  onReady: jest.fn((handler: () => void) => {
    mockReadyHandler = handler;
    return jest.fn();
  }),
  subscribe: jest.fn((event: string, handler: (payload: unknown) => void) => {
    mockHandlers.set(event, handler);
    return () => mockHandlers.delete(event);
  }),
}));

const DM = '11111111-1111-4111-8111-111111111111';
const ME = '33333333-3333-4333-8333-333333333333';
const OTHER = DM;
const conversationId = `dm:${DM}`;
const mockHandlers = new Map<string, (payload: unknown) => void>();
let mockReadyHandler: (() => void) | null = null;
const fetchHistory = messageService.fetchHistory as jest.Mock;
const sendMessage = messageService.sendMessage as jest.Mock;
const editMessage = messageService.editMessage as jest.Mock;
const ROOM = '77777777-7777-4777-8777-777777777777';
const roomConversation = `room:${ROOM}`;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((success, failure) => { resolve = success; reject = failure; });
  return { promise, resolve, reject };
}

const message = (id: string, senderId = OTHER, createdAt = '2026-10-01T10:00:00Z') => ({
  id,
  senderId,
  senderName: senderId === OTHER ? 'Alice' : 'Moi',
  content: id,
  createdAt,
  updatedAt: createdAt,
});

beforeEach(() => {
  mockHandlers.clear();
  mockReadyHandler = null;
  fetchHistory.mockReset().mockResolvedValue([message('first')]);
  sendMessage.mockReset().mockResolvedValue(message('sent', ME));
  editMessage.mockReset().mockResolvedValue({ ...message('first'), content: 'edited', updatedAt: '2026-10-01T11:00:00Z' });
  (lookupPseudos as jest.Mock).mockReset().mockResolvedValue({ [OTHER]: 'Alice' });
  jest.mocked(realtime.joinRoom).mockReset().mockResolvedValue(undefined);
  jest.mocked(realtime.leaveRoom).mockReset().mockResolvedValue(undefined);
  jest.mocked(realtime.hasRealtimeBeenReady).mockReset().mockReturnValue(false);
});

describe('useMessages', () => {
  it('charge, expose une conversation vide et permet de réessayer une erreur initiale', async () => {
    const { result, rerender } = await renderHook(({ id }: { id: string }) => useMessages(id, ME), {
      initialProps: { id: conversationId },
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.messages.map((item) => item.id)).toEqual(['first']);

    fetchHistory.mockResolvedValueOnce([]);
    await rerender({ id: `dm:${'44444444-4444-4444-8444-444444444444'}` });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.messages).toEqual([]);

    fetchHistory.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([]);
    await rerender({ id: `dm:${'55555555-5555-4555-8555-555555555555'}` });
    await waitFor(() => expect(result.current.status).toBe('error'));
    await act(async () => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it('tamponne les événements pendant le chargement, filtre les autres conversations et fusionne sans doublon', async () => {
    const created = {
      id: 'socket-message',
      senderId: OTHER,
      recipientId: ME,
      content: 'temps réel',
      createdAt: '2026-10-01T12:00:00Z',
      updatedAt: '2026-10-01T12:00:00Z',
    };
    fetchHistory.mockImplementationOnce(async () => {
      mockHandlers.get('private-message.created')?.(created);
      mockHandlers.get('private-message.created')?.({ ...created, recipientId: ME + 'x', id: 'other' });
      return [message('first'), { ...created, senderName: 'Alice' }];
    });
    const { result } = await renderHook(() => useMessages(conversationId, ME));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.messages.map((item) => item.id)).toEqual(['socket-message', 'first']);
    expect(result.current.messages.filter((item) => item.id === 'socket-message')).toHaveLength(1);
    expect(lookupPseudos).toHaveBeenCalledTimes(1);
  });

  it('applique les modifications, charge les anciens messages avec curseur et ignore le double appel', async () => {
    const firstPage = Array.from(
      { length: 50 },
      (_, index) => message(`m${50 - index}`, OTHER, new Date(Date.UTC(2026, 9, 1, 23 - index)).toISOString()),
    );
    fetchHistory.mockResolvedValueOnce(firstPage);
    let resolveOlder!: (items: ReturnType<typeof message>[]) => void;
    fetchHistory.mockReturnValueOnce(new Promise((resolve) => (resolveOlder = resolve)));
    const { result } = await renderHook(() => useMessages(conversationId, ME));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const updated = {
      id: 'm50',
      senderId: OTHER,
      recipientId: ME,
      content: 'corrigé',
      createdAt: firstPage[0].createdAt,
      updatedAt: '2026-10-02T00:00:00Z',
    };
    await act(async () => {
      mockHandlers.get('private-message.updated')?.(updated);
      await Promise.resolve();
    });
    expect(result.current.messages.find((item) => item.id === 'm50')?.content).toBe('corrigé');

    await act(async () => {
      const pending = result.current.loadOlder();
      const duplicate = result.current.loadOlder();
      expect(fetchHistory).toHaveBeenCalledWith(conversationId, 50, firstPage.at(-1)?.id);
      resolveOlder([message('older', OTHER, '2026-09-20T10:00:00Z')]);
      await pending;
      await duplicate;
    });
    expect(result.current.hasOlder).toBe(false);
    expect(result.current.messages.at(-1)?.id).toBe('older');
  });

  it('ignore la pagination avant le premier chargement et conserve les messages après une erreur', async () => {
    const firstPage = Array.from(
      { length: 50 },
      (_, index) => message(`page-${index}`, OTHER, new Date(Date.UTC(2026, 9, 2, 23 - index)).toISOString()),
    );
    let resolveHistory!: (items: ReturnType<typeof message>[]) => void;
    fetchHistory.mockReturnValueOnce(new Promise((resolve) => (resolveHistory = resolve)));
    const { result } = await renderHook(() => useMessages(conversationId, ME));

    await act(async () => result.current.loadOlder());
    expect(fetchHistory).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveHistory(firstPage);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    fetchHistory.mockRejectedValueOnce(new ApiError('network', 'offline'));
    await act(async () => result.current.loadOlder());
    expect(result.current.olderError).toMatch(/joindre le serveur/);
    expect(result.current.messages).toHaveLength(50);
    expect(result.current.hasOlder).toBe(true);

    fetchHistory.mockResolvedValueOnce([message('older-page', OTHER, '2026-09-20T10:00:00Z')]);
    await act(async () => result.current.loadOlder());
    expect(result.current.olderError).toBeNull();
    expect(result.current.messages.at(-1)?.id).toBe('older-page');
    expect(result.current.hasOlder).toBe(false);
  });

  it('reçoit les événements de salon et affiche la révocation d’accès', async () => {
    const roomId = '77777777-7777-4777-8777-777777777777';
    const { result } = await renderHook(() => useMessages(`room:${roomId}`, ME));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const roomMessage = {
      id: 'room-message',
      roomId,
      authorId: OTHER,
      content: 'dans le salon',
      createdAt: '2026-10-01T10:00:00Z',
      updatedAt: '2026-10-01T10:00:00Z',
    };
    await act(async () => {
      mockHandlers.get('room-message.created')?.(roomMessage);
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.messages.map((item) => item.id)).toContain('room-message'));
    await act(async () => {
      mockHandlers.get('room-message.revoked')?.({ roomId });
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.accessError).toBe("Vous n'avez pas accès à cette conversation."));
    expect(result.current.status).toBe('ready');
    expect(result.current.messages.map((item) => item.id)).toContain('room-message');

    // Une reconnexion retente l'abonnement au salon révoqué.
    await act(async () => mockReadyHandler?.());
    expect(realtime.joinRoom).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(result.current.accessError).toBeNull());
  });

  it('rattrape les messages après reconnexion sans vider les pages chargées et quitte les salons', async () => {
    const roomId = '66666666-6666-4666-8666-666666666666';
    const roomConversation = `room:${roomId}`;
    (realtime.hasRealtimeBeenReady as jest.Mock).mockReturnValueOnce(true);
    fetchHistory.mockResolvedValueOnce([message('existing')]).mockResolvedValueOnce([message('latest', ME)]);
    const { result, unmount, rerender } = await renderHook(({ id }: { id: string }) => useMessages(id, ME), {
      initialProps: { id: conversationId },
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => mockReadyHandler?.());
    await waitFor(() => expect(result.current.messages.map((item) => item.id)).toContain('latest'));
    expect(result.current.messages.map((item) => item.id)).toContain('existing');

    await rerender({ id: roomConversation });
    await waitFor(() => expect(realtime.joinRoom).toHaveBeenCalledWith(roomId));
    unmount();
    await waitFor(() => expect(realtime.leaveRoom).toHaveBeenCalledWith(roomId));
  });

  it('transforme les erreurs d’envoi et de modification en messages utilisateur', async () => {
    const { result } = await renderHook(() => useMessages(conversationId, ME));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    sendMessage.mockRejectedValueOnce(new Error('network'));
    await expect(result.current.send('texte')).rejects.toBe('Une erreur est survenue.');
    await act(async () => result.current.send('message envoyé'));
    expect(result.current.messages.some((item) => item.id === 'sent')).toBe(true);
    editMessage.mockRejectedValueOnce(new ApiError('forbidden', 'forbidden'));
    await expect(result.current.edit('first', 'modifié')).rejects.toBe("Vous n'avez pas accès à cette conversation.");
    await act(async () => result.current.edit('first', 'corrigé'));
    expect(result.current.messages.find((item) => item.id === 'first')?.content).toBe('edited');
  });

  it('résout un auteur inconnu une seule fois et enrichit les événements tamponnés', async () => {
    const history = deferred<ReturnType<typeof message>[]>();
    const names = deferred<Record<string, string>>();
    fetchHistory.mockReturnValueOnce(history.promise);
    jest.mocked(lookupPseudos).mockReturnValueOnce(names.promise);
    const { result } = await renderHook(() => useMessages(roomConversation, ME));
    const raw = { ...message('new', 'unknown'), senderId: undefined, authorId: 'unknown', roomId: ROOM };
    await act(async () => {
      mockHandlers.get('room-message.created')?.(raw);
      mockHandlers.get('room-message.updated')?.({ ...raw, content: 'corrigé', updatedAt: '2026-10-02T10:00:00Z' });
    });
    expect(lookupPseudos).toHaveBeenCalledTimes(1);
    await act(async () => names.resolve({ unknown: 'Bob' }));
    expect(result.current.messages).toEqual([]);
    await act(async () => history.resolve([]));
    expect(result.current.messages[0]).toMatchObject({ id: 'new', content: 'corrigé', senderName: 'Bob' });
    await act(async () => mockHandlers.get('room-message.created')?.({ ...raw, id: 'second' }));
    expect(lookupPseudos).toHaveBeenCalledTimes(1);
    expect(result.current.messages.find((item) => item.id === 'second')?.senderName).toBe('Bob');
  });

  it('enrichit un message après le chargement et signale un échec de résolution des pseudos', async () => {
    fetchHistory.mockResolvedValueOnce([]);
    const { result } = await renderHook(() => useMessages(roomConversation, ME));
    const raw = { ...message('live', 'unknown'), senderId: undefined, authorId: 'unknown', roomId: ROOM };
    jest.mocked(lookupPseudos).mockResolvedValueOnce({ unknown: 'Bob' });
    await act(async () => mockHandlers.get('room-message.created')?.(raw));
    expect(result.current.messages[0].senderName).toBe('Bob');

    jest.mocked(lookupPseudos).mockRejectedValueOnce(new ApiError('network', 'offline'));
    await act(async () => mockHandlers.get('room-message.created')?.({ ...raw, id: 'failed', authorId: 'failed' }));
    expect(result.current.errorMessage).toMatch(/joindre le serveur/);
    expect(result.current.messages.map((item) => item.id)).toContain('failed');
    jest.mocked(lookupPseudos).mockResolvedValueOnce({});
    await act(async () => mockHandlers.get('room-message.created')?.({ ...raw, id: 'anonymous', authorId: 'anonymous' }));
    expect(result.current.messages.find((item) => item.id === 'anonymous')?.senderName).toBeUndefined();
  });

  it('ignore les événements malformés et les révocations d’autres salons', async () => {
    const { result } = await renderHook(() => useMessages(roomConversation, ME));
    const before = result.current.messages;
    await act(async () => {
      const receive = mockHandlers.get('room-message.created')!;
      receive(null);
      receive({ roomId: ROOM });
      receive({ roomId: ROOM, id: 'bad', content: 1 });
      receive({ roomId: ROOM, id: 'bad', content: 'x' });
      receive({ roomId: ROOM, id: 'bad', content: 'x', authorId: '' });
      mockHandlers.get('room-message.revoked')?.(null);
      mockHandlers.get('room-message.revoked')?.({ roomId: 'another-room' });
    });
    expect(result.current.messages).toEqual(before);
    expect(result.current.errorMessage).toBeNull();
    expect(lookupPseudos).not.toHaveBeenCalled();
  });

  it('ignore la première notification prête puis expose un échec de rattrapage sans perdre la liste', async () => {
    const { result } = await renderHook(() => useMessages(conversationId, ME));
    await act(async () => mockReadyHandler?.());
    expect(fetchHistory).toHaveBeenCalledTimes(1);
    fetchHistory.mockRejectedValueOnce(new ApiError('network', 'offline'));
    await act(async () => mockReadyHandler?.());
    expect(fetchHistory).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('ready');
    expect(result.current.messages.map((item) => item.id)).toEqual(['first']);
    expect(result.current.errorMessage).toMatch(/joindre le serveur/);
  });

  it('affiche le refus de rejoindre un salon et désabonne même si leave échoue', async () => {
    const history = deferred<ReturnType<typeof message>[]>();
    fetchHistory.mockReturnValueOnce(history.promise);
    jest.mocked(realtime.joinRoom).mockRejectedValueOnce(new ApiError('forbidden', 'denied'));
    jest.mocked(realtime.leaveRoom).mockRejectedValueOnce(new ApiError('timeout', 'leave'));
    const { result, unmount } = await renderHook(() => useMessages(roomConversation, ME));
    expect(result.current.accessError).toBe("Vous n'avez pas accès à cette conversation.");
    expect(result.current.status).toBe('loading');
    await unmount();
    await act(async () => history.resolve([]));
    expect(mockHandlers.size).toBe(0);
    expect(realtime.leaveRoom).toHaveBeenCalledWith(ROOM);
  });

  it('garde le refus du salon visible même si l’historique REST arrive ensuite', async () => {
    const history = deferred<ReturnType<typeof message>[]>();
    fetchHistory.mockReturnValueOnce(history.promise);
    jest.mocked(realtime.joinRoom).mockRejectedValueOnce(new ApiError('forbidden', 'denied'));
    const { result } = await renderHook(() => useMessages(roomConversation, ME));
    await waitFor(() => expect(result.current.accessError).not.toBeNull());
    await act(async () => history.resolve([message('first')]));
    expect(result.current.status).toBe('ready');
    expect(result.current.errorMessage).toBeNull();
    expect(result.current.accessError).toBe("Vous n'avez pas accès à cette conversation.");
  });

  it('retente l’abonnement expiré à la première connexion prête sans bloquer l’écran', async () => {
    jest.mocked(realtime.joinRoom).mockRejectedValueOnce(new ApiError('timeout', 'Connexion temps réel non prête'));
    const { result } = await renderHook(() => useMessages(roomConversation, ME));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.accessError).toMatch(/trop de temps/);
    expect(result.current.messages.map((item) => item.id)).toEqual(['first']);

    await act(async () => mockReadyHandler?.());
    expect(realtime.joinRoom).toHaveBeenCalledTimes(2);
    // Première connexion prête : l'historique vient d'être chargé, pas de rattrapage REST.
    expect(fetchHistory).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.accessError).toBeNull());
    await act(async () => mockReadyHandler?.());
    expect(realtime.joinRoom).toHaveBeenCalledTimes(2);
  });

  it('ignore un échec d’abonnement retenté après changement de conversation', async () => {
    jest.mocked(realtime.joinRoom).mockRejectedValueOnce(new ApiError('timeout', 'expiré'));
    const retried = deferred<void>();
    jest.mocked(realtime.joinRoom).mockReturnValueOnce(retried.promise);
    const { result, rerender } = await renderHook(({ id }: { id: string }) => useMessages(id, ME), {
      initialProps: { id: roomConversation },
    });
    await waitFor(() => expect(result.current.accessError).not.toBeNull());
    const oldReady = mockReadyHandler;
    await act(async () => oldReady?.());
    await rerender({ id: conversationId });
    await act(async () => retried.reject(new ApiError('forbidden', 'obsolète')));
    expect(result.current.accessError).toBeNull();
  });

  it.each(['resolve', 'reject'] as const)('ignore les réponses REST tardives après changement de conversation (%s)', async (outcome) => {
    const old = deferred<ReturnType<typeof message>[]>();
    fetchHistory.mockReturnValueOnce(old.promise);
    const { result, rerender } = await renderHook(({ id }: { id: string }) => useMessages(id, ME), { initialProps: { id: conversationId } });
    await rerender({ id: roomConversation });
    expect(result.current.messages.map((item) => item.id)).toEqual(['first']);
    await act(async () => {
      if (outcome === 'resolve') old.resolve([message('obsolete')]);
      else old.reject(new ApiError('network', 'obsolete'));
    });
    expect(result.current.messages.map((item) => item.id)).toEqual(['first']);
    expect(result.current.errorMessage).toBeNull();
  });

  it.each(['resolve', 'reject'] as const)('ignore les anciens pseudos et demandes de salon après changement (%s)', async (outcome) => {
    fetchHistory.mockResolvedValueOnce([]);
    const names = deferred<Record<string, string>>();
    const joining = deferred<void>();
    jest.mocked(lookupPseudos).mockReturnValueOnce(names.promise);
    jest.mocked(realtime.joinRoom).mockReturnValueOnce(joining.promise);
    const { result, rerender } = await renderHook(({ id }: { id: string }) => useMessages(id, ME), { initialProps: { id: roomConversation } });
    await act(async () => mockHandlers.get('room-message.created')?.({ ...message('obsolete', 'unknown'), authorId: 'unknown', senderId: undefined, roomId: ROOM }));
    await rerender({ id: conversationId });
    await act(async () => {
      if (outcome === 'resolve') {
        names.resolve({ unknown: 'Bob' });
        joining.resolve();
      } else {
        names.reject(new ApiError('network', 'obsolete'));
        joining.reject(new ApiError('forbidden', 'obsolete'));
      }
    });
    expect(result.current.messages.map((item) => item.id)).toEqual(['first']);
    expect(result.current.errorMessage).toBeNull();
  });

  it.each(['resolve', 'reject'] as const)('ignore une ancienne page terminée dans une autre conversation (%s)', async (outcome) => {
    const page = Array.from({ length: 50 }, (_, index) => message(`m-${index}`));
    fetchHistory.mockResolvedValueOnce(page);
    const older = deferred<ReturnType<typeof message>[]>();
    fetchHistory.mockReturnValueOnce(older.promise);
    const { result, rerender } = await renderHook(({ id }: { id: string }) => useMessages(id, ME), { initialProps: { id: conversationId } });
    let pending!: Promise<void>;
    await act(async () => { pending = result.current.loadOlder(); });
    await rerender({ id: roomConversation });
    await act(async () => {
      if (outcome === 'resolve') older.resolve([message('obsolete')]);
      else older.reject(new ApiError('network', 'obsolete'));
      await pending;
    });
    expect(result.current.messages.map((item) => item.id)).toEqual(['first']);
    expect(result.current.olderError).toBeNull();
    expect(result.current.loadingOlder).toBe(false);
  });

  it('ignore les retours tardifs d’envoi et de modification', async () => {
    const sent = deferred<ReturnType<typeof message>>();
    const edited = deferred<ReturnType<typeof message>>();
    sendMessage.mockReturnValueOnce(sent.promise);
    editMessage.mockReturnValueOnce(edited.promise);
    const { result, rerender } = await renderHook(({ id }: { id: string }) => useMessages(id, ME), { initialProps: { id: conversationId } });
    const pendingSend = result.current.send('old');
    const pendingEdit = result.current.edit('old', 'old');
    await rerender({ id: roomConversation });
    await act(async () => {
      sent.resolve(message('obsolete-send'));
      edited.resolve(message('obsolete-edit'));
      await Promise.all([pendingSend, pendingEdit]);
    });
    expect(result.current.messages.map((item) => item.id)).toEqual(['first']);
  });

  it('garde les messages sans pseudo et enrichit les auteurs au fil des pages', async () => {
    const page = Array.from({ length: 50 }, (_, index) => ({ ...message(`m-${index}`), senderName: undefined }));
    fetchHistory.mockResolvedValueOnce(page).mockResolvedValueOnce([{ ...message('older'), senderName: undefined }]);
    const { result } = await renderHook(() => useMessages(conversationId, ME));
    expect(result.current.messages).toHaveLength(50);
    await act(async () => result.current.loadOlder());
    expect(result.current.messages).toHaveLength(51);
    expect(result.current.hasOlder).toBe(false);
    expect(result.current.errorMessage).toBeNull();
  });

  it('ignore un ancien déclencheur de pagination lorsque la nouvelle conversation est vide', async () => {
    fetchHistory.mockResolvedValueOnce(Array.from({ length: 50 }, (_, index) => message(`m-${index}`)));
    const { result, rerender } = await renderHook(({ id }: { id: string }) => useMessages(id, ME), { initialProps: { id: conversationId } });
    const loadPrevious = result.current.loadOlder;
    fetchHistory.mockResolvedValueOnce([]);
    await rerender({ id: roomConversation });
    expect(result.current.status).toBe('ready');
    expect(result.current.messages).toEqual([]);
    await act(async () => loadPrevious());
    expect(fetchHistory).toHaveBeenCalledTimes(2);
    expect(result.current.loadingOlder).toBe(false);
  });
});
