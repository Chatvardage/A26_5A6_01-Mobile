import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';

import { LIST_PAGE_SIZE, usePagedList } from '@/hooks/usePagedList';
import { useDirectMessages } from '@/hooks/useDirectMessages';
import { useServers } from '@/hooks/useServers';
import { DirectMessagesScreen } from '@/screens/DirectMessagesScreen';
import { ServersScreen } from '@/screens/ServersScreen';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('@/services/rooms.service', () => ({ getInvitations: jest.fn(async () => []) }));
jest.mock('@/hooks/useServers');
jest.mock('@/hooks/useDirectMessages');
jest.mock('@/hooks/useRefreshOnFocus', () => ({ useRefreshOnFocus: jest.fn() }));
jest.mock('@/hooks/useRefreshOnServerChange', () => ({ useRefreshOnServerChange: jest.fn() }));
jest.mock('@/session/SessionContext', () => ({ useSession: () => ({ user: { id: 'me' }, realtime: { subscribe: () => () => undefined } }) }));

const ready = (data: unknown[]) => ({ state: { status: 'ready', data }, refreshing: false, refreshError: null, retry: jest.fn(), refresh: jest.fn() }) as never;
const navigation = { navigate: jest.fn(), setOptions: jest.fn() } as never;

it('affiche 15 éléments à la fois, puis la page suivante', async () => {
  const hook = await renderHook(({ items }: { items: number[] }) => usePagedList(items), { initialProps: { items: Array.from({ length: 32 }, (_, i) => i) } });
  expect(LIST_PAGE_SIZE).toBe(15);
  expect(hook.result.current.visible).toHaveLength(15);
  expect(hook.result.current.hasMore).toBe(true);
  await act(async () => hook.result.current.showMore());
  await act(async () => hook.result.current.showMore());
  expect(hook.result.current.visible).toHaveLength(32);
  expect(hook.result.current.hasMore).toBe(false);
  // Une liste rechargée garde le nombre déjà affiché.
  await hook.rerender({ items: Array.from({ length: 40 }, (_, i) => i) });
  expect(hook.result.current.visible).toHaveLength(40);
});

it('pagine la liste des serveurs', async () => {
  jest.mocked(useServers).mockReturnValue(ready(Array.from({ length: 16 }, (_, i) => ({ id: `s${i}`, name: `Serveur ${i}`, memberCount: 1, channelIds: [], unreadCount: 0 }))));
  await render(<ServersScreen navigation={navigation} route={{} as never} />);
  expect(screen.queryByText('Serveur 15')).toBeNull();
  // La liste virtualisée n'affiche pas tout en test : le bouton disparaît une fois les 16 serveurs affichés.
  await fireEvent.press(screen.getByRole('button', { name: 'Afficher plus' }));
  expect(screen.queryByRole('button', { name: 'Afficher plus' })).toBeNull();
});

it('pagine la liste des messages privés', async () => {
  jest.mocked(useDirectMessages).mockReturnValue(ready(Array.from({ length: 16 }, (_, i) => ({ id: `dm:${i}`, kind: 'dm', title: `Contact ${i}`, lastMessage: null, unreadCount: 0 }))));
  await render(<DirectMessagesScreen navigation={navigation} route={{} as never} />);
  expect(screen.getByText('Contact 0')).toBeTruthy();
  expect(screen.queryByText('Contact 15')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Afficher plus' }));
  expect(screen.queryByRole('button', { name: 'Afficher plus' })).toBeNull();
});
