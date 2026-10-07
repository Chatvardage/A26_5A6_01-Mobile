import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ConversationScreen } from '@/screens/ConversationScreen';
import { useMessages } from '@/hooks/useMessages';
import { useSession } from '@/session/SessionContext';
import type { ReactElement } from 'react';

jest.mock('@react-navigation/elements', () => ({ useHeaderHeight: () => 0 }));
jest.mock('@/session/SessionContext', () => ({ useSession: jest.fn(() => ({ user: { id: 'user-id' } })) }));
jest.mock('@/hooks/useMessages', () => ({ useMessages: jest.fn() }));

const DM = '11111111-1111-4111-8111-111111111111';
const baseState = {
  messages: [],
  status: 'ready',
  errorMessage: null,
  accessError: null,
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
  beforeEach(() => {
    (useMessages as jest.Mock).mockReset().mockReturnValue({ ...baseState });
    jest.mocked(useSession).mockReturnValue({ user: { id: 'user-id' } } as ReturnType<typeof useSession>);
  });

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

  it('affiche l’erreur d’abonnement au salon avec la liste, pendant le chargement et sans doublon', async () => {
    const own = { id: 'mine', senderId: 'user-id', content: 'Mon message', createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z' };
    (useMessages as jest.Mock).mockReturnValueOnce({ ...baseState, messages: [own], accessError: 'Accès refusé' });
    const view = await renderScreen(`room:${DM}`);
    expect(screen.getByRole('alert')).toHaveTextContent('Accès refusé');
    expect(screen.getByText('Mon message')).toBeTruthy();

    (useMessages as jest.Mock).mockReturnValueOnce({ ...baseState, status: 'loading', accessError: 'Accès refusé' });
    await view.rerender(withSafeArea(screenElement(`room:${DM}`)));
    expect(screen.getByRole('alert')).toHaveTextContent('Accès refusé');

    (useMessages as jest.Mock).mockReturnValueOnce({ ...baseState, messages: [own], errorMessage: 'Accès refusé', accessError: 'Accès refusé' });
    await view.rerender(withSafeArea(screenElement(`room:${DM}`)));
    expect(screen.getAllByText('Accès refusé')).toHaveLength(1);

    (useMessages as jest.Mock).mockReturnValueOnce({ ...baseState, status: 'error', errorMessage: 'Serveur indisponible', accessError: 'Accès refusé' });
    await view.rerender(withSafeArea(screenElement(`room:${DM}`)));
    expect(screen.getByText('Serveur indisponible')).toBeTruthy();
    expect(screen.queryByText('Accès refusé')).toBeNull();
  });

  it('permet de réessayer la pagination et de modifier uniquement son propre message', async () => {
    const loadOlder = jest.fn();
    const edit = jest.fn().mockResolvedValue(undefined);
    const own = { id: 'mine', senderId: 'user-id', content: 'Mon message', createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z' };
    const other = { ...own, id: 'other', senderId: 'alice', senderName: 'Alice', content: 'Autre message' };
    (useMessages as jest.Mock).mockReturnValue({
      ...baseState, messages: [own, other], connection: 'connecting', errorMessage: 'Rattrapage impossible',
      olderError: 'Ancienne page indisponible', loadOlder, edit,
    });
    await renderScreen(`room:${DM}`);
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('Connexion au service de messages…')).toBeTruthy();
    expect(screen.getByRole('alert')).toHaveTextContent('Rattrapage impossible');
    await fireEvent.press(screen.getByRole('button', { name: 'Réessayer' }));
    expect(loadOlder).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Autre message' })).toBeNull();
    await fireEvent(screen.getByRole('button', { name: 'Mon message' }), 'longPress');
    expect(screen.getByLabelText('Modifier le message')).toHaveDisplayValue('Mon message');
    await fireEvent.changeText(screen.getByLabelText('Modifier le message'), 'Texte corrigé');
    await fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(edit).toHaveBeenCalledWith('mine', 'Texte corrigé');
    expect(screen.getByLabelText('Message')).toBeTruthy();
    expect(screen.getByText('Mon message')).toBeTruthy();
  });

    it('affiche une erreur générique sans session et une liste sans pied de pagination', async () => {
      jest.mocked(useSession).mockReturnValue({ user: null } as ReturnType<typeof useSession>);
      jest.mocked(useMessages).mockReturnValueOnce({ ...baseState, status: 'error' } as ReturnType<typeof useMessages>);
      const view = await renderScreen();
      expect(screen.getByText('Une erreur est survenue.')).toBeTruthy();
      expect(useMessages).toHaveBeenCalledWith(`dm:${DM}`, '');
      (useMessages as jest.Mock).mockReturnValue({
        ...baseState, messages: [{ id: 'one', senderId: 'alice', content: 'Texte', createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z' }],
      });
      await view.rerender(withSafeArea(screenElement(`dm:${DM}`)));
      expect(screen.getByText('Texte')).toBeTruthy();
      expect(screen.queryByText('Réessayer')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Texte' })).toBeNull();
    });
});
