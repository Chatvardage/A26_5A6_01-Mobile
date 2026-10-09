import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { FlatList } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useMessages } from '@/hooks/useMessages';
import { ConversationScreen } from '@/screens/ConversationScreen';
import type { Reader } from '@/services/receipts.service';
import { useSession } from '@/session/SessionContext';

// Props reçues par la liste : le moteur de test complète les événements de défilement et ne relaie pas
// `contentSizeChange`, on appelle donc directement les gestionnaires de l'écran.
let mockListProps: Record<string, (...args: never[]) => void> = {};
jest.mock('react-native/Libraries/Lists/FlatList', () => {
  const Actual = jest.requireActual('react-native/Libraries/Lists/FlatList');
  const Base = Actual.default ?? Actual;
  class CapturingFlatList extends Base {
    render() { mockListProps = this.props; return super.render(); }
  }
  return { __esModule: true, default: CapturingFlatList };
});
let mockReaders: Reader[] = [];
let mockCanWrite = true;
let mockProfiles: Record<string, { alias: string | null; avatar: string | null; online: boolean }> = {};
jest.mock('@/hooks/usePublicProfiles', () => ({ usePublicProfiles: () => mockProfiles }));
jest.mock('@/services/usersService', () => ({ ...jest.requireActual('@/services/usersService'), lookupPseudos: jest.fn(async () => ({})) }));
jest.mock('@/hooks/useReadReceipts', () => ({ useReadReceipts: () => mockReaders }));
jest.mock('@/hooks/useCanWrite', () => ({ useCanWrite: () => mockCanWrite }));
jest.mock('@/hooks/useCanModerate', () => ({ useCanModerate: () => false }));
jest.mock('@react-navigation/elements', () => ({ useHeaderHeight: () => 0 }));
jest.mock('@/session/SessionContext', () => ({ useSession: jest.fn() }));
jest.mock('@/hooks/useMessages', () => ({ useMessages: jest.fn() }));

const ID = '11111111-1111-4111-8111-111111111111';
// Message visé absent de la liste affichée : le défilement reste en attente.
const TARGET = '22222222-2222-4222-8222-222222222222';
const base = {
  hasNewer: false, loadingNewer: false, loadNewer: jest.fn(), jumping: false, jumpTo: jest.fn(async () => true),
  remove: jest.fn(async () => undefined), messages: [], status: 'ready', errorMessage: null, accessError: null,
  hasOlder: false, loadingOlder: false, olderError: null, connection: 'ready', retry: jest.fn(), loadOlder: jest.fn(),
  send: jest.fn(async () => undefined), edit: jest.fn(),
};
const mine = { id: 'mine', senderId: 'me', content: 'Mon message', createdAt: '2026-10-08T10:00:00Z', updatedAt: '2026-10-08T10:00:00Z' };
const theirs = { ...mine, id: 'theirs', senderId: 'bob', content: 'Sa réponse', createdAt: '2026-10-08T09:00:00Z', updatedAt: '2026-10-08T09:00:00Z' };
const reader = (userId: string, lastReadAt: string | null): Reader => ({ userId, lastReadAt, lastReadMessageId: null });
const state = (extra: Record<string, unknown> = {}) => jest.mocked(useMessages).mockReturnValue({ ...base, ...extra } as never);
const navigation = { setOptions: jest.fn(), push: jest.fn() };
const element = (conversationId: string, title?: string) => (
  <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}>
    <ConversationScreen route={{ key: 'c', name: 'Conversation', params: { conversationId, title } } as never} navigation={navigation as never} />
  </SafeAreaProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
  mockReaders = [];
  mockProfiles = {};
  mockCanWrite = true;
  jest.mocked(useSession).mockReturnValue({ user: { id: 'me' }, drafts: new Map() } as unknown as ReturnType<typeof useSession>);
});

describe('accusés de lecture', () => {
  it('message privé : envoyé, livré puis lu, seulement sur son dernier message', async () => {
    state({ messages: [mine, theirs] });
    const view = await render(element(`dm:${ID}`));
    expect(screen.getByLabelText('Envoyé')).toBeTruthy();
    state({ messages: [{ ...mine, deliveredAt: '2026-10-08T10:00:01Z' }, theirs] });
    await view.rerender(element(`dm:${ID}`));
    expect(screen.getByLabelText('Livré')).toBeTruthy();
    mockReaders = [reader('bob', '2026-10-08T10:05:00Z')];
    await view.rerender(element(`dm:${ID}`));
    expect(screen.getByLabelText('Lu')).toBeTruthy();
    expect(screen.queryByLabelText('Envoyé')).toBeNull();
  });

  it('salon : compte les lecteurs autres que l’auteur', async () => {
    mockReaders = [reader('bob', '2026-10-08T10:05:00Z'), reader('me', '2026-10-08T10:05:00Z'), reader('carol', null)];
    state({ messages: [mine, theirs] });
    await render(element(`room:${ID}`));
    expect(screen.getByText('Vu par 1')).toBeTruthy();
    expect(screen.queryByLabelText('Envoyé')).toBeNull();
  });
});

it('affiche la lecture seule à la place de la saisie', async () => {
  mockCanWrite = false;
  state({ messages: [theirs] });
  await render(element(`room:${ID}`));
  expect(screen.getByText('Ce salon est en lecture seule pour votre rôle.')).toBeTruthy();
  expect(screen.queryByLabelText('Message')).toBeNull();
});

it('envoie un message puis revient au plus récent', async () => {
  const scroll = jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => undefined);
  state({ messages: [theirs] });
  await render(element(`dm:${ID}`));
  scroll.mockClear();
  await fireEvent.changeText(screen.getByLabelText('Message'), 'Bonjour');
  await fireEvent.press(screen.getByRole('button', { name: 'Envoyer' }));
  expect(base.send).toHaveBeenCalledWith('Bonjour');
  await waitFor(() => expect(scroll).toHaveBeenCalledWith({ offset: 0, animated: true }));
  scroll.mockRestore();
});

it('charge les messages plus récents depuis l’en-tête et indique le chargement', async () => {
  state({ messages: [theirs], hasNewer: true });
  const view = await render(element(`dm:${ID}`));
  await fireEvent.press(screen.getByRole('button', { name: 'Charger les messages plus récents' }));
  expect(base.loadNewer).toHaveBeenCalledTimes(1);
  state({ messages: [theirs], hasNewer: true, loadingNewer: true });
  await view.rerender(element(`dm:${ID}`));
  expect(screen.queryByRole('button', { name: 'Charger les messages plus récents' })).toBeNull();
});

it('suit le bas selon la hauteur mesurée de la liste et y revient quand le contenu grandit', async () => {
  const scroll = jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => undefined);
  state({ messages: [theirs] });
  await render(element(`dm:${ID}`));
  const call = (name: string, ...args: unknown[]) => act(async () => (mockListProps[name] as (...a: unknown[]) => void)(...args));
  await call('onLayout', { nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 600 } } });
  // Sans mesure dans l'événement, la hauteur vient du dernier `layout` : 300 px du bas reste « près du bas ».
  await call('onScroll', { nativeEvent: { contentOffset: { x: 0, y: 300 } } });
  scroll.mockClear();
  await call('onContentSizeChange', 400, 2100);
  expect(scroll).toHaveBeenCalledWith({ offset: 0, animated: true });
  // Loin du bas : la position de lecture est conservée.
  await call('onScroll', { nativeEvent: { contentOffset: { x: 0, y: 900 } } });
  scroll.mockClear();
  await call('onContentSizeChange', 400, 2200);
  expect(scroll).not.toHaveBeenCalled();
  scroll.mockRestore();
});

it('ne charge pas l’historique plus ancien tant que le message visé n’est pas affiché', async () => {
  state({ messages: [theirs] });
  await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}>
      <ConversationScreen route={{ key: 'c', name: 'Conversation', params: { conversationId: `dm:${ID}`, messageId: TARGET } } as never} navigation={{} as never} />
    </SafeAreaProvider>,
  );
  await waitFor(() => expect(base.jumpTo).toHaveBeenCalledWith(TARGET));
  await act(async () => (mockListProps.onEndReached as () => void)());
  expect(base.loadOlder).not.toHaveBeenCalled();
});

describe('fiche de profil et titre', () => {
  it('la photo d’un auteur de salon ouvre sa fiche, qui ouvre la conversation privée', async () => {
    mockProfiles = { bob: { alias: 'Bobby', avatar: null, online: true } };
    const system = { ...theirs, id: 'bienvenue', senderId: 'system' };
    state({ messages: [{ ...theirs, senderName: 'bob42' }, system] });
    await render(element(`room:${ID}`));
    // Le message système n'a pas de fiche.
    expect(screen.getAllByRole('button', { name: /^Voir le profil de / })).toHaveLength(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Voir le profil de Bobby' }));
    const sheet = within(screen.getByTestId('profile-sheet'));
    expect(sheet.getByText('@bob42')).toBeTruthy();
    await fireEvent.press(sheet.getByRole('button', { name: 'Message privé' }));
    expect(navigation.push).toHaveBeenCalledWith('Conversation', { conversationId: 'dm:bob', title: 'Bobby' });
  });

  it('message privé : titre = alias, sinon pseudo, sinon titre reçu ; pas de bouton vers la même conversation', async () => {
    state({ messages: [] });
    const view = await render(element(`dm:${ID}`, 'pseudo-reçu'));
    expect(navigation.setOptions).toHaveBeenLastCalledWith({ title: 'pseudo-reçu' });
    state({ messages: [{ ...theirs, senderId: ID, senderName: 'partenaire' }] });
    await view.rerender(element(`dm:${ID}`, 'pseudo-reçu'));
    expect(navigation.setOptions).toHaveBeenLastCalledWith({ title: 'partenaire' });
    mockProfiles = { [ID]: { alias: 'Pat', avatar: null, online: false } };
    await view.rerender(element(`dm:${ID}`, 'pseudo-reçu'));
    expect(navigation.setOptions).toHaveBeenLastCalledWith({ title: 'Pat' });
    await fireEvent.press(screen.getByRole('button', { name: 'Voir le profil de Pat' }));
    expect(within(screen.getByTestId('profile-sheet')).queryByRole('button', { name: 'Message privé' })).toBeNull();
  });

  it('salon : le titre reste celui du salon', async () => {
    state({ messages: [theirs] });
    await render(element(`room:${ID}`, '#général'));
    expect(navigation.setOptions).not.toHaveBeenCalled();
  });

  it('message privé sans titre connu : aucun titre imposé', async () => {
    state({ messages: [] });
    await render(element(`dm:${ID}`));
    expect(navigation.setOptions).not.toHaveBeenCalled();
  });
});

it('quitter la conversation avant le défilement annule les images en attente', async () => {
  const cancel = jest.spyOn(global, 'cancelAnimationFrame');
  const request = jest.spyOn(global, 'requestAnimationFrame').mockImplementation(() => 1);
  state({ messages: [theirs] });
  const view = await render(element(`dm:${ID}`));
  // Première image jamais exécutée : la seconde n'a pas été demandée.
  await view.unmount();
  expect(cancel).toHaveBeenCalledTimes(1);
  request.mockImplementation((callback) => { callback(0); return 2; });
  const again = await render(element(`dm:${ID}`));
  cancel.mockClear();
  await again.unmount();
  expect(cancel).toHaveBeenCalledTimes(2);
  request.mockRestore();
  cancel.mockRestore();
});
