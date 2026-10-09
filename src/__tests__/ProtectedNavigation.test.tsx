import { fireEvent, render, screen } from '@testing-library/react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { Button, Text as MockText } from 'react-native';

import { RootNavigator } from '@/navigation/RootNavigator';
import type { RootStackParamList } from '@/navigation/routes';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@/screens/RoomsScreen', () => ({ RoomsScreen: () => <MockText>Accueil annonces</MockText> }));
const mockRealtime = {
  getRealtimeState: () => 'disconnected' as const,
  onConnectionState: () => () => undefined,
  onReady: () => () => undefined,
  subscribe: () => () => undefined,
  joinRoom: async () => undefined,
  leaveRoom: async () => undefined,
};
jest.mock('@/session/SessionContext', () => ({
  useSession: () => ({ status: 'signedIn', user: { id: 'u' }, error: null, realtime: mockRealtime }),
}));
jest.mock('@/screens/DirectMessagesScreen', () => ({ DirectMessagesScreen: () => <MockLinks /> }));
jest.mock('@/screens/ServersScreen', () => ({ ServersScreen: () => <MockText>Liste serveurs</MockText> }));
jest.mock('@/screens/SearchScreen', () => ({ SearchScreen: () => <MockText>Recherche ouverte</MockText> }));
jest.mock('@/screens/PreferencesScreen', () => ({
  PreferencesScreen: () => <MockText>Préférences ouvertes</MockText>,
}));
jest.mock('@/screens/NewDirectMessageScreen', () => ({ NewDirectMessageScreen: () => <MockText>Nouveau message ouvert</MockText> }));
jest.mock('@/screens/ServerScreen', () => ({ ServerScreen: () => <MockText>Serveur ouvert</MockText> }));
jest.mock('@/screens/ConversationScreen', () => ({
  ConversationScreen: () => <MockText>Conversation ouverte</MockText>,
}));
let mockParams: { serverId: string; title?: string } | undefined;
function MockLinks() {
  const nav = useNavigation<NavigationProp<RootStackParamList>>();
  return (
    <>
      <Button title="Ouvrir serveur" onPress={() => nav.navigate('Server', mockParams!)} />
      <Button title="Écrire" onPress={() => nav.navigate('NewDirectMessage')} />
      <Button
        title="Ouvrir conversation"
        onPress={() =>
          nav.navigate('Conversation', mockParams ? { conversationId: 'dm:id', title: mockParams.title } : undefined!)
        }
      />
    </>
  );
}
it.each([undefined, { serverId: 's' }, { serverId: 's', title: 'Mon titre' }])(
  'ouvre les routes et applique les titres avec %p',
  async (params) => {
    mockParams = params;
    const view = await render(<RootNavigator />);
  await fireEvent.press(screen.getByRole('tab', { name: 'Messages' }));
    await fireEvent.press(screen.getByText('Ouvrir serveur'));
    expect(screen.getByText('Serveur ouvert')).toBeTruthy();
    await view.unmount();
    await render(<RootNavigator />);
  await fireEvent.press(screen.getByRole('tab', { name: 'Messages' }));
    await fireEvent.press(screen.getByText('Ouvrir conversation'));
    expect(screen.getByText('Conversation ouverte')).toBeTruthy();
  },
);
it('ouvre les quatre onglets avec leurs icônes', async () => {
  await render(<RootNavigator />);
  await fireEvent.press(screen.getByRole('tab', { name: 'Messages' }));
  await fireEvent.press(screen.getByText('Serveurs'));
  expect(screen.getByText('Liste serveurs')).toBeTruthy();
  await fireEvent.press(screen.getByText('Recherche'));
  expect(screen.getByText('Recherche ouverte')).toBeTruthy();
  await fireEvent.press(screen.getByText('Paramètres'));
  expect(screen.getByText('Préférences ouvertes')).toBeTruthy();
  await fireEvent.press(screen.getByRole('tab', { name: 'Messages' }));
  expect(screen.getByText('Ouvrir serveur')).toBeTruthy();
});

it('garde l’onglet Messages sélectionné sur le choix du destinataire', async () => {
  await render(<RootNavigator />);
  await fireEvent.press(screen.getByRole('tab', { name: 'Messages' }));
  await fireEvent.press(screen.getByRole('tab', { name: 'Serveurs' }));
  expect(screen.getByRole('tab', { name: 'Serveurs' })).toBeSelected();
  await fireEvent.press(screen.getByRole('tab', { name: 'Messages' }));
  await fireEvent.press(screen.getByText('Écrire'));
  expect(screen.getByText('Nouveau message ouvert')).toBeTruthy();
  expect(screen.getByRole('tab', { name: 'Messages' })).toBeSelected();
});
