import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';

import { SearchResultItem } from '@/components/SearchResultItem';
import { ConversationSearchScreen } from '@/screens/ConversationSearchScreen';
import type { SearchResult } from '@/services/searchService';
import type { SearchStatus } from '@/hooks/useSearch';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

type Hook = {
  query: string;
  term: string;
  setQuery: jest.Mock;
  status: SearchStatus;
  results: SearchResult[];
  hasMore: boolean;
  errorMessage: string | null;
  loadingMore: boolean;
  moreError: string | null;
  loadMore: jest.Mock;
  retry: jest.Mock;
};
let mockSearch: Hook;
const mockUseSearch = jest.fn();
jest.mock('@/hooks/useSearch', () => ({
  useSearch: (...args: unknown[]) => {
    mockUseSearch(...args);
    return mockSearch;
  },
}));

const OLI = '22222222-2222-4222-8222-222222222222';
const ROOM = '33333333-3333-4333-8333-333333333333';
const M1 = '44444444-4444-4444-8444-444444444444';
const M2 = '55555555-5555-4555-8555-555555555555';
const dm: SearchResult = {
  id: M1,
  conversationId: `dm:${OLI}`,
  kind: 'dm',
  senderId: OLI,
  senderName: 'oli',
  conversationTitle: 'oli',
  content: 'bonjour à toi',
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-10-01T10:00:00Z',
};
const room: SearchResult = { ...dm, id: M2, conversationId: `room:${ROOM}`, kind: 'room', conversationTitle: undefined, senderName: undefined, content: 'dans le salon' };

const navigation = { navigate: jest.fn(), popTo: jest.fn(), goBack: jest.fn() };
const scopedProps = (params: unknown) =>
  ({ navigation, route: { params } }) as unknown as Parameters<typeof ConversationSearchScreen>[0];

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Date, 'now').mockReturnValue(1234);
  mockSearch = {
    query: '',
    term: '',
    setQuery: jest.fn(),
    status: 'idle',
    results: [],
    hasMore: false,
    errorMessage: null,
    loadingMore: false,
    moreError: null,
    loadMore: jest.fn(),
    retry: jest.fn(),
  };
});

describe('recherche dans une conversation', () => {
  it('reprend le terme choisi dans la recherche globale et pagine au bouton uniquement', async () => {
    mockSearch.status = 'ready';
    mockSearch.results = [dm];
    mockSearch.hasMore = true;
    await render(<ConversationSearchScreen {...scopedProps({ conversationId: `dm:${OLI}`, query: 'bonjour' })} />);
    expect(mockSearch.setQuery).toHaveBeenCalledWith('bonjour');
    await fireEvent(screen.getByText('bonjour à toi'), 'endReached');
    expect(mockSearch.loadMore).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Plus de résultats'));
    expect(mockSearch.loadMore).toHaveBeenCalledTimes(1);
  });
  it('limite la recherche à la conversation, nomme le champ et ne répète pas le lieu', async () => {
    mockSearch.status = 'ready';
    mockSearch.results = [dm];
    await render(<ConversationSearchScreen {...scopedProps({ conversationId: `dm:${OLI}`, title: 'oli' })} />);
    expect(mockUseSearch).toHaveBeenCalledWith(`dm:${OLI}`);
    expect(screen.getByPlaceholderText('Rechercher dans oli')).toBeTruthy();
    expect(screen.getByLabelText('Rechercher dans cette conversation')).toBeTruthy();
    expect(screen.getByText('oli')).toBeTruthy();
    await userEvent.setup().press(screen.getByText('bonjour à toi'));
    expect(navigation.popTo).toHaveBeenCalledWith('Conversation', {
      conversationId: `dm:${OLI}`,
      title: 'oli',
      messageId: M1,
      focusToken: 1234,
    });
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('propose un libellé par défaut sans titre', async () => {
    await render(<ConversationSearchScreen {...scopedProps({ conversationId: `room:${ROOM}` })} />);
    expect(screen.getByPlaceholderText('Rechercher dans cette conversation')).toBeTruthy();
  });

  it('refuse des paramètres invalides sans lancer de recherche', async () => {
    await render(<ConversationSearchScreen {...scopedProps({ conversationId: 'dm:invalide' })} />);
    expect(screen.getByText('Cette conversation est introuvable.')).toBeTruthy();
  });
});

describe('SearchResultItem', () => {
  it("surligne les occurrences du texte recherché dans l'extrait", async () => {
    await render(<SearchResultItem result={dm} variant="scoped" term="BONJOUR" onPress={jest.fn()} />);
    expect(screen.getByText('bonjour')).toBeTruthy();
    expect(screen.getByText(/à toi/)).toBeTruthy();
  });

  it.each([
    ['interlocuteur connu', { ...dm, senderName: 'mia' }, 'oli', 'mia'],
    ['interlocuteur inconnu', { ...dm, conversationTitle: undefined, senderName: 'mia' }, 'Message privé', 'mia'],
    ['expéditeur inconnu', { ...dm, senderName: undefined }, 'oli', 'Utilisateur inconnu'],
  ] as const)('message privé : interlocuteur puis auteur (%s)', async (_, result, top, detail) => {
    await render(<SearchResultItem result={result} variant="grouped" onPress={jest.fn()} />);
    expect(screen.getByText(top)).toBeTruthy();
    expect(screen.getByText(detail)).toBeTruthy();
  });

  it.each([
    ['salon connu', { ...room, conversationTitle: '#annonces', senderName: 'Système' }, '#annonces', 'Système'],
    ['salon inconnu', { ...room, senderName: 'mia' }, 'Salon', 'mia'],
    ['auteur système sans pseudo', { ...room, conversationTitle: undefined, senderId: 'system', senderName: undefined }, 'Salon', 'Système'],
  ] as const)('salon : le salon puis l\'auteur (%s)', async (_, result, top, detail) => {
    await render(<SearchResultItem result={result} variant="grouped" onPress={jest.fn()} />);
    expect(screen.getByText(top)).toBeTruthy();
    expect(screen.getByText(detail)).toBeTruthy();
  });

  it("n'affiche que l'expéditeur dans une recherche limitée à une conversation", async () => {
    const view = await render(<SearchResultItem result={dm} variant="scoped" onPress={jest.fn()} />);
    expect(screen.getByText('oli')).toBeTruthy();
    expect(screen.queryByText('Message privé')).toBeNull();
    await view.rerender(<SearchResultItem result={{ ...dm, senderName: undefined }} variant="scoped" onPress={jest.fn()} />);
    expect(screen.getByText('Utilisateur inconnu')).toBeTruthy();
  });
});
