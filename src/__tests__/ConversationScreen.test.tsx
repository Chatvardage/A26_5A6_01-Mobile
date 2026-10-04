import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ConversationScreen } from '@/screens/ConversationScreen';
import { useMessages } from '@/hooks/useMessages';
import type { ReactElement } from 'react';

jest.mock('@react-navigation/elements', () => ({ useHeaderHeight: () => 0 }));
jest.mock('@/session/SessionContext', () => ({ useSession: () => ({ user: { id: 'user-id' } }) }));
jest.mock('@/hooks/useMessages', () => ({ useMessages: jest.fn() }));

const DM = '11111111-1111-4111-8111-111111111111';
const baseState = {
  messages: [],
  status: 'ready',
  errorMessage: null,
  hasOlder: false,
  loadingOlder: false,
  olderError: null,
  connection: 'ready',
  retry: jest.fn(),
  loadOlder: jest.fn(),
  send: jest.fn(),
  edit: jest.fn(),
};
const withSafeArea = (element: ReactElement) =>
  <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}>
    {element}
  </SafeAreaProvider>;
const screenElement = (conversationId: unknown) => (
  <ConversationScreen
    route={{ key: 'conversation', name: 'Conversation', params: { conversationId } } as never}
    navigation={{} as never}
  />
);
const renderScreen = (conversationId: unknown = `dm:${DM}`) =>
  render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}>
      {screenElement(conversationId)}
    </SafeAreaProvider>,
  );

describe('ConversationScreen', () => {
  beforeEach(() => (useMessages as jest.Mock).mockReset().mockReturnValue({ ...baseState }));

  it('affiche chargement, erreur réessayable et conversation vide avec saisie', async () => {
    (useMessages as jest.Mock).mockReturnValueOnce({ ...baseState, status: 'loading' });
    const { rerender } = await renderScreen();
    expect(screen.getByText('Chargement des messages…')).toBeTruthy();

    (useMessages as jest.Mock).mockReturnValueOnce({ ...baseState, status: 'error', errorMessage: 'Serveur indisponible' });
    await rerender(withSafeArea(screenElement(`dm:${DM}`)));
    expect(screen.getByText('Serveur indisponible')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Réessayer' }));
    expect(baseState.retry).toHaveBeenCalled();

    await rerender(withSafeArea(screenElement(`dm:${DM}`)));
    expect(screen.getByText('Aucun message')).toBeTruthy();
    expect(screen.getByLabelText('Message')).toBeTruthy();
  });

  it('affiche les messages, connexion, pagination et le bandeau de reconnexion', async () => {
    const loadOlder = jest.fn();
    (useMessages as jest.Mock).mockReturnValue({
      ...baseState,
      messages: [
        { id: 'one', senderId: 'user-id', content: 'Premier', createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z' },
      ],
      hasOlder: true,
      connection: 'disconnected',
      loadingOlder: true,
      loadOlder,
    });
    await renderScreen();
    expect(screen.getByText('Premier')).toBeTruthy();
    expect(screen.getByText(/Hors connexion/)).toBeTruthy();
    expect(screen.getByTestId('messages-list')).toBeTruthy();
    await fireEvent(screen.getByTestId('messages-list'), 'onEndReached');
    expect(loadOlder).toHaveBeenCalled();
  });

  it('rejette les paramètres invalides sans créer le hook', async () => {
    await renderScreen('dm:not-a-uuid');
    expect(screen.getByText('Cette conversation est introuvable.')).toBeTruthy();
    expect(useMessages).not.toHaveBeenCalled();
  });
});
