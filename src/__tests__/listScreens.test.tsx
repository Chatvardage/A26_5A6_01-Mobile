import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { useDirectMessages } from '@/hooks/useDirectMessages';
import { useServerChannels } from '@/hooks/useServerChannels';
import { useServers } from '@/hooks/useServers';
import { DirectMessagesScreen } from '@/screens/DirectMessagesScreen';
import { ServerScreen } from '@/screens/ServerScreen';
import { ServersScreen } from '@/screens/ServersScreen';
import type { ConversationSummary } from '@/types/conversation';
import type { ServerSummary } from '@/types/server';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('@/hooks/useDirectMessages');
jest.mock('@/hooks/useServerChannels');
jest.mock('@/hooks/useServers');
jest.mock('@/hooks/useRefreshOnFocus', () => ({ useRefreshOnFocus: jest.fn() }));
jest.mock('@/session/SessionContext', () => ({ useSession: () => ({ user: { id: 'me' }, realtime: { subscribe: () => () => undefined } }) }));

const SERVER_ID = '11111111-1111-4111-8111-111111111111';
const navigate = jest.fn();
const retry = jest.fn();
const refresh = jest.fn();
const conversation: ConversationSummary = {
  id: `dm:${SERVER_ID}`, kind: 'dm', title: 'Alice', unreadCount: 0,
  lastMessage: { id: 'message', content: 'Bonjour', senderId: 'alice', createdAt: '2026-10-01T10:00:00Z' },
};
const channel: ConversationSummary = { ...conversation, id: `room:${SERVER_ID}`, kind: 'room', title: 'général' };
const server: ServerSummary = { id: SERVER_ID, name: 'Équipe', memberCount: 2, channelIds: [channel.id], unreadCount: 1 };

const targets = [
  {
    name: 'messages privés', hook: useDirectMessages as jest.Mock, loading: 'Chargement des messages privés…',
    empty: 'Aucun message privé', data: [conversation, { ...conversation, id: 'second' }], button: /Alice/,
    destination: ['Conversation', { conversationId: conversation.id, title: 'Alice' }],
    element: () => <DirectMessagesScreen navigation={{ navigate } as never} route={{} as never} />,
  },
  {
    name: 'serveurs', hook: useServers as jest.Mock, loading: 'Chargement des serveurs…',
    empty: 'Aucun serveur', data: [server, { ...server, id: 'second' }], button: /Équipe/,
    destination: ['Server', { serverId: SERVER_ID, title: 'Équipe' }],
    element: () => <ServersScreen navigation={{ navigate } as never} route={{} as never} />,
  },
  {
    name: 'salons', hook: useServerChannels as jest.Mock, loading: 'Chargement des salons…',
    empty: 'Aucun salon', data: { channels: [channel, { ...channel, id: 'second' }] }, button: /général/,
    destination: ['Conversation', { conversationId: channel.id, title: 'général' }],
    element: () => <ServerScreen navigation={{ navigate } as never} route={{ params: { serverId: SERVER_ID } } as never} />,
  },
];

beforeEach(() => jest.clearAllMocks());

describe.each(targets)('Écran $name', ({ hook, loading, empty, data, button, destination, element }) => {
  const setState = (state: unknown) => hook.mockReturnValue({ state, refreshing: false, refreshError: null, retry, refresh });

  it('affiche chargement, erreur réessayable et résultat vide', async () => {
    setState({ status: 'loading' });
    const view = await render(element());
    expect(screen.getByText(loading)).toBeTruthy();
    setState({ status: 'error', message: 'Service indisponible' });
    await view.rerender(element());
    expect(screen.getByText('Service indisponible')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Réessayer' }));
    expect(retry).toHaveBeenCalledTimes(1);
    setState({ status: 'empty' });
    await view.rerender(element());
    expect(screen.getByText(empty)).toBeTruthy();
    expect(screen.getByTestId('refreshable-state').props.refreshControl.props.onRefresh).toBe(refresh);
    await act(async () => { screen.getByTestId('refreshable-state').props.refreshControl.props.onRefresh(); });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('affiche les éléments, ouvre la bonne route et permet le rafraîchissement', async () => {
    setState({ status: 'ready', data });
    const view = await render(element());
    await fireEvent.press(screen.getAllByRole('button', { name: button })[0]);
    expect(navigate).toHaveBeenCalledWith(...destination);
    const list = view.container.queryAll((node) => typeof node.props.onRefresh === 'function')[0];
    await act(async () => { list.props.onRefresh(); });
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

it('refuse un serveur invalide avant d’appeler le hook', async () => {
  await render(<ServerScreen navigation={{ navigate } as never} route={{ params: { serverId: 'invalide' } } as never} />);
  expect(screen.getByText('Ce serveur est introuvable.')).toBeTruthy();
  expect(useServerChannels).not.toHaveBeenCalled();
});

describe('Carte de nouveau message privé', () => {
  it.each<ReturnType<typeof useDirectMessages>['state']>([
    { status: 'loading' },
    { status: 'error', message: 'Service indisponible' },
    { status: 'empty' },
    { status: 'ready', data: [conversation] },
  ])('reste accessible dans l’état $status et ouvre le choix du destinataire', async (state) => {
    jest.mocked(useDirectMessages).mockReturnValue({ state, refreshing: false, refreshError: null, retry, refresh });
    await render(targets[0].element());
    const button = screen.getByRole('button', { name: 'Nouveau message privé' });
    expect(screen.queryByText('Nouveau')).toBeNull();
    if (state.status === 'ready') {
      expect(screen.getAllByRole('button')[0]).toBe(button);
      expect(screen.getByRole('button', { name: /Alice/ })).toBeTruthy();
    }
    await fireEvent.press(button);
    expect(navigate).toHaveBeenCalledWith('NewDirectMessage');
  });
});
