import { fireEvent, render, screen } from '@testing-library/react-native';
import { SearchScreen } from '@/screens/SearchScreen';
import { ServerSearchScreen } from '@/screens/ServerSearchScreen';
import { useSearchSummary } from '@/hooks/useSearchSummary';
import type { ConversationMatch, SearchSummary } from '@/services/searchSummaryService';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('@/hooks/useSearchSummary', () => ({ useSearchSummary: jest.fn() }));
const navigation = { navigate: jest.fn() };
const ID = '22222222-2222-4222-8222-222222222222';
const match = (index: number, kind = 'dm'): ConversationMatch => ({ conversationId: `${kind}:${ID.slice(0, -2)}${String(index).padStart(2, '0')}`, title: `${kind} ${index}`, count: index + 1 });
const data: SearchSummary = {
  directMessages: Array.from({ length: 10 }, (_, i) => match(i)),
  servers: Array.from({ length: 10 }, (_, i) => ({ serverId: `${ID.slice(0, -2)}${String(i).padStart(2, '0')}`, title: `Serveur ${i}`, count: i + 1, channels: [match(i, 'room')] })),
};
let mockState: ReturnType<typeof useSearchSummary>;
const globalProps = { navigation } as unknown as Parameters<typeof SearchScreen>[0];
const serverProps = (params: unknown) => ({ navigation, route: { params } }) as unknown as Parameters<typeof ServerSearchScreen>[0];
beforeEach(() => {
  jest.clearAllMocks();
  mockState = { query: 'bonjour', term: 'bonjour', status: 'ready', data, error: null, retry: jest.fn(), setQuery: jest.fn() };
  jest.mocked(useSearchSummary).mockImplementation(() => mockState);
});

it('sépare les personnes et serveurs, affiche huit lignes et déplie chaque catégorie indépendamment', async () => {
  const view = await render(<SearchScreen {...globalProps} />);
  expect(screen.getByText('Messages privés')).toBeTruthy();
  expect(screen.getByText('Serveurs')).toBeTruthy();
  expect(screen.getByText('dm 7')).toBeTruthy();
  expect(screen.getByText('Serveur 7')).toBeTruthy();
  expect(screen.queryByText('dm 8')).toBeNull();
  expect(screen.queryByText('Serveur 8')).toBeNull();
  expect(screen.getAllByText('8 résultats')).toHaveLength(2);
  await fireEvent.press(screen.getByRole('button', { name: 'Voir plus : Messages privés' }));
  expect(screen.getByText('dm 9')).toBeTruthy();
  expect(screen.queryByText('Serveur 8')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Voir plus : Serveurs' }));
  expect(screen.getByText('Serveur 9')).toBeTruthy();
  expect(screen.queryByText('Voir plus')).toBeNull();
  mockState = { ...mockState, query: 'autre', term: 'autre' };
  await view.rerender(<SearchScreen {...globalProps} />);
  expect(screen.queryByText('dm 8')).toBeNull();
  expect(screen.queryByText('Serveur 8')).toBeNull();
});

it('ouvre le DM puis le serveur avec le texte recherché', async () => {
  await render(<SearchScreen {...globalProps} />);
  await fireEvent.press(screen.getByText('dm 0'));
  expect(navigation.navigate).toHaveBeenLastCalledWith('ConversationSearch', { conversationId: data.directMessages[0].conversationId, title: 'dm 0', query: 'bonjour' });
  await fireEvent.press(screen.getByText('Serveur 0'));
  expect(navigation.navigate).toHaveBeenLastCalledWith('ServerSearch', { serverId: data.servers[0].serverId, title: 'Serveur 0', query: 'bonjour' });
});

it('le serveur montre uniquement ses salons et ouvre leur recherche avec le même texte', async () => {
  await render(<ServerSearchScreen {...serverProps({ serverId: data.servers[0].serverId, title: 'Serveur 0', query: 'bonjour' })} />);
  expect(useSearchSummary).toHaveBeenCalledWith('bonjour');
  expect(screen.getByText('room 0')).toBeTruthy();
  expect(screen.getByText('1 résultat')).toBeTruthy();
  expect(screen.queryByText('room 1')).toBeNull();
  expect(screen.queryByText('Messages privés')).toBeNull();
  await fireEvent.press(screen.getByText('room 0'));
  expect(navigation.navigate).toHaveBeenCalledWith('ConversationSearch', { conversationId: data.servers[0].channels[0].conversationId, title: 'room 0', query: 'bonjour' });
});

it('ne montre jamais les correspondances nulles ni un bouton voir plus à huit éléments', async () => {
  mockState.data = { directMessages: [...data.directMessages.slice(0, 8), { ...match(9), count: 0 }], servers: [{ ...data.servers[0], count: 0 }] };
  await render(<SearchScreen {...globalProps} />);
  expect(screen.queryByText('dm 9')).toBeNull();
  expect(screen.queryByText('Serveur 0')).toBeNull();
  expect(screen.queryByText('Voir plus')).toBeNull();
  expect(screen.queryByText('0 résultat')).toBeNull();
});

it.each([['idle', 'Recherchez un message'], ['tooShort', 'Entrez au moins 2 caractères.'], ['loading', 'Recherche en cours…'], ['empty', 'Aucun résultat']] as const)('affiche l’état %s', async (status, label) => {
  mockState = { ...mockState, status, data: null };
  await render(<SearchScreen {...globalProps} />);
  expect(screen.getByText(label)).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Recherche'), 'nouveau');
  expect(mockState.setQuery).toHaveBeenCalledWith('nouveau');
});

it('affiche une erreur réessayable et aucun résultat si le serveur choisi n’a plus de correspondance', async () => {
  mockState = { ...mockState, status: 'error', error: 'Réseau indisponible' };
  const view = await render(<SearchScreen {...globalProps} />);
  expect(screen.getByText('Réseau indisponible')).toBeTruthy();
  await fireEvent.press(screen.getByText('Réessayer'));
  expect(mockState.retry).toHaveBeenCalled();
  mockState = { ...mockState, status: 'ready', error: null };
  await view.rerender(<ServerSearchScreen {...serverProps({ serverId: ID, query: 'bonjour' })} />);
  expect(screen.getByText('Aucun résultat')).toBeTruthy();
});

it('rejette une route serveur invalide sans charger de résumé', async () => {
  await render(<ServerSearchScreen {...serverProps({ serverId: 'invalide', query: 'bonjour' })} />);
  expect(useSearchSummary).not.toHaveBeenCalled();
});

it('nomme une conversation ou un serveur sans titre et garde Réessayer sur une erreur sans raison', async () => {
  mockState.data = {
    directMessages: [{ ...match(0), title: undefined }],
    servers: [{ ...data.servers[0], title: undefined, channels: [{ ...match(1, 'room'), title: undefined }] }],
  };
  const view = await render(<SearchScreen {...globalProps} />);
  expect(screen.getByText('cette conversation')).toBeTruthy();
  expect(screen.getByText('Serveur')).toBeTruthy();
  await view.rerender(<ServerSearchScreen {...serverProps({ serverId: data.servers[0].serverId, query: 'bonjour' })} />);
  // En-tête (serveur sans nom) et salon sans nom.
  expect(screen.getAllByText('Salons')).toHaveLength(2);
  mockState = { ...mockState, status: 'error', error: null };
  await view.rerender(<SearchScreen {...globalProps} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Réessayer' }));
  expect(mockState.retry).toHaveBeenCalledTimes(1);
});
