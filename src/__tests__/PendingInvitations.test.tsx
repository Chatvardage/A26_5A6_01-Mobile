import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';

import { usePendingInvitations } from '@/hooks/usePendingInvitations';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { useRefreshOnServerChange } from '@/hooks/useRefreshOnServerChange';
import { useServers } from '@/hooks/useServers';
import { ServersScreen } from '@/screens/ServersScreen';
import { getInvitations, type Invitation } from '@/services/rooms.service';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('@/services/rooms.service', () => ({ getInvitations: jest.fn() }));
jest.mock('@/hooks/useServers');
jest.mock('@/hooks/useRefreshOnFocus', () => ({ useRefreshOnFocus: jest.fn() }));
jest.mock('@/hooks/useRefreshOnServerChange', () => ({ useRefreshOnServerChange: jest.fn() }));
jest.mock('@/session/SessionContext', () => ({ useSession: () => ({ user: { id: 'me' }, realtime: { subscribe: () => () => undefined } }) }));

const invitation = (id: string): Invitation => ({ serveur: { id, nom: id, nombreMembres: 1, icone: null, public: false, parDefaut: false }, invitePar: 'x', inviteLe: '2026-10-08' });
const lastRefresh = () => jest.mocked(useRefreshOnServerChange).mock.calls.at(-1)![0] as () => Promise<void>;

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getInvitations).mockResolvedValue([invitation('a')]);
});

it('compte les invitations en attente et suit leurs changements', async () => {
  const hook = await renderHook(() => usePendingInvitations());
  await waitFor(() => expect(hook.result.current).toBe(1));
  expect(useRefreshOnFocus).toHaveBeenCalledWith(lastRefresh());
  jest.mocked(getInvitations).mockResolvedValue([invitation('a'), invitation('b')]);
  await act(async () => lastRefresh()());
  expect(hook.result.current).toBe(2);
  // Un échec garde la dernière valeur connue.
  jest.mocked(getInvitations).mockRejectedValue(new Error('réseau'));
  await act(async () => lastRefresh()());
  expect(hook.result.current).toBe(2);
});

it('ignore une réponse arrivée après le démontage', async () => {
  let resolve: (value: Invitation[]) => void = () => undefined;
  jest.mocked(getInvitations).mockReturnValue(new Promise((r) => { resolve = r; }));
  const hook = await renderHook(() => usePendingInvitations());
  await hook.unmount();
  await act(async () => resolve([invitation('a')]));
  expect(hook.result.current).toBe(0);
});

it('affiche la pastille à côté de « Découvrir des serveurs » seulement avec une invitation', async () => {
  jest.mocked(useServers).mockReturnValue({ state: { status: 'ready', data: [{ id: 's', name: 'Équipe', memberCount: 2, channelIds: ['c'], unreadCount: 0 }] }, refreshing: false, refreshError: null, retry: jest.fn(), refresh: jest.fn() } as never);
  const navigate = jest.fn();
  const view = await render(<ServersScreen navigation={{ navigate } as never} route={{} as never} />);
  const button = await screen.findByRole('button', { name: 'Découvrir des serveurs (1)' });
  expect(screen.getByTestId('action-badge')).toHaveTextContent('1');
  await fireEvent.press(button);
  expect(navigate).toHaveBeenCalledWith('DiscoverServers', { mode: 'discover' });
  await view.unmount();
  jest.mocked(getInvitations).mockResolvedValue([]);
  await render(<ServersScreen navigation={{ navigate } as never} route={{} as never} />);
  await waitFor(() => expect(getInvitations).toHaveBeenCalledTimes(2));
  expect(screen.queryByTestId('action-badge')).toBeNull();
  expect(screen.getByText('Découvrir des serveurs')).toBeTruthy();
});
