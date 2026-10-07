import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useDirectMessages } from '@/hooks/useDirectMessages';
import { useServers } from '@/hooks/useServers';
import { useServerChannels } from '@/hooks/useServerChannels';
import { useConversationHistory } from '@/hooks/useConversationHistory';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { useLoadable } from '@/hooks/useLoadable';
import { fetchDirectMessages } from '@/services/directMessagesService';
import { fetchServers, fetchServerChannels } from '@/services/serversService';
import { fetchHistory } from '@/services/messagesService';
import { apiUnreadSource } from '@/services/unreadService';
import { hasRealtimeBeenReady, onReady } from '@/services/websocketService';

jest.mock('@/services/directMessagesService');
jest.mock('@/services/serversService');
jest.mock('@/services/messagesService');
jest.mock('@/services/websocketService');
let mockFocus: () => void;
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => {
    mockFocus = callback;
  },
}));
beforeEach(() => jest.clearAllMocks());
it.each([false, true])('charge les privés et serveurs, résultat vide=%s', async (empty) => {
  jest
    .mocked(fetchDirectMessages)
    .mockResolvedValue(empty ? [] : [{ id: 'dm', kind: 'dm', title: 'Alice', lastMessage: null, unreadCount: 0 }]);
  jest
    .mocked(fetchServers)
    .mockResolvedValue(empty ? [] : [{ id: 's', name: 'Équipe', memberCount: 1, channelIds: [], unreadCount: 0 }]);
  const dm = await renderHook(() => useDirectMessages());
  const servers = await renderHook(() => useServers());
  await waitFor(() => expect(dm.result.current.state.status).toBe(empty ? 'empty' : 'ready'));
  await waitFor(() => expect(servers.result.current.state.status).toBe(empty ? 'empty' : 'ready'));
  expect(fetchDirectMessages).toHaveBeenCalledWith(apiUnreadSource);
  expect(fetchServers).toHaveBeenCalledWith(apiUnreadSource);
});
it.each([false, true])('charge historique et salons, résultat vide=%s', async (empty) => {
  jest
    .mocked(fetchHistory)
    .mockResolvedValue(empty ? [] : [{ id: 'm', senderId: 'u', content: 'Salut', createdAt: '', updatedAt: '' }]);
  jest
    .mocked(fetchServerChannels)
    .mockResolvedValue({
      name: 'Équipe',
      channels: empty ? [] : [{ id: 'c', kind: 'room', title: 'Général', lastMessage: null, unreadCount: 0 }],
    });
  const history = await renderHook(() => useConversationHistory('dm:a'));
  const channels = await renderHook(() => useServerChannels('s'));
  await waitFor(() => expect(history.result.current.state.status).toBe(empty ? 'empty' : 'ready'));
  await waitFor(() => expect(channels.result.current.state.status).toBe(empty ? 'empty' : 'ready'));
  expect(fetchHistory).toHaveBeenCalledWith('dm:a');
  expect(fetchServerChannels).toHaveBeenCalledWith('s', apiUnreadSource);
});
it('ne rafraîchit pas au premier focus puis rafraîchit au retour', async () => {
  const refresh = jest.fn();
  await renderHook(() => useRefreshOnFocus(refresh));
  await act(async () => mockFocus());
  expect(refresh).not.toHaveBeenCalled();
  await act(async () => mockFocus());
  expect(refresh).toHaveBeenCalledTimes(1);
});
it('ignore une ancienne erreur et affiche une erreur de refresh sur résultat vide', async () => {
  let reject!: (error: Error) => void;
  const oldLoad = () =>
    new Promise<string[]>((_, fail) => {
      reject = fail;
    });
  const newLoad = jest.fn().mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('network'));
  const view = await renderHook(
    ({ load }: { load: () => Promise<string[]> }) => useLoadable(load, (list) => list.length === 0),
    { initialProps: { load: oldLoad } },
  );
  await view.rerender({ load: newLoad });
  await waitFor(() => expect(view.result.current.state.status).toBe('empty'));
  await act(async () => reject(new Error('stale')));
  expect(view.result.current.state.status).toBe('empty');
  await act(async () => {
    await view.result.current.refresh();
  });
  expect(view.result.current.state.status).toBe('error');
});

describe('historique et reprise du canal temps réel', () => {
  let ready: () => void;
  beforeEach(() => {
    jest.mocked(fetchHistory).mockResolvedValue([
      { id: 'm1', senderId: 'u', content: 'a', createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z' },
    ]);
    jest.mocked(onReady).mockImplementation((handler) => {
      ready = handler;
      return jest.fn();
    });
  });

  it("recharge l'historique à chaque reconnexion, sauf le premier signal de la connexion initiale", async () => {
    jest.mocked(hasRealtimeBeenReady).mockReturnValue(false);
    const hook = await renderHook(() => useConversationHistory('dm:a'));
    await waitFor(() => expect(hook.result.current.state.status).toBe('ready'));
    await act(async () => ready());
    expect(fetchHistory).toHaveBeenCalledTimes(1);
    await act(async () => ready());
    expect(fetchHistory).toHaveBeenCalledTimes(2);
  });

  it('recharge dès la prochaine reconnexion quand le canal avait déjà été prêt', async () => {
    jest.mocked(hasRealtimeBeenReady).mockReturnValue(true);
    const hook = await renderHook(() => useConversationHistory('dm:a'));
    await waitFor(() => expect(hook.result.current.state.status).toBe('ready'));
    await act(async () => ready());
    expect(fetchHistory).toHaveBeenCalledTimes(2);
  });

  it("n'échoue pas si le canal temps réel n'est pas configuré", async () => {
    jest.mocked(onReady).mockImplementation(() => {
      throw new Error('Session absente');
    });
    const hook = await renderHook(() => useConversationHistory('dm:a'));
    await waitFor(() => expect(hook.result.current.state.status).toBe('ready'));
  });
});
