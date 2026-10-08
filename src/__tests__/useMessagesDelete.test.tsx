import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useMessages } from '@/hooks/useMessages';
import * as messageService from '@/services/messagesService';
import { lookupPseudos } from '@/services/usersService';
import type { ChatMessage } from '@/types/conversation';

jest.mock('@/services/messagesService', () => {
  const actual = jest.requireActual<typeof import('@/services/messagesService')>('@/services/messagesService');
  return { ...actual, fetchHistory: jest.fn(), sendMessage: jest.fn(), editMessage: jest.fn(), deleteMessage: jest.fn() };
});
jest.mock('@/services/usersService', () => ({ lookupPseudos: jest.fn() }));
const mockHandlers = new Map<string, (payload: unknown) => void>();
const mockRealtime = {
  getRealtimeState: jest.fn(() => 'ready'),
  joinRoom: jest.fn(() => Promise.resolve()),
  leaveRoom: jest.fn(() => Promise.resolve()),
  onConnectionState: jest.fn(() => jest.fn()),
  onReady: jest.fn(() => jest.fn()),
  subscribe: jest.fn((event: string, handler: (payload: unknown) => void) => {
    mockHandlers.set(event, handler);
    return () => mockHandlers.delete(event);
  }),
};
jest.mock('@/session/SessionContext', () => ({ useSession: () => ({ realtime: mockRealtime }) }));

const ME = '33333333-3333-4333-8333-333333333333';
const OLI = '22222222-2222-4222-8222-222222222222';
const ROOM = '77777777-7777-4777-8777-777777777777';
const dmConversation = `dm:${OLI}`;
const roomConversation = `room:${ROOM}`;
const fetchHistory = messageService.fetchHistory as jest.Mock;
const deleteMessage = messageService.deleteMessage as jest.Mock;

const message = (id: string, minutes = 1): ChatMessage => ({
  id,
  senderId: OLI,
  senderName: 'oli',
  content: `texte ${id}`,
  createdAt: new Date(Date.UTC(2026, 9, 1, 12, 0) - minutes * 60_000).toISOString(),
  updatedAt: new Date(Date.UTC(2026, 9, 1, 12, 0) - minutes * 60_000).toISOString(),
});
const ids = (hook: { result: { current: ReturnType<typeof useMessages> } }) => hook.result.current.messages.map((m) => m.id);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

beforeEach(() => {
  mockHandlers.clear();
  fetchHistory.mockReset().mockResolvedValue([message('a', 1), message('b', 2)]);
  deleteMessage.mockReset().mockResolvedValue(undefined);
  (lookupPseudos as jest.Mock).mockReset().mockResolvedValue({});
});

const setup = async (conversation = dmConversation) => {
  const hook = await renderHook(({ id }: { id: string }) => useMessages(id, ME), { initialProps: { id: conversation } });
  await waitFor(() => expect(hook.result.current.status).toBe('ready'));
  return hook;
};

describe('useMessages : suppression', () => {
  it('remove supprime côté serveur puis retire le message de la liste', async () => {
    const hook = await setup();
    await act(async () => hook.result.current.remove('a'));
    expect(deleteMessage).toHaveBeenCalledWith(dmConversation, 'a');
    expect(ids(hook)).toEqual(['b']);
  });

  it('garde la liste et propage l’erreur quand le serveur refuse', async () => {
    const failure = Object.assign(new Error('403'), { kind: 'forbidden' });
    deleteMessage.mockRejectedValueOnce(failure);
    const hook = await setup();
    await act(async () => {
      await expect(hook.result.current.remove('a')).rejects.toBe(failure);
    });
    expect(ids(hook)).toEqual(['a', 'b']);
  });

  it('ne touche pas à la liste quand la conversation a changé pendant la suppression', async () => {
    const pending = deferred<void>();
    deleteMessage.mockReturnValueOnce(pending.promise);
    const hook = await setup();
    let removal: Promise<void> = Promise.resolve();
    await act(async () => {
      removal = hook.result.current.remove('a');
    });
    fetchHistory.mockResolvedValueOnce([message('autre')]);
    await hook.rerender({ id: roomConversation });
    await waitFor(() => expect(ids(hook)).toEqual(['autre']));
    await act(async () => {
      pending.resolve();
      await removal;
    });
    expect(ids(hook)).toEqual(['autre']);
  });

  it.each([
    ['private-message.deleted', dmConversation, { id: 'a', senderId: OLI, recipientId: ME }],
    ['room-message.deleted', roomConversation, { id: 'a', roomId: ROOM, authorId: OLI }],
  ])('retire le message supprimé par un autre appareil ou un autre membre (%s)', async (event, conversation, payload) => {
    const hook = await setup(conversation);
    await act(async () => mockHandlers.get(event)!(payload));
    expect(ids(hook)).toEqual(['b']);
  });

  it('ignore les suppressions d’une autre conversation ou sans identifiant', async () => {
    const hook = await setup();
    await act(async () => {
      mockHandlers.get('private-message.deleted')!({ id: 'a', senderId: 'quelquun-d-autre', recipientId: 'un-autre' });
      mockHandlers.get('private-message.deleted')!({ senderId: OLI, recipientId: ME });
      mockHandlers.get('private-message.deleted')!({ id: 42, senderId: OLI, recipientId: ME });
      mockHandlers.get('private-message.deleted')!(null);
    });
    expect(ids(hook)).toEqual(['a', 'b']);
  });

  it('ignore une ancienne suppression reçue après un changement de conversation', async () => {
    const hook = await setup();
    const stale = mockHandlers.get('private-message.deleted')!;
    fetchHistory.mockResolvedValueOnce([message('a', 1)]);
    await hook.rerender({ id: roomConversation });
    await waitFor(() => expect(ids(hook)).toEqual(['a']));
    await act(async () => stale({ id: 'a', senderId: OLI, recipientId: ME }));
    expect(ids(hook)).toEqual(['a']);
  });

  it('un message supprimé pendant le chargement ne réapparaît pas avec la page REST', async () => {
    const page = deferred<ChatMessage[]>();
    fetchHistory.mockReset().mockReturnValueOnce(page.promise);
    const hook = await renderHook(() => useMessages(dmConversation, ME));
    await act(async () => mockHandlers.get('private-message.created')!({ ...message('nouveau'), recipientId: ME }));
    await act(async () => mockHandlers.get('private-message.deleted')!({ id: 'nouveau', senderId: OLI, recipientId: ME }));
    await act(async () => mockHandlers.get('private-message.deleted')!({ id: 'a', senderId: OLI, recipientId: ME }));
    await act(async () => page.resolve([message('a', 1), message('b', 2)]));
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
    expect(ids(hook)).toEqual(['b']);
  });

  it('une page plus ancienne arrivée après la suppression ne le fait pas réapparaître', async () => {
    const full = Array.from({ length: 50 }, (_, i) => message(`m${i}`, i + 1));
    fetchHistory.mockReset().mockResolvedValueOnce(full);
    const hook = await setup();
    const older = deferred<ChatMessage[]>();
    fetchHistory.mockReturnValueOnce(older.promise);
    await act(async () => void hook.result.current.loadOlder());
    await act(async () => mockHandlers.get('private-message.deleted')!({ id: 'ancien', senderId: OLI, recipientId: ME }));
    await act(async () => older.resolve([message('ancien', 90), message('autre', 91)]));
    expect(ids(hook)).toContain('autre');
    expect(ids(hook)).not.toContain('ancien');
  });

  it('oublie les suppressions quand on change de conversation', async () => {
    const hook = await setup();
    await act(async () => mockHandlers.get('private-message.deleted')!({ id: 'a', senderId: OLI, recipientId: ME }));
    fetchHistory.mockResolvedValueOnce([message('a', 1)]);
    await hook.rerender({ id: roomConversation });
    await waitFor(() => expect(ids(hook)).toEqual(['a']));
  });
});
