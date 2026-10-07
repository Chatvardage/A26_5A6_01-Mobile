import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';

import { SearchResultItem } from '@/components/SearchResultItem';
import { ConversationSearchScreen } from '@/screens/ConversationSearchScreen';
import { SearchScreen } from '@/screens/SearchScreen';
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
const globalProps = { navigation } as unknown as Parameters<typeof SearchScreen>[0];
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

describe('recherche globale', () => {
  it.each([
    ['idle', 'Recherchez un message'],
    ['tooShort', 'Entrez au moins 2 caractères.'],
    ['loading', 'Recherche en cours…'],
    ['empty', 'Aucun résultat'],
  ] as const)("affiche l'état %s", async (status, text) => {
    mockSearch.status = status;
    await render(<SearchScreen {...globalProps} />);
    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.getByPlaceholderText('Rechercher dans vos conversations')).toBeTruthy();
    expect(mockUseSearch).toHaveBeenCalledWith(undefined);
  });

  it("transmet la saisie et affiche l'erreur avec réessai", async () => {
    mockSearch.status = 'error';
    mockSearch.errorMessage = 'Impossible de joindre le serveur.';
    await render(<SearchScreen {...globalProps} />);
    await fireEvent.changeText(screen.getByLabelText('Recherche'), 'bonjour');
    expect(mockSearch.setQuery).toHaveBeenCalledWith('bonjour');
    expect(screen.getByText('Impossible de joindre le serveur.')).toBeTruthy();
    await userEvent.setup().press(screen.getByText('Réessayer'));
    expect(mockSearch.retry).toHaveBeenCalled();
  });

  it("affiche l'erreur même sans message détaillé", async () => {
    mockSearch.status = 'error';
    mockSearch.errorMessage = null;
    await render(<SearchScreen {...globalProps} />);
    expect(screen.getByText('Une erreur est survenue')).toBeTruthy();
  });

  it('affiche les résultats et ouvre la bonne conversation au toucher', async () => {
    mockSearch.status = 'ready';
    mockSearch.results = [dm, room];
    await render(<SearchScreen {...globalProps} />);
    expect(screen.getByText('2 résultats')).toBeTruthy();
    expect(screen.getByText('bonjour à toi')).toBeTruthy();
    await userEvent.setup().press(screen.getByText('bonjour à toi'));
    expect(navigation.navigate).toHaveBeenCalledWith('Conversation', {
      conversationId: `dm:${OLI}`,
      title: 'oli',
      messageId: M1,
      focusToken: 1234,
    });
    await userEvent.setup().press(screen.getByText('dans le salon'));
    expect(navigation.navigate).toHaveBeenLastCalledWith('Conversation', {
      conversationId: `room:${ROOM}`,
      title: undefined,
      messageId: M2,
      focusToken: 1234,
    });
  });

  it('pagine : fin de liste, bouton « Plus de résultats », chargement et erreur', async () => {
    mockSearch.status = 'ready';
    mockSearch.results = [dm];
    mockSearch.hasMore = true;
    const view = await render(<SearchScreen {...globalProps} />);
    await fireEvent(screen.getByText('bonjour à toi'), 'endReached');
    expect(mockSearch.loadMore).toHaveBeenCalledTimes(1);
    await userEvent.setup().press(screen.getByText('Plus de résultats'));
    expect(mockSearch.loadMore).toHaveBeenCalledTimes(2);

    mockSearch.loadingMore = true;
    await view.rerender(<SearchScreen {...globalProps} />);
    expect(screen.queryByText('Plus de résultats')).toBeNull();
    expect(screen.getByLabelText('Chargement…')).toBeTruthy();

    mockSearch.loadingMore = false;
    mockSearch.moreError = 'Réseau coupé';
    await view.rerender(<SearchScreen {...globalProps} />);
    expect(screen.getByText('Réseau coupé')).toBeTruthy();

    mockSearch.hasMore = false;
    mockSearch.moreError = null;
    await view.rerender(<SearchScreen {...globalProps} />);
    expect(screen.queryByText('Plus de résultats')).toBeNull();
  });
});

describe('regroupement des résultats', () => {
  const inServer = (id: string, serverName: string | undefined, channel: string): SearchResult => ({
    ...room,
    id,
    serverName,
    conversationTitle: channel,
    content: `message ${id}`,
  });

  it('sépare messages privés et serveurs, chaque groupe avec son titre et son nombre', async () => {
    mockSearch.status = 'ready';
    mockSearch.results = [inServer('s1', 'Chatvardage', '#annonces'), dm, inServer('s2', 'Équipe', '#général'), inServer('s3', 'Chatvardage', '#général'), inServer('s4', undefined, '#x')];
    await render(<SearchScreen {...globalProps} />);
    expect(screen.getByText('Messages privés')).toBeTruthy();
    expect(screen.getByText('Chatvardage')).toBeTruthy();
    expect(screen.getByText('Équipe')).toBeTruthy();
    expect(screen.getByText('Salons')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('#annonces')).toBeTruthy();
  });

  it("n'affiche aucun titre de groupe dans une recherche limitée à une conversation", async () => {
    mockSearch.status = 'ready';
    mockSearch.results = [dm];
    await render(<ConversationSearchScreen {...scopedProps({ conversationId: `dm:${OLI}`, title: 'oli' })} />);
    expect(screen.queryByText('Messages privés')).toBeNull();
  });
});

describe('recherche dans une conversation', () => {
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
