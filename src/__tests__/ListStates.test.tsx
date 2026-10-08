import { fireEvent, render, screen } from '@testing-library/react-native';

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

const ID = '11111111-1111-4111-8111-111111111111';
const navigate = jest.fn();
const retry = jest.fn();
const refresh = jest.fn();
const conversation: ConversationSummary = {
  id: `dm:${ID}`, kind: 'dm', title: 'Alice', unreadCount: 0,
  lastMessage: { id: 'm', content: 'Bonjour', senderId: 'alice', createdAt: '2026-10-01T10:00:00Z' },
};
const channel: ConversationSummary = { ...conversation, id: `room:${ID}`, kind: 'room', title: 'général' };
const server: ServerSummary = { id: ID, name: 'Équipe', memberCount: 2, channelIds: [channel.id], unreadCount: 0 };

// Les trois listes de conversations obéissent au même contrat à cinq états.
const lists = [
  {
    name: 'messages privés', hook: useDirectMessages as jest.Mock, item: 'Alice', data: [conversation],
    loading: 'Chargement des messages privés…', empty: 'Aucun message privé',
    element: () => <DirectMessagesScreen navigation={{ navigate, setOptions: jest.fn() } as never} route={{} as never} />,
  },
  {
    name: 'serveurs', hook: useServers as jest.Mock, item: 'Équipe', data: [server],
    loading: 'Chargement des serveurs…', empty: 'Aucun serveur',
    element: () => <ServersScreen navigation={{ navigate, setOptions: jest.fn() } as never} route={{} as never} />,
  },
  {
    name: 'salons', hook: useServerChannels as jest.Mock, item: 'général', data: { channels: [channel] },
    loading: 'Chargement des salons…', empty: 'Aucun salon',
    element: () => <ServerScreen navigation={{ navigate, setOptions: jest.fn() } as never} route={{ params: { serverId: ID } } as never} />,
  },
];

beforeEach(() => jest.clearAllMocks());

describe.each(lists)('Liste $name : cinq états', ({ hook, item, data, loading, empty, element }) => {
  const setHook = (state: unknown, extra: Record<string, unknown> = {}) =>
    hook.mockReturnValue({ state, refreshing: false, refreshError: null, retry, refresh, ...extra });

  it('1. chargement : indicateur et libellé, aucune liste', async () => {
    setHook({ status: 'loading' });
    await render(element());
    expect(screen.getByText(loading)).toBeTruthy();
    expect(screen.queryByText(item)).toBeNull();
  });

  it('2. erreur : raison utile et action Réessayer', async () => {
    setHook({ status: 'error', message: 'Le serveur rencontre un problème. Réessayez plus tard.' });
    await render(element());
    expect(screen.getByText('Le serveur rencontre un problème. Réessayez plus tard.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Réessayer'));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('3. vide : message explicite, ni erreur ni chargement', async () => {
    setHook({ status: 'empty' });
    await render(element());
    expect(screen.getByText(empty)).toBeTruthy();
    expect(screen.queryByText('Réessayer')).toBeNull();
  });

  it('4. succès : la liste et ses actions', async () => {
    setHook({ status: 'ready', data });
    await render(element());
    await fireEvent.press(screen.getByText(item));
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('5. rafraîchissement : la liste reste visible, sans bandeau d’erreur', async () => {
    setHook({ status: 'ready', data }, { refreshing: true });
    await render(element());
    expect(screen.getByText(item)).toBeTruthy();
    // La FlatList porte le RefreshControl : on remonte de l'élément jusqu'au conteneur défilant.
    let node = screen.getByText(item).parent;
    while (node && !node.props.refreshControl) node = node.parent;
    expect(node?.props.refreshControl.props.refreshing).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('5 bis. échec du rafraîchissement : la liste reste, avec la raison et Réessayer', async () => {
    setHook({ status: 'ready', data }, { refreshError: 'Impossible de joindre le serveur.' });
    await render(element());
    expect(screen.getByText(item)).toBeTruthy();
    expect(screen.getByText('Impossible de joindre le serveur.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Réessayer' }));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(retry).not.toHaveBeenCalled();
  });
});
