import { fireEvent, render, screen } from '@testing-library/react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { Button, Text as MockText } from 'react-native';

import { RootNavigator } from '@/navigation/RootNavigator';
import type { RootStackParamList } from '@/navigation/routes';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@/session/SessionContext', () => ({
  useSession: () => ({ status: 'signedIn', user: { id: 'u' }, error: null }),
}));
jest.mock('@/screens/DirectMessagesScreen', () => ({ DirectMessagesScreen: () => <MockLinks /> }));
jest.mock('@/screens/ServersScreen', () => ({ ServersScreen: () => <MockText>Liste serveurs</MockText> }));
jest.mock('@/screens/SearchScreen', () => ({ SearchScreen: () => <MockText>Recherche ouverte</MockText> }));
jest.mock('@/screens/PreferencesScreen', () => ({
  PreferencesScreen: () => <MockText>Préférences ouvertes</MockText>,
}));
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
    await fireEvent.press(screen.getByText('Ouvrir serveur'));
    expect(screen.getByText('Serveur ouvert')).toBeTruthy();
    expect(JSON.stringify(screen.toJSON())).toContain(
      JSON.stringify({ title: params?.title ?? 'Serveur' }).slice(1, -1),
    );
    await view.unmount();
    await render(<RootNavigator />);
    await fireEvent.press(screen.getByText('Ouvrir conversation'));
    expect(screen.getByText('Conversation ouverte')).toBeTruthy();
    expect(JSON.stringify(screen.toJSON())).toContain(
      JSON.stringify({ title: params?.title ?? 'Conversation' }).slice(1, -1),
    );
  },
);
it('ouvre les quatre onglets avec leurs icônes', async () => {
  await render(<RootNavigator />);
  await fireEvent.press(screen.getByText('Serveurs'));
  expect(screen.getByText('Liste serveurs')).toBeTruthy();
  await fireEvent.press(screen.getByText('Recherche'));
  expect(screen.getByText('Recherche ouverte')).toBeTruthy();
  await fireEvent.press(screen.getByText('Préférences'));
  expect(screen.getByText('Préférences ouvertes')).toBeTruthy();
  await fireEvent.press(screen.getByText('Messages privés'));
  expect(screen.getByText('Ouvrir serveur')).toBeTruthy();
});
