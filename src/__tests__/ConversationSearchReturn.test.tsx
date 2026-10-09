import { act, render, screen, waitFor } from '@testing-library/react-native';
import { FlatList, type FlatListProps } from 'react-native';

import { ConversationScreen } from '@/screens/ConversationScreen';
import { fetchHistory } from '@/services/messagesService';
import type { ChatMessage } from '@/types/conversation';

let mockListProps: FlatListProps<ChatMessage>;
let mockListVisibility: boolean[] = [];
jest.mock('react-native/Libraries/Lists/FlatList', () => {
  const Actual = jest.requireActual('react-native/Libraries/Lists/FlatList');
  const Base = Actual.default ?? Actual;
  class CapturingFlatList extends Base {
    render() { mockListProps = this.props; mockListVisibility.push(!this.props.accessibilityElementsHidden); return super.render(); }
  }
  return { __esModule: true, default: CapturingFlatList };
});

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('@react-navigation/elements', () => ({ useHeaderHeight: () => 40 }));
jest.mock('@/services/publicProfiles.service', () => ({
  getPublicProfiles: jest.fn(async () => [{ idUtilisateur: ID, alias: 'Alias', avatar: null, actif: true }]),
}));
jest.mock('@/hooks/useReadReceipts', () => ({ useReadReceipts: () => [] }));
jest.mock('@/hooks/useCanWrite', () => ({ useCanWrite: () => true }));
jest.mock('@/hooks/useCanModerate', () => ({ useCanModerate: () => false }));
jest.mock('@/services/receipts.service', () => ({ confirmDelivery: jest.fn(async () => undefined) }));
jest.mock('@/services/usersService', () => ({ lookupPseudos: jest.fn(async () => ({})) }));
jest.mock('@/services/messagesService', () => ({
  ...jest.requireActual('@/services/messagesService'),
  fetchHistory: jest.fn(), hasNewerMessages: jest.fn(async () => true),
}));
const mockPresenceHandlers = new Set<(raw: unknown) => void>();
const mockRealtime = {
  followPresence: jest.fn(async () => [ID]),
  getRealtimeState: () => 'ready',
  joinRoom: async () => undefined,
  leaveRoom: async () => undefined,
  onConnectionState: () => () => undefined,
  onReady: () => () => undefined,
  subscribe: (event: string, handler: (raw: unknown) => void) => {
    if (event === 'presence.changed') mockPresenceHandlers.add(handler);
    return () => { mockPresenceHandlers.delete(handler); };
  },
};
jest.mock('@/session/SessionContext', () => ({
  useSession: () => ({ user: { id: 'me' }, drafts: new Map(), realtime: mockRealtime }),
}));
const ID = '22222222-2222-4222-8222-222222222222';
const TARGET = '44444444-4444-4444-8444-444444444444';
const message = (id: string): ChatMessage => ({
  id, senderId: ID, content: `texte ${id}`,
  createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z',
});
const props = (kind: string, messageId?: string, focusToken?: number) => ({
  navigation: { setOptions: jest.fn(), push: jest.fn() },
  route: { params: { conversationId: `${kind}:${ID}`, messageId, focusToken } },
}) as unknown as Parameters<typeof ConversationScreen>[0];

const placeTarget = async () => {
  await act(async () => {
    mockListProps.onLayout!({ nativeEvent: { layout: { height: 600 } } } as never);
    mockListProps.onContentSizeChange!(400, 4000);
    mockListProps.onViewableItemsChanged!({
      viewableItems: [{ item: message(TARGET), key: TARGET, index: 0, isViewable: true }], changed: [],
    });
  });
};

it.each(['dm', 'room'])('ne révèle aucune liste intermédiaire lors de la première ouverture ciblée %s', async kind => {
  jest.mocked(fetchHistory).mockReset().mockResolvedValueOnce([message(TARGET)]).mockResolvedValue([]);
  const scroll = jest.spyOn(FlatList.prototype, 'scrollToIndex').mockImplementation(() => undefined);
  mockListVisibility = [];
  try {
    const view = await render(<ConversationScreen {...props(kind, TARGET, 1)} />);
    await waitFor(() => expect(screen.getByTestId('message-positioning')).toBeTruthy());
    expect(mockListVisibility).not.toContain(true);
    expect(screen.getByText('Chargement des messages…')).toBeTruthy();
    expect(fetchHistory).toHaveBeenCalledTimes(2);
    await placeTarget();
    await waitFor(() => expect(screen.getByText(`texte ${TARGET}`)).toBeTruthy());
    expect(mockListVisibility).toContain(true);
    expect(scroll).toHaveBeenCalledWith({ index: 0, viewPosition: 0.5, animated: false });
    await view.unmount();
  } finally {
    scroll.mockRestore();
  }
});

it.each([
  ['dm', false], ['room', false], ['dm', true], ['room', true],
] as const)('ouvre un résultat dans la conversation %s (cible déjà chargée : %s) avec un écran de chargement', async (kind, alreadyLoaded) => {
  jest.mocked(fetchHistory).mockReset().mockResolvedValueOnce([
    message('recent'), ...(alreadyLoaded ? [message(TARGET)] : []),
  ]);
  const scroll = jest.spyOn(FlatList.prototype, 'scrollToIndex').mockImplementation(() => undefined);
  try {
    const view = await render(<ConversationScreen {...props(kind)} />);
    await waitFor(() => expect(screen.getByText('texte recent')).toBeTruthy());
    let resolve!: (messages: ChatMessage[]) => void;
    // La cible (réponse retenue), puis les messages qui la suivent (aucun).
    if (!alreadyLoaded) jest.mocked(fetchHistory).mockImplementationOnce(() => new Promise(done => { resolve = done; })).mockResolvedValue([]);
    mockListVisibility = [];
    await view.rerender(<ConversationScreen {...props(kind, TARGET, 1)} />);
    // Vérifier chaque rendu, y compris celui qui précède les effets : aucune ancienne liste visible.
    expect(mockListVisibility).not.toContain(true);
    expect(screen.getByText('Chargement des messages…')).toBeTruthy();
    expect(screen.queryByTestId('messages-list')).toBeNull();
    expect(scroll).not.toHaveBeenCalled();
    if (!alreadyLoaded) await act(async () => resolve([message(TARGET)]));
    await waitFor(() => expect(screen.getByTestId('message-positioning')).toBeTruthy());
    expect(screen.getByTestId('message-positioning')).toBeTruthy();
    expect(screen.queryByText(`texte ${TARGET}`)).toBeNull();
    expect(mockListVisibility).not.toContain(true);
    expect(mockListProps.initialNumToRender).toBe(101);
    await placeTarget();
    await waitFor(() => expect(screen.getByText(`texte ${TARGET}`)).toBeTruthy());
    expect(screen.queryByText('Chargement des messages…')).toBeNull();
    const historyCalls = alreadyLoaded ? 1 : 3;
    expect(fetchHistory).toHaveBeenCalledTimes(historyCalls);
    if (!alreadyLoaded) {
      expect(fetchHistory).toHaveBeenNthCalledWith(2, `${kind}:${ID}`, 50, undefined, { around: TARGET });
      expect(fetchHistory).toHaveBeenLastCalledWith(`${kind}:${ID}`, 50, TARGET, { direction: 'after' });
    }
    // Rien de plus récent : pas de bouton « Charger les messages plus récents ».
    expect(screen.queryByText('Charger les messages plus récents')).toBeNull();
    expect(scroll).toHaveBeenCalledWith({ index: alreadyLoaded ? 1 : 0, viewPosition: 0.5, animated: false });
    expect(mockListProps.initialNumToRender).toBe(101);
    await act(async () => { mockPresenceHandlers.forEach(handler => handler({ userId: ID, statut: 'hors-ligne' })); });
    expect(scroll).toHaveBeenCalledTimes(1);
    mockListVisibility = [];
    await view.rerender(<ConversationScreen {...props(kind, TARGET, 2)} />);
    expect(mockListVisibility).not.toContain(true);
    expect(screen.getByText('Chargement des messages…')).toBeTruthy();
    expect(screen.queryByTestId('messages-list')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('message-positioning')).toBeTruthy());
    await placeTarget();
    await waitFor(() => expect(screen.getByText(`texte ${TARGET}`)).toBeTruthy());
    expect(scroll).toHaveBeenCalledTimes(2);
    expect(fetchHistory).toHaveBeenCalledTimes(historyCalls);
    await view.unmount();
  } finally {
    scroll.mockRestore();
  }
});
