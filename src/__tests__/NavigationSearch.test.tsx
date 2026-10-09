import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button, Text as MockText } from 'react-native';

import { subscribeToNetwork } from '@/adapters/network.adapter';
import { RootNavigator } from '@/navigation/RootNavigator';
import type { RootStackParamList } from '@/navigation/routes';
import { fetchUnreadCounts } from '@/services/unreadService';

const OLI = '22222222-2222-4222-8222-222222222222';
const ROOM = '33333333-3333-4333-8333-333333333333';
const MESSAGE = '44444444-4444-4444-8444-444444444444';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@/screens/RoomsScreen', () => ({ RoomsScreen: () => <MockText>Accueil annonces</MockText> }));
let mockStatus: 'signedIn' | 'signedOut' | 'loading';
let mockUser: { id: string } | null;
const mockRealtime = {
  getRealtimeState: () => 'disconnected' as const,
  onConnectionState: () => () => undefined,
  onReady: () => () => undefined,
  subscribe: () => () => undefined,
  joinRoom: async () => undefined,
  leaveRoom: async () => undefined,
};
jest.mock('@/session/SessionContext', () => ({
  useSession: () => ({ status: mockStatus, user: mockUser, error: null, signOut: jest.fn(), restoreSession: jest.fn(), realtime: mockRealtime }),
}));
jest.mock('@/adapters/network.adapter');
jest.mock('@/services/unreadService');
jest.mock('@/screens/DirectMessagesScreen', () => ({ DirectMessagesScreen: () => <MockLinks /> }));
jest.mock('@/screens/ServersScreen', () => ({ ServersScreen: () => <MockText>Liste serveurs</MockText> }));
jest.mock('@/screens/SearchScreen', () => ({ SearchScreen: () => <MockText>Recherche globale</MockText> }));
jest.mock('@/screens/PreferencesScreen', () => ({ PreferencesScreen: () => <MockText>Préférences</MockText> }));
jest.mock('@/screens/ServerScreen', () => ({ ServerScreen: () => <MockText>Serveur</MockText> }));
jest.mock('@/screens/ConversationScreen', () => ({
  ConversationScreen: ({ route }: { route: { params?: { messageId?: string } } }) => (
    <>
      <MockText>{`Conversation ouverte ${route.params?.messageId ?? ''}`}</MockText>
      <MockBackButton />
    </>
  ),
}));
jest.mock('@/screens/ConversationSearchScreen', () => ({
  ConversationSearchScreen: ({ route }: { route: { params: { conversationId: string } } }) => (
    <>
      <MockText>{`Recherche dans ${route.params.conversationId}`}</MockText>
      <MockFoundButton />
    </>
  ),
}));
jest.mock('@/components/AppServices', () => ({
  AppServices: ({ userId, activeConversationId }: { userId: string; activeConversationId: string | null }) => (
    <MockText testID="services">{`${userId}|${activeConversationId ?? 'aucune'}`}</MockText>
  ),
}));

function MockBackButton() {
  const nav = useNavigation<NavigationProp<RootStackParamList>>();
  return <Button title="Flèche retour" onPress={() => nav.goBack()} />;
}
// Même appel que ConversationSearchScreen quand on touche un résultat.
function MockFoundButton() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <Button
      title="Résultat"
      onPress={() => nav.popTo('Conversation', { conversationId: `dm:${OLI}`, title: 'oli', messageId: MESSAGE, focusToken: Date.now() })}
    />
  );
}

function MockLinks() {
  const nav = useNavigation<NavigationProp<RootStackParamList>>();
  return (
    <>
      <Button title="Ouvrir conversation" onPress={() => nav.navigate('Conversation', { conversationId: `dm:${OLI}`, title: 'oli' })} />
      <Button title="Ouvrir salon" onPress={() => nav.navigate('Conversation', { conversationId: `room:${ROOM}` })} />
      <Button title="Ouvrir invalide" onPress={() => nav.navigate('Conversation', { conversationId: 'dm:id' })} />
      <Button title="Ouvrir sans paramètres" onPress={() => nav.navigate('Conversation', undefined!)} />
    </>
  );
}

beforeEach(() => {
  mockStatus = 'signedIn';
  mockUser = { id: 'me' };
  jest.mocked(subscribeToNetwork).mockReturnValue(() => undefined);
  jest.mocked(fetchUnreadCounts).mockResolvedValue({});
});

it("suit la conversation affichée et sa recherche, puis revient à « aucune »", async () => {
  await render(<RootNavigator />);
  await fireEvent.press(screen.getByRole('tab', { name: 'Messages' }));
  await waitFor(() => expect(screen.getByTestId('services')).toBeTruthy());
  expect(screen.getByTestId('services').props.children).toBe('me|aucune');
  await fireEvent.press(screen.getByText('Ouvrir conversation'));
  await waitFor(() => expect(screen.getByTestId('services').props.children).toBe(`me|dm:${OLI}`));
  await fireEvent.press(screen.getByLabelText('Rechercher dans cette conversation'));
  expect(screen.getByText(`Recherche dans dm:${OLI}`)).toBeTruthy();
  expect(screen.getByTestId('services').props.children).toBe(`me|dm:${OLI}`);
});

it("plusieurs recherches de suite ne laissent qu'une conversation : la flèche ramène à la liste", async () => {
  await render(<RootNavigator />);
  await fireEvent.press(screen.getByRole('tab', { name: 'Messages' }));
  await fireEvent.press(screen.getByText('Ouvrir conversation'));
  for (let i = 0; i < 3; i++) {
    await fireEvent.press(screen.getByLabelText('Rechercher dans cette conversation'));
    await fireEvent.press(screen.getByText('Résultat'));
    expect(screen.getByText(`Conversation ouverte ${MESSAGE}`)).toBeTruthy();
  }
  await fireEvent.press(screen.getByText('Flèche retour'));
  expect(screen.getByText('Ouvrir conversation')).toBeTruthy();
  expect(screen.queryByText(/Recherche dans/)).toBeNull();
  expect(screen.queryByText(/Conversation ouverte/)).toBeNull();
});

it('ouvre la recherche limitée au salon affiché', async () => {
  await render(<RootNavigator />);
  await fireEvent.press(screen.getByRole('tab', { name: 'Messages' }));
  await fireEvent.press(screen.getByText('Ouvrir salon'));
  await fireEvent.press(screen.getByLabelText('Rechercher dans cette conversation'));
  expect(screen.getByText(`Recherche dans room:${ROOM}`)).toBeTruthy();
});

it.each(['Ouvrir invalide', 'Ouvrir sans paramètres'])(
  "n'ouvre aucune recherche pour une conversation invalide (%s)",
  async (button) => {
    await render(<RootNavigator />);
  await fireEvent.press(screen.getByRole('tab', { name: 'Messages' }));
    await fireEvent.press(screen.getByText(button));
    await fireEvent.press(screen.getByLabelText('Rechercher dans cette conversation'));
    expect(screen.queryByText(/Recherche dans/)).toBeNull();
    expect(screen.getByTestId('services').props.children).toBe('me|aucune');
  },
);

it("affiche les badges de non-lus des onglets, même sans permission de notification", async () => {
  jest.mocked(fetchUnreadCounts).mockResolvedValue({ [`dm:${OLI}`]: 2, [`room:${ROOM}`]: 120 });
  await render(<RootNavigator />);
  await fireEvent.press(screen.getByRole('tab', { name: 'Messages' }));
  await waitFor(() => expect(screen.getByText('2')).toBeTruthy());
  expect(screen.getByText('99+')).toBeTruthy();
});

it("affiche le bandeau de connexion seulement avec une session", async () => {
  const view = await render(<RootNavigator />);
  await fireEvent.press(screen.getByRole('tab', { name: 'Messages' }));
  expect(screen.getByTestId('connection-status')).toBeTruthy();
  await act(async () => view.unmount());
  mockStatus = 'signedOut';
  mockUser = null;
  await render(<RootNavigator />);
  expect(screen.queryByTestId('connection-status')).toBeNull();
  expect(screen.queryByTestId('services')).toBeNull();
});

it("n'active pas les services sans utilisateur", async () => {
  mockUser = null;
  await render(<RootNavigator />);
  expect(screen.queryByTestId('services')).toBeNull();
});
