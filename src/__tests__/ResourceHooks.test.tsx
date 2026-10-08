import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useDirectMessages } from '@/hooks/useDirectMessages';
import { useServers } from '@/hooks/useServers';
import { useServerChannels } from '@/hooks/useServerChannels';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { useLoadable } from '@/hooks/useLoadable';
import { fetchDirectMessages } from '@/services/directMessagesService';
import { fetchServers, fetchServerChannels } from '@/services/serversService';

jest.mock('@/services/directMessagesService');
jest.mock('@/services/serversService');
jest.mock('@/services/messagesService');
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
  expect(fetchDirectMessages).toHaveBeenCalledWith(undefined);
  expect(fetchServers).toHaveBeenCalledWith(undefined);
});
it.each([false, true])('charge les salons, résultat vide=%s', async (empty) => {
  jest
    .mocked(fetchServerChannels)
    .mockResolvedValue({
      name: 'Équipe',
      channels: empty ? [] : [{ id: 'c', kind: 'room', title: 'Général', lastMessage: null, unreadCount: 0 }],
    });
  const channels = await renderHook(() => useServerChannels('s'));
  await waitFor(() => expect(channels.result.current.state.status).toBe(empty ? 'empty' : 'ready'));
  expect(fetchServerChannels).toHaveBeenCalledWith('s', undefined);
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
