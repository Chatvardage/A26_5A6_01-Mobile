import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useFocusEffect } from '@react-navigation/native';

import { useDirectMessages } from '@/hooks/useDirectMessages';
import { useServerChannels } from '@/hooks/useServerChannels';
import { useServers } from '@/hooks/useServers';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { fetchDirectMessages } from '@/services/directMessagesService';
import { fetchServerChannels, fetchServers } from '@/services/serversService';
import { ApiError } from '@/services/ApiError';
import type { UnreadSource } from '@/services/unreadSource';

jest.mock('@/services/directMessagesService');
jest.mock('@/services/serversService');
jest.mock('@react-navigation/native', () => ({ useFocusEffect: jest.fn() }));
const unread: UnreadSource = { getCounts: jest.fn().mockResolvedValue({}) };

describe.each([
  { name: 'DM', useHook: () => useDirectMessages(unread), service: fetchDirectMessages, empty: [], data: [{ id: 'dm' }], args: [unread] },
  { name: 'serveurs', useHook: () => useServers(unread), service: fetchServers, empty: [], data: [{ id: 'server' }], args: [unread] },
  { name: 'salons', useHook: () => useServerChannels('server-id', unread), service: fetchServerChannels, empty: { channels: [] }, data: { channels: [{ id: 'room' }] }, args: ['server-id', unread] },
])('Hook $name', ({ useHook, service, empty, data, args }) => {
  beforeEach(() => (service as jest.Mock).mockReset());
  it('transmet les paramètres et distingue données, résultat vide et erreur', async () => {
    (service as jest.Mock).mockResolvedValueOnce(data).mockResolvedValueOnce(empty).mockRejectedValueOnce(new ApiError('forbidden', 'x'));
    const { result } = await renderHook(() => useHook());
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', data }));
    expect(service).toHaveBeenCalledWith(...args);
    await act(async () => result.current.refresh());
    expect(result.current.state).toEqual({ status: 'empty' });
    await act(async () => result.current.retry());
    expect(result.current.state).toEqual({ status: 'error', message: 'Vous n’avez pas accès à cette conversation.' });
  });
});

it('rafraîchit aux reprises de focus mais pas au premier affichage', async () => {
  const refresh = jest.fn();
  await renderHook(() => useRefreshOnFocus(refresh));
  const focused = jest.mocked(useFocusEffect).mock.calls.at(-1)![0];
  await act(async () => { focused(); });
  expect(refresh).not.toHaveBeenCalled();
  await act(async () => { focused(); });
  expect(refresh).toHaveBeenCalledTimes(1);
});
