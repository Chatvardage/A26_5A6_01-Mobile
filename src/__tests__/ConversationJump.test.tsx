import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { FlatList } from 'react-native';

import { MessageBubble } from '@/components/MessageBubble';
import { useMessages } from '@/hooks/useMessages';
import { HIGHLIGHT_MS, ConversationScreen } from '@/screens/ConversationScreen';
import type { ChatMessage } from '@/types/conversation';
jest.mock('@/hooks/usePublicProfiles', () => ({ usePublicProfiles: () => ({}) }));
jest.mock('@/hooks/useReadReceipts', () => ({ useReadReceipts: () => [] }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@/hooks/useCanWrite', () => ({ useCanWrite: () => true }));
jest.mock('@react-navigation/elements', () => ({ useHeaderHeight: () => 40 }));
jest.mock('@/session/SessionContext', () => ({ useSession: () => ({ user: { id: 'me' }, drafts: new Map() }) }));
jest.mock('@/hooks/useCanModerate', () => ({ useCanModerate: () => false }));
jest.mock('@/hooks/useMessages', () => ({ useMessages: jest.fn() }));

const OLI = '22222222-2222-4222-8222-222222222222';
const TARGET = '44444444-4444-4444-8444-444444444444';
const msg = (id: string): ChatMessage => ({
  id,
  senderId: OLI,
  content: `texte ${id}`,
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-10-01T10:00:00Z',
});

let jumpTo: jest.Mock;
const mockMessages = (messages: ChatMessage[]) =>
  jest.mocked(useMessages).mockReturnValue({
    messages,
    status: 'ready',
    errorMessage: null,
    accessError: null,
    hasOlder: false,
    loadingOlder: false,
    olderError: null,
    connection: 'ready',
    retry: jest.fn(),
    loadOlder: jest.fn(),
    jumpTo,
    send: jest.fn(),
    edit: jest.fn(),
  } as unknown as ReturnType<typeof useMessages>);

const props = (params: Record<string, unknown>) =>
  ({ route: { params: { conversationId: `dm:${OLI}`, ...params } } }) as unknown as Parameters<typeof ConversationScreen>[0];
const highlighted = () => screen.queryAllByTestId('message-bubble').filter((b) => b.props.accessibilityState?.selected);

let scroll: jest.SpyInstance;
beforeEach(() => {
  jest.useFakeTimers();
  jumpTo = jest.fn(async () => true);
  scroll = jest.spyOn(FlatList.prototype, 'scrollToIndex').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.useRealTimers();
  scroll.mockRestore();
});

describe('ConversationScreen : atteindre un message', () => {
  it("défile jusqu'au message trouvé, le met en évidence puis retire la mise en évidence", async () => {
    mockMessages([msg('b'), msg(TARGET)]);
    await render(<ConversationScreen {...props({ messageId: TARGET, focusToken: 1 })} />);
    await act(async () => jest.advanceTimersByTimeAsync(10));
    expect(jumpTo).toHaveBeenCalledWith(TARGET);
    expect(scroll).toHaveBeenCalledWith({ index: 1, viewPosition: 0.5, animated: false });
    expect(highlighted()).toHaveLength(1);
    await act(async () => jest.advanceTimersByTimeAsync(HIGHLIGHT_MS + 10));
    expect(highlighted()).toHaveLength(0);
  });

  it('affiche un avis quand le message est introuvable', async () => {
    jumpTo.mockResolvedValue(false);
    mockMessages([msg('a')]);
    await render(<ConversationScreen {...props({ messageId: TARGET, focusToken: 3 })} />);
    await act(async () => jest.advanceTimersByTimeAsync(10));
    expect(screen.getByText('Ce message est introuvable : il est trop ancien ou a été supprimé.')).toBeTruthy();
    expect(scroll).not.toHaveBeenCalled();
  });

  it("ne défile pas si le message trouvé n'est plus dans la liste affichée", async () => {
    mockMessages([msg('a')]);
    await render(<ConversationScreen {...props({ messageId: TARGET, focusToken: 4 })} />);
    await act(async () => jest.advanceTimersByTimeAsync(10));
    expect(scroll).not.toHaveBeenCalled();
  });

  it("ne fait rien sans message demandé, et réagit à une nouvelle demande du même message", async () => {
    mockMessages([msg('b'), msg(TARGET)]);
    const view = await render(<ConversationScreen {...props({})} />);
    await act(async () => jest.advanceTimersByTimeAsync(10));
    expect(jumpTo).not.toHaveBeenCalled();
    await view.rerender(<ConversationScreen {...props({ messageId: TARGET, focusToken: 10 })} />);
    await act(async () => jest.advanceTimersByTimeAsync(10));
    expect(scroll).toHaveBeenCalledTimes(1);
    await act(async () => jest.advanceTimersByTimeAsync(HIGHLIGHT_MS + 10));
    await view.rerender(<ConversationScreen {...props({ messageId: TARGET, focusToken: 11 })} />);
    await act(async () => jest.advanceTimersByTimeAsync(10));
    expect(scroll).toHaveBeenCalledTimes(2);
    expect(highlighted()).toHaveLength(1);
  });

  it("ignore le résultat d'un saut remplacé par une nouvelle demande ou par le démontage", async () => {
    mockMessages([msg('b'), msg(TARGET)]);
    let resolveFirst: (found: boolean) => void = () => undefined;
    jumpTo.mockReturnValueOnce(new Promise((r) => { resolveFirst = r; }));
    const view = await render(<ConversationScreen {...props({ messageId: TARGET, focusToken: 1 })} />);
    await act(async () => jest.advanceTimersByTimeAsync(10));
    await view.rerender(<ConversationScreen {...props({ messageId: TARGET, focusToken: 2 })} />);
    await act(async () => jest.advanceTimersByTimeAsync(10));
    expect(scroll).toHaveBeenCalledTimes(1);
    scroll.mockClear();
    await act(async () => resolveFirst(true));
    expect(scroll).not.toHaveBeenCalled();
    await view.unmount();
  });

  it("se rapproche de l'index quand la position n'est pas encore mesurée", async () => {
    const offset = jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => undefined);
    mockMessages([msg('b'), msg(TARGET)]);
    await render(<ConversationScreen {...props({ messageId: TARGET, focusToken: 5 })} />);
    await act(async () => jest.advanceTimersByTimeAsync(10));
    await fireEvent(screen.getByText('texte b'), 'scrollToIndexFailed', { index: 1, averageItemLength: 80 });
    expect(offset).toHaveBeenCalledWith({ offset: 80, animated: false });
    await act(async () => jest.advanceTimersByTimeAsync(150));
    expect(scroll).toHaveBeenCalledTimes(2);
    offset.mockRestore();
  });
});

describe('ConversationScreen : nouvelle tentative de défilement', () => {
  it("annule la tentative différée au démontage et remplace une tentative en attente", async () => {
    mockMessages([msg('b'), msg(TARGET)]);
    const offset = jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => undefined);
    const view = await render(<ConversationScreen {...props({ messageId: TARGET, focusToken: 7 })} />);
    await act(async () => jest.advanceTimersByTimeAsync(10));
    scroll.mockClear();
    // Deux échecs rapprochés : la seconde tentative remplace la première (une seule relance).
    await fireEvent(screen.getByText('texte b'), 'scrollToIndexFailed', { index: 1, averageItemLength: 80 });
    await fireEvent(screen.getByText('texte b'), 'scrollToIndexFailed', { index: 1, averageItemLength: 80 });
    await act(async () => jest.advanceTimersByTimeAsync(150));
    expect(scroll).toHaveBeenCalledTimes(1);
    // Écran fermé avant la fin du délai : plus aucune relance.
    scroll.mockClear();
    await fireEvent(screen.getByText('texte b'), 'scrollToIndexFailed', { index: 1, averageItemLength: 80 });
    await view.unmount();
    await act(async () => jest.advanceTimersByTimeAsync(150));
    expect(scroll).not.toHaveBeenCalled();
    offset.mockRestore();
  });
});

describe('MessageBubble mis en évidence', () => {
  it('entoure le message atteint', async () => {
    const view = await render(<MessageBubble message={msg('a')} mine={false} showAuthor={false} highlighted />);
    expect(highlighted()).toHaveLength(1);
    await view.rerender(<MessageBubble message={msg('b')} mine showAuthor={false} />);
    expect(highlighted()).toHaveLength(0);
  });
});
