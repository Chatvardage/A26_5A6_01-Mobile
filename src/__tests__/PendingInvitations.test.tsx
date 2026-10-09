import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';

import { PersistentNavigation } from '@/components/PersistentNavigation';
import { usePendingInvitations } from '@/hooks/usePendingInvitations';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { useRefreshOnServerChange } from '@/hooks/useRefreshOnServerChange';
import { useServers } from '@/hooks/useServers';
import { ServersScreen } from '@/screens/ServersScreen';
import { getInvitations, type Invitation } from '@/services/rooms.service';
import { InvitationsProvider, useInvitations } from '@/unread/InvitationsContext';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('@/services/rooms.service', () => ({ getInvitations: jest.fn() }));
jest.mock('@/hooks/useServers');
jest.mock('@/hooks/useRefreshOnFocus', () => ({ useRefreshOnFocus: jest.fn() }));
jest.mock('@/hooks/useRefreshOnServerChange', () => ({ useRefreshOnServerChange: jest.fn() }));
jest.mock('@/session/SessionContext', () => ({ useSession: () => ({ user: { id: 'me' }, realtime: { subscribe: () => () => undefined } }) }));

const invitation = (id: string): Invitation => ({ serveur: { id, nom: id, nombreMembres: 1, icone: null, public: false, parDefaut: false }, invitePar: 'x', inviteLe: '2026-10-08' });
const lastRefresh = () => jest.mocked(useRefreshOnServerChange).mock.calls.at(-1)![0] as () => Promise<void>;
const wrapper = ({ children }: { children: ReactNode }) => <InvitationsProvider>{children}</InvitationsProvider>;
let appStateListener: (state: string) => void = () => undefined;

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getInvitations).mockResolvedValue([invitation('a')]);
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, listener: typeof appStateListener) => {
    appStateListener = listener;
    return { remove: jest.fn() };
  }) as never);
});
afterEach(() => jest.restoreAllMocks());

it('compte les invitations en attente et suit leurs changements', async () => {
  const hook = await renderHook(() => useInvitations(), { wrapper });
  await waitFor(() => expect(hook.result.current.count).toBe(1));
  jest.mocked(getInvitations).mockResolvedValue([invitation('a'), invitation('b')]);
  await act(async () => lastRefresh()());
  expect(hook.result.current.count).toBe(2);
  jest.mocked(getInvitations).mockResolvedValue([]);
  await act(async () => appStateListener('background'));
  expect(hook.result.current.count).toBe(2);
  await act(async () => appStateListener('active'));
  expect(hook.result.current.count).toBe(0);
  // Un échec garde la dernière valeur connue.
  jest.mocked(getInvitations).mockRejectedValue(new Error('réseau'));
  await act(async () => lastRefresh()());
  expect(hook.result.current.count).toBe(0);
});

it('ignore une réponse arrivée après le démontage ; sans fournisseur, aucune invitation', async () => {
  let resolve: (value: Invitation[]) => void = () => undefined;
  jest.mocked(getInvitations).mockReturnValue(new Promise((r) => { resolve = r; }));
  const hook = await renderHook(() => useInvitations(), { wrapper });
  await hook.unmount();
  await act(async () => resolve([invitation('a')]));
  expect(hook.result.current.count).toBe(0);
  const alone = await renderHook(() => useInvitations());
  expect(alone.result.current.count).toBe(0);
  await expect(alone.result.current.refresh()).resolves.toBeUndefined();
});

it('relit les invitations quand un écran reprend le focus', async () => {
  const hook = await renderHook(() => usePendingInvitations(), { wrapper });
  await waitFor(() => expect(hook.result.current).toBe(1));
  expect(useRefreshOnFocus).toHaveBeenCalledWith(lastRefresh());
});

it('affiche la pastille sur l’onglet Serveurs de la barre de navigation', async () => {
  const view = await render(<PersistentNavigation selected="Rooms" onNavigate={jest.fn()} />, { wrapper });
  expect(await screen.findByTestId('invitations-tab-badge')).toHaveTextContent('1');
  expect(screen.getByLabelText('1 invitation en attente')).toBeTruthy();
  await view.unmount();
  jest.mocked(getInvitations).mockResolvedValue([]);
  await render(<PersistentNavigation selected="Rooms" onNavigate={jest.fn()} />, { wrapper });
  await waitFor(() => expect(getInvitations).toHaveBeenCalledTimes(2));
  expect(screen.queryByTestId('invitations-tab-badge')).toBeNull();
});

it('affiche la pastille à côté de « Découvrir des serveurs » seulement avec une invitation', async () => {
  jest.mocked(useServers).mockReturnValue({ state: { status: 'ready', data: [{ id: 's', name: 'Équipe', memberCount: 2, channelIds: ['c'], unreadCount: 0 }] }, refreshing: false, refreshError: null, retry: jest.fn(), refresh: jest.fn() } as never);
  const navigate = jest.fn();
  const view = await render(<ServersScreen navigation={{ navigate, setOptions: jest.fn() } as never} route={{} as never} />, { wrapper });
  const button = await screen.findByRole('button', { name: 'Découvrir des serveurs (1)' });
  expect(screen.getByTestId('action-badge')).toHaveTextContent('1');
  await fireEvent.press(button);
  expect(navigate).toHaveBeenCalledWith('DiscoverServers', { mode: 'discover' });
  await view.unmount();
  jest.mocked(getInvitations).mockResolvedValue([]);
  await render(<ServersScreen navigation={{ navigate, setOptions: jest.fn() } as never} route={{} as never} />, { wrapper });
  await waitFor(() => expect(getInvitations).toHaveBeenCalledTimes(2));
  expect(screen.queryByTestId('action-badge')).toBeNull();
});
