import { render, screen, fireEvent, userEvent } from '@testing-library/react-native';
import { ServersScreen } from '@/screens/ServersScreen';
import { DirectMessagesScreen } from '@/screens/DirectMessagesScreen';
import { ServerScreen } from '@/screens/ServerScreen';
import { ConversationScreen } from '@/screens/ConversationScreen';
import { SearchScreen } from '@/screens/SearchScreen';
import { PreferencesScreen } from '@/screens/PreferencesScreen';
import type { LoadState } from '@/hooks/useLoadable';
import type { ConversationSummary, ChatMessage } from '@/types/conversation';
import type { ServerSummary } from '@/types/server';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@react-navigation/elements', () => ({ useHeaderHeight: () => 40 }));
jest.mock('@/hooks/useRefreshOnFocus', () => ({ useRefreshOnFocus: jest.fn() }));
jest.mock('@/hooks/useServers', () => ({ useServers: () => mockResult }));
jest.mock('@/hooks/useDirectMessages', () => ({ useDirectMessages: () => mockResult }));
jest.mock('@/hooks/useServerChannels', () => ({ useServerChannels: () => mockResult }));
jest.mock('@/hooks/useMessages', () => ({
  useMessages: () => ({
    messages: mockMessages,
    status: mockMessageStatus,
    errorMessage: mockMessageError,
    accessError: null,
    loadingOlder: false,
    olderError: null,
    connection: 'ready',
    retry: mockRetry,
    loadOlder: jest.fn(),
    send: jest.fn(),
    edit: jest.fn(),
  }),
}));
jest.mock('@/session/SessionContext', () => ({ useSession: () => ({ user: mockUser, signOut: mockSignOut }) }));
let mockUser: { id: string; pseudo: string } | null;
const mockSignOut = jest.fn();
const retry = jest.fn();
const mockRetry = retry;
const refresh = jest.fn();
let mockResult: { state: LoadState<unknown>; refreshing: boolean; retry: typeof retry; refresh: typeof refresh };
let mockMessages: ChatMessage[];
let mockMessageStatus: 'loading' | 'error' | 'ready';
let mockMessageError: string | null;
const id = '0b7d6f3e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const navigation = { navigate: jest.fn() };
const server: ServerSummary = { id, name: 'Équipe', memberCount: 2, channelIds: [id], unreadCount: 0 };
const channel: ConversationSummary = {
  id: `room:${id}`,
  kind: 'room',
  title: 'Général',
  lastMessage: null,
  unreadCount: 0,
};
const message: ChatMessage = {
  id: 'm',
  senderId: id,
  content: 'Salut',
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-10-01T10:00:00Z',
};
const props = { navigation } as unknown as Parameters<typeof ServersScreen>[0];
const serverProps = { navigation, route: { params: { serverId: id } } } as unknown as Parameters<
  typeof ServerScreen
>[0];
const conversationProps = (conversationId: string) =>
  ({ route: { params: { conversationId } } }) as Parameters<typeof ConversationScreen>[0];
beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id, pseudo: 'alice' };
  mockResult = { state: { status: 'loading' }, refreshing: false, retry, refresh };
  mockMessages = [];
  mockMessageStatus = 'loading';
  mockMessageError = null;
});

it.each([
  ['serveurs', () => <ServersScreen {...props} />, 'Aucun serveur'],
  [
    'privés',
    () => <DirectMessagesScreen {...(props as unknown as Parameters<typeof DirectMessagesScreen>[0])} />,
    'Aucun message privé',
  ],
  ['salons', () => <ServerScreen {...serverProps} />, 'Aucun salon'],
  ['historique', () => <ConversationScreen {...conversationProps(`dm:${id}`)} />, 'Aucun message'],
])('affiche loading, erreur avec retry et vide pour %s', async (_, element, empty) => {
  const view = await render(element());
  expect(screen.getByText(/Chargement des/)).toBeTruthy();
  mockResult.state = { status: 'error', message: 'Réseau indisponible' };
  mockMessageStatus = 'error';
  mockMessageError = 'Réseau indisponible';
  await view.rerender(element());
  expect(screen.getByText('Réseau indisponible')).toBeTruthy();
  await userEvent.setup().press(screen.getByText('Réessayer'));
  expect(retry).toHaveBeenCalledTimes(1);
  mockResult.state = { status: 'empty' };
  mockMessageStatus = 'ready';
  mockMessages = [];
  mockMessageError = null;
  await view.rerender(element());
  expect(screen.getByText(empty)).toBeTruthy();
});

it('ouvre un serveur et permet le rafraîchissement de sa liste', async () => {
  mockResult.state = { status: 'ready', data: [server, { ...server, id: 'second', name: 'Autre' }] };
  await render(<ServersScreen {...props} />);
  await fireEvent.press(screen.getByText('Équipe'));
  expect(navigation.navigate).toHaveBeenCalledWith('Server', { serverId: id, title: 'Équipe' });
  await fireEvent(screen.getByText('Équipe'), 'refresh');
  expect(refresh).toHaveBeenCalled();
});
it.each([true, false])('ouvre un privé, utilisateur présent=%s', async (present) => {
  if (!present) mockUser = null;
  mockResult.state = { status: 'ready', data: [channel, { ...channel, id: 'second', title: 'Autre' }] };
  await render(<DirectMessagesScreen {...(props as unknown as Parameters<typeof DirectMessagesScreen>[0])} />);
  await fireEvent.press(screen.getByText('Général'));
  expect(navigation.navigate).toHaveBeenCalledWith('Conversation', {
    conversationId: channel.id,
    title: channel.title,
  });
});
it.each([true, false])('ouvre un salon, utilisateur présent=%s', async (present) => {
  if (!present) mockUser = null;
  mockResult.state = { status: 'ready', data: { channels: [channel, { ...channel, id: 'second', title: 'Autre' }] } };
  await render(<ServerScreen {...serverProps} />);
  await fireEvent.press(screen.getByText('Général'));
  expect(navigation.navigate).toHaveBeenCalledWith('Conversation', {
    conversationId: channel.id,
    title: channel.title,
  });
});
it('refuse les routes invalides avant chargement', async () => {
  const view = await render(
    <ServerScreen {...{ ...serverProps, route: { ...serverProps.route, params: { serverId: 'invalid' } } }} />,
  );
  expect(screen.getByText('Ce serveur est introuvable.')).toBeTruthy();
  await view.rerender(<ConversationScreen {...conversationProps('invalid')} />);
  expect(screen.getByText('Cette conversation est introuvable.')).toBeTruthy();
});
it.each([true, false])('affiche les messages inversés, utilisateur présent=%s', async (present) => {
  if (!present) mockUser = null;
  mockMessageStatus = 'ready';
  mockMessages = [message, { ...message, id: 'other', senderId: 'someone', content: 'Bonjour' }];
  await render(<ConversationScreen {...conversationProps(`room:${id}`)} />);
  expect(screen.getByText('Salut')).toBeTruthy();
  expect(screen.getByText('Bonjour')).toBeTruthy();
  expect(screen.getByLabelText('Message')).toBeTruthy();
});
it('affiche la recherche et conserve la saisie', async () => {
  await render(<SearchScreen />);
  expect(screen.getByText('Recherchez un message')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Recherche'), 'bonjour');
  expect(screen.getByText('Recherche non disponible')).toBeTruthy();
  expect(screen.getByLabelText('Recherche').props.value).toBe('bonjour');
});
it.each([true, false])('déconnecte depuis Préférences, utilisateur présent=%s', async (present) => {
  if (!present) mockUser = null;
  await render(<PreferencesScreen />);
  expect(screen.getByText(present ? 'alice' : '—')).toBeTruthy();
  await userEvent.setup().press(screen.getByText('Se déconnecter'));
  expect(mockSignOut).toHaveBeenCalledTimes(1);
});
