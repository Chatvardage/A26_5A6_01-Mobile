import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import { FlatList } from 'react-native';

import { MessageBubble } from '@/components/MessageBubble';
import { HIGHLIGHT_MS, ConversationScreen } from '@/screens/ConversationScreen';
import { useConversationHistory } from '@/hooks/useConversationHistory';
import { fetchHistory } from '@/services/messagesService';
import type { ChatMessage } from '@/types/conversation';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@react-navigation/elements', () => ({ useHeaderHeight: () => 40 }));
jest.mock('@/session/SessionContext', () => ({ useSession: () => ({ user: { id: 'me' } }) }));
jest.mock('@/services/messagesService');
jest.mock('@/services/websocketService');

const OLI = '22222222-2222-4222-8222-222222222222';
const TARGET = '44444444-4444-4444-8444-444444444444';
const msg = (id: string, minutes: number): ChatMessage => ({
  id,
  senderId: OLI,
  content: `texte ${id}`,
  createdAt: new Date(Date.UTC(2026, 9, 1, 12, 0) - minutes * 60_000).toISOString(),
  updatedAt: new Date(Date.UTC(2026, 9, 1, 12, 0) - minutes * 60_000).toISOString(),
});
const page = (prefix: string, from: number, count: number) =>
  Array.from({ length: count }, (_, i) => msg(`${prefix}${from + i}`, from + i));

const fetch = jest.mocked(fetchHistory);
const screenProps = (params: Record<string, unknown>) =>
  ({ route: { params: { conversationId: `dm:${OLI}`, ...params } } }) as unknown as Parameters<typeof ConversationScreen>[0];
beforeEach(() => {
  jest.clearAllMocks();
});

describe('useConversationHistory.jumpTo', () => {
  const setup = async (recent: ChatMessage[]) => {
    fetch.mockResolvedValueOnce(recent);
    const hook = await renderHook(({ id }: { id: string }) => useConversationHistory(id), { initialProps: { id: `dm:${OLI}` } });
    await waitFor(() => expect(hook.result.current.state.status).toBe('ready'));
    return hook;
  };

  it('tolère une date illisible et garde un ordre stable', async () => {
    const hook = await setup([msg('a', 1), { ...msg('b', 2), createdAt: 'illisible' }, msg('c', 3), { ...msg('d', 4), createdAt: 'illisible' }]);
    await expect(hook.result.current.jumpTo('d')).resolves.toBe(true);
    const state = hook.result.current.state;
    expect(state.status === 'ready' && state.data.map((m) => m.id)).toEqual(['a', 'c', 'd', 'b']);
  });

  it('retrouve tout de suite un message déjà chargé, sans appel supplémentaire', async () => {
    const hook = await setup([msg('a', 1), msg('b', 2)]);
    await expect(hook.result.current.jumpTo('b')).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("charge les pages plus anciennes, sans trou ni doublon, jusqu'au message", async () => {
    const hook = await setup(page('r', 0, 50));
    fetch.mockResolvedValueOnce(page('p', 50, 50));
    fetch.mockResolvedValueOnce([...page('q', 100, 49), msg(TARGET, 149), msg('r49', 49)]);
    let found = false;
    await act(async () => {
      found = await hook.result.current.jumpTo(TARGET);
    });
    expect(found).toBe(true);
    expect(fetch).toHaveBeenNthCalledWith(2, `dm:${OLI}`, 50, 'r49');
    expect(fetch).toHaveBeenNthCalledWith(3, `dm:${OLI}`, 50, 'p99');
    const state = hook.result.current.state;
    expect(state.status).toBe('ready');
    const ids = state.status === 'ready' ? state.data.map((m) => m.id) : [];
    expect(ids).toHaveLength(new Set(ids).size);
    expect(ids).toContain(TARGET);
    expect(ids[0]).toBe('r0');
    expect(ids.at(-1)).toBe(TARGET);
  });

  it("s'arrête à la fin de l'historique : message introuvable", async () => {
    const hook = await setup(page('r', 0, 50));
    fetch.mockResolvedValueOnce(page('p', 50, 3));
    await expect(hook.result.current.jumpTo(TARGET)).resolves.toBe(false);
    await expect(hook.result.current.jumpTo(TARGET)).resolves.toBe(false);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('abandonne après 20 pages', async () => {
    const hook = await setup(page('r', 0, 50));
    fetch.mockImplementation(async (_id, _limit, cursor) => page(`c${cursor}-`, 1, 50));
    await expect(hook.result.current.jumpTo(TARGET)).resolves.toBe(false);
    expect(fetch).toHaveBeenCalledTimes(21);
  });

  it("retourne faux quand le chargement d'une page échoue ou sans historique chargé", async () => {
    const hook = await setup(page('r', 0, 50));
    fetch.mockRejectedValueOnce(new Error('réseau'));
    await expect(hook.result.current.jumpTo(TARGET)).resolves.toBe(false);
    fetch.mockResolvedValueOnce([]);
    const empty = await renderHook(() => useConversationHistory(`room:${OLI}`));
    await waitFor(() => expect(empty.result.current.state.status).toBe('empty'));
    await expect(empty.result.current.jumpTo(TARGET)).resolves.toBe(false);
  });

  it('abandonne si la conversation change pendant le chargement', async () => {
    const hook = await setup(page('r', 0, 50));
    let resolve: (messages: ChatMessage[]) => void = () => undefined;
    fetch.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    let result: Promise<boolean> = Promise.resolve(true);
    await act(async () => {
      result = hook.result.current.jumpTo(TARGET);
    });
    fetch.mockResolvedValueOnce([msg('autre', 1)]);
    await hook.rerender({ id: `room:${OLI}` });
    await act(async () => resolve(page('p', 50, 50)));
    await expect(result).resolves.toBe(false);
  });

  it("repart d'un historique vide dans une autre conversation après un saut", async () => {
    const hook = await setup(page('r', 0, 50));
    fetch.mockResolvedValueOnce([msg(TARGET, 60)]);
    await act(async () => {
      await hook.result.current.jumpTo(TARGET);
    });
    fetch.mockResolvedValueOnce(page('s', 0, 50));
    await hook.rerender({ id: `room:${OLI}` });
    await waitFor(() => expect(hook.result.current.state.status).toBe('ready'));
    fetch.mockResolvedValueOnce([msg('ancien-salon', 80)]);
    await act(async () => {
      await expect(hook.result.current.jumpTo('ancien-salon')).resolves.toBe(true);
    });
    const state = hook.result.current.state;
    expect(state.status === 'ready' && state.data.some((m) => m.id === TARGET)).toBe(false);
  });

  it("ignore les pages anciennes d'une autre conversation après un changement", async () => {
    const hook = await setup(page('r', 0, 50));
    fetch.mockResolvedValueOnce([msg(TARGET, 60)]);
    await act(async () => {
      await hook.result.current.jumpTo(TARGET);
    });
    fetch.mockResolvedValueOnce([msg('x', 1)]);
    await hook.rerender({ id: `room:${OLI}` });
    await waitFor(() => {
      const s = hook.result.current.state;
      expect(s.status === 'ready' && s.data.map((m) => m.id)).toEqual(['x']);
    });
  });
});

describe('ConversationScreen : atteindre un message', () => {
  let scroll: jest.SpyInstance;
  const mount = (params: Record<string, unknown>, messages = [msg(TARGET, 5), msg('b', 1)]) => {
    fetch.mockResolvedValue(messages);
    return render(<ConversationScreen {...screenProps({ ...params })} />);
  };

  beforeEach(() => {
    jest.useFakeTimers();
    scroll = jest.spyOn(FlatList.prototype, 'scrollToIndex').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.useRealTimers();
    scroll.mockRestore();
  });

  it('défile jusqu\'au message trouvé, le met en évidence puis retire la mise en évidence', async () => {
    await mount({ messageId: TARGET, focusToken: 1 });
    await act(async () => jest.advanceTimersByTimeAsync(10));
    expect(scroll).toHaveBeenCalledWith({ index: 1, viewPosition: 0.5, animated: true });
    expect(screen.getAllByTestId('message-highlighted')).toHaveLength(1);
    expect(screen.queryByRole('alert')).toBeNull();
    await act(async () => jest.advanceTimersByTimeAsync(HIGHLIGHT_MS + 10));
    expect(screen.queryByTestId('message-highlighted')).toBeNull();
  });

  it("charge les messages plus anciens avant de défiler, et signale un message introuvable", async () => {
    const recent = Array.from({ length: 50 }, (_, i) => msg(`r${i}`, i));
    fetch.mockResolvedValueOnce(recent);
    fetch.mockResolvedValueOnce([msg(TARGET, 80)]);
    await render(<ConversationScreen {...screenProps({ messageId: TARGET, focusToken: 2 })} />);
    await act(async () => jest.advanceTimersByTimeAsync(10));
    expect(fetch).toHaveBeenCalledWith(`dm:${OLI}`, 50, 'r49');
    expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ index: 50 }));
  });

  it('affiche un avis quand le message est introuvable', async () => {
    fetch.mockResolvedValue([msg('a', 1)]);
    await render(<ConversationScreen {...screenProps({ messageId: TARGET, focusToken: 3 })} />);
    await act(async () => jest.advanceTimersByTimeAsync(10));
    expect(screen.getByText('Ce message est introuvable : il est trop ancien ou a été supprimé.')).toBeTruthy();
    expect(scroll).not.toHaveBeenCalled();
  });

  it("ne fait rien sans message demandé et réagit à une nouvelle demande du même message", async () => {
    const view = await mount({});
    await act(async () => jest.advanceTimersByTimeAsync(10));
    expect(scroll).not.toHaveBeenCalled();
    await view.rerender(<ConversationScreen {...screenProps({ messageId: TARGET, focusToken: 10 })} />);
    await act(async () => jest.advanceTimersByTimeAsync(10));
    expect(scroll).toHaveBeenCalledTimes(1);
    await act(async () => jest.advanceTimersByTimeAsync(HIGHLIGHT_MS + 10));
    await view.rerender(<ConversationScreen {...screenProps({ messageId: TARGET, focusToken: 11 })} />);
    await act(async () => jest.advanceTimersByTimeAsync(10));
    expect(scroll).toHaveBeenCalledTimes(2);
    expect(screen.getAllByTestId('message-highlighted')).toHaveLength(1);
  });

  it("ignore le résultat d'un saut remplacé par une nouvelle demande", async () => {
    const SECOND = '66666666-6666-4666-8666-666666666666';
    const recent = Array.from({ length: 50 }, (_, i) => (i === 3 ? msg(SECOND, 3) : msg(`r${i}`, i)));
    fetch.mockResolvedValueOnce(recent);
    let resolve: (messages: ChatMessage[]) => void = () => undefined;
    fetch.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    const view = await render(<ConversationScreen {...screenProps({ messageId: TARGET, focusToken: 1 })} />);
    await act(async () => jest.advanceTimersByTimeAsync(10));
    await view.rerender(<ConversationScreen {...screenProps({ messageId: SECOND, focusToken: 2 })} />);
    await act(async () => jest.advanceTimersByTimeAsync(10));
    expect(scroll).toHaveBeenCalledTimes(1);
    scroll.mockClear();
    await act(async () => resolve([msg(TARGET, 80)]));
    expect(scroll).not.toHaveBeenCalled();
  });

  it("ignore un défilement demandé alors que la réponse arrive après le démontage", async () => {
    let resolve: (messages: ChatMessage[]) => void = () => undefined;
    fetch.mockReturnValue(new Promise((r) => { resolve = r; }));
    const view = await render(<ConversationScreen {...screenProps({ messageId: TARGET, focusToken: 4 })} />);
    await view.unmount();
    await act(async () => resolve([msg(TARGET, 1)]));
    expect(scroll).not.toHaveBeenCalled();
  });

  it("se rapproche de l'index quand la position n'est pas encore mesurée", async () => {
    const offset = jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => undefined);
    await mount({ messageId: TARGET, focusToken: 5 });
    await act(async () => jest.advanceTimersByTimeAsync(10));
    await fireEvent(screen.getByText('texte b'), 'scrollToIndexFailed', { index: 1, averageItemLength: 80 });
    expect(offset).toHaveBeenCalledWith({ offset: 80, animated: false });
    await act(async () => jest.advanceTimersByTimeAsync(150));
    expect(scroll).toHaveBeenCalledTimes(2);
    offset.mockRestore();
  });
});

describe('MessageBubble mis en évidence', () => {
  it('entoure le message atteint', async () => {
    const view = await render(<MessageBubble message={msg('a', 1)} mine={false} showAuthor={false} highlighted />);
    expect(screen.getByTestId('message-highlighted')).toBeTruthy();
    await view.rerender(<MessageBubble message={msg('b', 1)} mine showAuthor={false} />);
    expect(screen.queryByTestId('message-highlighted')).toBeNull();
  });
});
