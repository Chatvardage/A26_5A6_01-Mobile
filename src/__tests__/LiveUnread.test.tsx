import { act, render, renderHook, screen, waitFor } from '@testing-library/react-native';

import { DirectMessagesScreen } from '@/screens/DirectMessagesScreen';
import { ServerScreen } from '@/screens/ServerScreen';
import { ServersScreen } from '@/screens/ServersScreen';
import { fetchUnreadCounts } from '@/services/unreadService';
import { getPermission } from '@/adapters/notifications.adapter';
import type { ConversationSummary } from '@/types/conversation';
import type { ServerSummary } from '@/types/server';
import { useLiveConversations, useLiveServers } from '@/unread/liveUnread';
import { UnreadProvider, useUnread } from '@/unread/UnreadContext';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@/services/unreadService');
jest.mock('@/adapters/notifications.adapter');
jest.mock('@/hooks/useRefreshOnFocus', () => ({ useRefreshOnFocus: jest.fn() }));
jest.mock('@/hooks/useRefreshOnServerChange', () => ({ useRefreshOnServerChange: jest.fn() }));
const mockRealtime = { onReady: jest.fn() };
const { onReady } = mockRealtime;
jest.mock('@/session/SessionContext', () => ({ useSession: () => ({ user: { id: 'me' }, realtime: mockRealtime }) }));
let mockState: unknown;
jest.mock('@/hooks/useServers', () => ({ useServers: () => ({ state: mockState, refreshing: false, retry: jest.fn(), refresh: jest.fn() }) }));
jest.mock('@/hooks/useServerChannels', () => ({ useServerChannels: () => ({ state: mockState, refreshing: false, retry: jest.fn(), refresh: jest.fn() }) }));
jest.mock('@/hooks/useDirectMessages', () => ({ useDirectMessages: () => ({ state: mockState, refreshing: false, retry: jest.fn(), refresh: jest.fn() }) }));

const SERVER = '11111111-1111-4111-8111-111111111111';
const CH1 = '22222222-2222-4222-8222-222222222222';
const CH2 = '33333333-3333-4333-8333-333333333333';
const OLI = '44444444-4444-4444-8444-444444444444';

const server: ServerSummary = { id: SERVER, name: 'Chatvardage', memberCount: 2, channelIds: [CH1, CH2], unreadCount: 7 };
const channel = (id: string, title: string, unreadCount = 0): ConversationSummary => ({
  id: `room:${id}`,
  kind: 'room',
  title,
  lastMessage: null,
  unreadCount,
});
const dm: ConversationSummary = { id: `dm:${OLI}`, kind: 'dm', title: 'oli', lastMessage: null, unreadCount: 5 };

const wrapper = ({ children }: { children: React.ReactNode }) => <UnreadProvider>{children}</UnreadProvider>;
const base = { navigation: { navigate: jest.fn(), setOptions: jest.fn() }, route: { params: { serverId: SERVER } } };
const serversProps = base as unknown as Parameters<typeof ServersScreen>[0];
const serverProps = base as unknown as Parameters<typeof ServerScreen>[0];
const dmProps = base as unknown as Parameters<typeof DirectMessagesScreen>[0];

beforeEach(() => {
  jest.mocked(onReady).mockReturnValue(jest.fn());
  jest.mocked(getPermission).mockResolvedValue('denied');
  jest.mocked(fetchUnreadCounts).mockResolvedValue({ [`room:${CH1}`]: 2, [`room:${CH2}`]: 1, [`dm:${OLI}`]: 4 });
});

describe('hooks', () => {
  it('gardent les compteurs du chargement tant que ceux du serveur ne sont pas lus', async () => {
    const list = [server];
    const hook = renderHook(() => useLiveServers(list));
    await hook;
    expect((await hook).result.current).toBe(list);
    const convs = [dm];
    expect((await renderHook(() => useLiveConversations(convs))).result.current).toBe(convs);
  });

  it('appliquent les compteurs en direct une fois lus : somme des salons pour un serveur', async () => {
    const hook = await renderHook(() => ({ servers: useLiveServers([server]), convs: useLiveConversations([dm, channel(CH1, 'a')]), unread: useUnread() }), { wrapper });
    await waitFor(() => expect(hook.result.current.unread.loaded).toBe(true));
    expect(hook.result.current.servers[0].unreadCount).toBe(3);
    expect(hook.result.current.convs.map((c) => c.unreadCount)).toEqual([4, 2]);
    await act(async () => hook.result.current.unread.increment(`room:${CH2}`));
    expect(hook.result.current.servers[0].unreadCount).toBe(4);
    await act(async () => hook.result.current.unread.clear(`room:${CH1}`));
    await act(async () => hook.result.current.unread.clear(`room:${CH2}`));
    expect(hook.result.current.servers[0].unreadCount).toBe(0);
  });

  it('retombent sur 0 pour une conversation sans non-lu', async () => {
    jest.mocked(fetchUnreadCounts).mockResolvedValue({});
    const hook = await renderHook(() => ({ convs: useLiveConversations([channel(CH1, 'a', 9)]), unread: useUnread() }), { wrapper });
    await waitFor(() => expect(hook.result.current.unread.loaded).toBe(true));
    expect(hook.result.current.convs[0].unreadCount).toBe(0);
  });
});

describe('écrans', () => {
  it("la liste des serveurs affiche la pastille du serveur où quelqu'un a écrit, et la met à jour", async () => {
    mockState = { status: 'ready', data: [server, { ...server, id: 'autre', name: 'Vide', channelIds: [] }] };
    await render(<ServersScreen {...serversProps} />, { wrapper });
    // Avant la lecture des compteurs : celui du chargement.
    await waitFor(() => expect(screen.getAllByTestId('unread-badge')).toHaveLength(1));
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.queryByText('7')).toBeNull();
  });

  it('la liste des salons et celle des messages privés suivent les compteurs en direct', async () => {
    mockState = { status: 'ready', data: { channels: [channel(CH1, '#annonces', 0), channel(CH2, '#général', 0)] } };
    const view = await render(<ServerScreen {...serverProps} />, { wrapper });
    await waitFor(() => expect(screen.getByText('2')).toBeTruthy());
    expect(screen.getByText('1')).toBeTruthy();
    mockState = { status: 'ready', data: [dm] };
    await view.rerender(<DirectMessagesScreen {...dmProps} />);
    await waitFor(() => expect(screen.getByText('4')).toBeTruthy());
  });

  it('sans compteurs lus, les listes gardent ceux de leur chargement', async () => {
    mockState = { status: 'ready', data: [dm] };
    await render(<DirectMessagesScreen {...dmProps} />);
    expect(screen.getByText('5')).toBeTruthy();
    mockState = { status: 'loading' };
    await render(<DirectMessagesScreen {...dmProps} />);
  });
});
