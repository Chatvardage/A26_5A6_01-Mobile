import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';

import { NewDirectMessageButton } from '@/components/NewDirectMessageButton';
import { useNewDirectMessage } from '@/hooks/useNewDirectMessage';
import { NewDirectMessageScreen } from '@/screens/NewDirectMessageScreen';
import { useSession } from '@/session/SessionContext';

jest.mock('@/hooks/useNewDirectMessage', () => ({ useNewDirectMessage: jest.fn() }));
jest.mock('@/session/SessionContext', () => ({ useSession: jest.fn(() => ({ user: { id: 'me' } })) }));

const NEW_ID = '11111111-1111-4111-8111-111111111111';
const OLD_ID = '22222222-2222-4222-8222-222222222222';
const replace = jest.fn();
const setQuery = jest.fn();
const retrySearch = jest.fn();
const retrySuggestions = jest.fn();
type HookState = ReturnType<typeof useNewDirectMessage>;
const base: HookState = {
  query: '',
  setQuery,
  searching: false,
  search: { status: 'idle' },
  retrySearch,
  suggestions: { status: 'ready', data: [{ id: OLD_ID, pseudo: 'alice' }] },
  retrySuggestions,
  hasConversationWith: (id: string) => id === OLD_ID,
};
const mockState = (state: Partial<HookState>) => jest.mocked(useNewDirectMessage).mockReturnValue({ ...base, ...state });
const element = () => <NewDirectMessageScreen navigation={{ replace } as never} route={{} as never} />;

beforeEach(() => {
  jest.clearAllMocks();
  mockState({});
});

describe('NewDirectMessageScreen', () => {
  it('propose les suggestions et ouvre une conversation existante', async () => {
    await render(element());
    expect(useNewDirectMessage).toHaveBeenCalledWith('me');
    expect(screen.getByText('Suggestions')).toBeTruthy();
    expect(screen.getByText('Ouvrir')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Rechercher un pseudo'), 'bo');
    expect(setQuery).toHaveBeenCalledWith('bo');
    await userEvent.setup().press(screen.getByRole('button', { name: 'alice, ouvrir la conversation' }));
    expect(replace).toHaveBeenCalledWith('Conversation', { conversationId: `dm:${OLD_ID}`, title: 'alice' });
  });

  it('ouvre une nouvelle conversation avec une personne trouvée par recherche', async () => {
    mockState({ query: 'bo', searching: true, search: { status: 'ready', users: [{ id: NEW_ID, pseudo: 'bob' }] } });
    await render(element());
    expect(screen.getByText('Résultats')).toBeTruthy();
    expect(screen.getByText('Nouveau')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'bob, nouvelle conversation' }));
    expect(replace).toHaveBeenCalledWith('Conversation', { conversationId: `dm:${NEW_ID}`, title: 'bob' });
  });

  it('affiche chargement, erreur réessayable et absence de résultat pour la recherche', async () => {
    mockState({ searching: true, search: { status: 'loading' } });
    const view = await render(element());
    expect(screen.getByText('Recherche…')).toBeTruthy();
    mockState({ searching: true, search: { status: 'error', message: 'Serveur indisponible' } });
    await view.rerender(element());
    expect(screen.getByText('Serveur indisponible')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Réessayer' }));
    expect(retrySearch).toHaveBeenCalledTimes(1);
    mockState({ searching: true, search: { status: 'ready', users: [] } });
    await view.rerender(element());
    expect(screen.getByText('Aucun utilisateur trouvé')).toBeTruthy();
  });

  it('affiche chargement, erreur réessayable et absence de suggestion', async () => {
    jest.mocked(useSession).mockReturnValueOnce({ user: null } as ReturnType<typeof useSession>);
    mockState({ suggestions: { status: 'loading' } });
    const view = await render(element());
    expect(useNewDirectMessage).toHaveBeenCalledWith('');
    expect(screen.getByText('Chargement des suggestions…')).toBeTruthy();
    mockState({ suggestions: { status: 'error', message: 'Hors ligne' } });
    await view.rerender(element());
    await fireEvent.press(screen.getByRole('button', { name: 'Réessayer' }));
    expect(retrySuggestions).toHaveBeenCalledTimes(1);
    mockState({ suggestions: { status: 'empty' } });
    await view.rerender(element());
    expect(screen.getByText('Aucune suggestion')).toBeTruthy();
  });
});

it('la carte plus déclenche son action sans afficher le texte Nouveau', async () => {
  const onPress = jest.fn();
  await render(<NewDirectMessageButton onPress={onPress} />);
  expect(screen.queryByText('Nouveau')).toBeNull();
  expect(screen.getByRole('button', { name: 'Nouveau message privé' })).toHaveStyle({ minHeight: 64, borderRadius: 12 });
  await userEvent.setup().press(screen.getByRole('button', { name: 'Nouveau message privé' }));
  expect(onPress).toHaveBeenCalledTimes(1);
});
