import { act, renderHook } from '@testing-library/react-native';
import type { FlatList } from 'react-native';

import { useMessageScrollTarget } from '@/hooks/useMessageScrollTarget';
import type { ChatMessage } from '@/types/conversation';

const message = (id: string) => ({ id } as ChatMessage);
const visible = (id: string, isViewable = true) => ({
  viewableItems: [{ item: message(id), key: id, index: 4, isViewable }],
});
const failure = { index: 4, averageItemLength: 80 };
const setup = async () => {
  const scrollToIndex = jest.fn();
  const scrollToOffset = jest.fn();
  const ref = { current: { scrollToIndex, scrollToOffset } as unknown as FlatList<ChatMessage> | null };
  const positioned = jest.fn();
  const hook = await renderHook(() => useMessageScrollTarget(ref, positioned));
  return { ...hook, ref, scrollToIndex, scrollToOffset, positioned };
};
type Hook = Awaited<ReturnType<typeof setup>>;
const prepare = async (hook: Hook, id = 'target') => act(async () => hook.result.current.prepareScroll(id));
const measure = async (hook: Hook) => act(async () => {
  hook.result.current.onListLayout();
  hook.result.current.onListContentSizeChange();
});
const frames = async () => act(async () => jest.advanceTimersByTimeAsync(50));

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('attend les dimensions et le contenu, puis un placement précis et la visibilité de la cible', async () => {
  const hook = await setup();
  expect(hook.result.current.hasPendingScroll()).toBe(false);
  await prepare(hook);
  expect(hook.result.current.hasPendingScroll()).toBe(true);
  await act(async () => hook.result.current.positionScroll(4));
  await act(async () => hook.result.current.onListLayout());
  expect(hook.scrollToIndex).not.toHaveBeenCalled();
  await act(async () => hook.result.current.onListContentSizeChange());
  expect(hook.scrollToIndex).toHaveBeenCalledWith({ index: 4, viewPosition: 0.5, animated: false });
  await frames();
  expect(hook.positioned).not.toHaveBeenCalled();
  await act(async () => hook.result.current.onViewableItemsChanged(visible('elsewhere')));
  await act(async () => hook.result.current.onViewableItemsChanged(visible('target', false)));
  expect(hook.result.current.scrollTarget).toBe('target');
  await act(async () => hook.result.current.onViewableItemsChanged(visible('target')));
  // Un second événement de visibilité ne programme pas une deuxième révélation.
  await act(async () => hook.result.current.onViewableItemsChanged(visible('target')));
  await frames();
  expect(hook.positioned).toHaveBeenCalledTimes(1);
  expect(hook.positioned).toHaveBeenCalledWith('target');
  expect(hook.result.current.scrollTarget).toBeNull();
});

it('ne révèle pas une cible visible tant que son index précis échoue, même après plusieurs approximations', async () => {
  const hook = await setup();
  await prepare(hook);
  await measure(hook);
  await act(async () => hook.result.current.onViewableItemsChanged(visible('target')));
  hook.scrollToIndex.mockImplementationOnce(() => hook.result.current.onScrollToIndexFailed(failure));
  await act(async () => hook.result.current.positionScroll(4));
  expect(hook.scrollToOffset).toHaveBeenCalledWith({ offset: 320, animated: false });
  hook.scrollToIndex.mockImplementationOnce(() => hook.result.current.onScrollToIndexFailed(failure));
  await act(async () => jest.advanceTimersByTimeAsync(150));
  expect(hook.positioned).not.toHaveBeenCalled();
  expect(hook.result.current.scrollTarget).toBe('target');
  // La troisième tentative utilise les cellules enfin mesurées.
  await act(async () => jest.advanceTimersByTimeAsync(100));
  expect(hook.scrollToIndex).toHaveBeenCalledTimes(3);
  expect(hook.positioned).toHaveBeenCalledWith('target');
});

it('annule une révélation si la cible sort de la zone visible avant la deuxième image', async () => {
  const callbacks = new Map<number, FrameRequestCallback>();
  let sequence = 0;
  const requestFrame = jest.spyOn(global, 'requestAnimationFrame').mockImplementation(callback => {
    callbacks.set(++sequence, callback);
    return sequence;
  });
  const cancelFrame = jest.spyOn(global, 'cancelAnimationFrame').mockImplementation(id => { if (id != null) callbacks.delete(id); });
  const hook = await setup();
  await prepare(hook);
  await measure(hook);
  await act(async () => hook.result.current.positionScroll(4));
  await act(async () => hook.result.current.onViewableItemsChanged(visible('target')));
  await act(async () => { callbacks.get(1)!(0); callbacks.delete(1); });
  await act(async () => hook.result.current.onViewableItemsChanged(visible('elsewhere')));
  expect(callbacks.size).toBe(0);
  expect(hook.positioned).not.toHaveBeenCalled();
  await act(async () => hook.result.current.onViewableItemsChanged(visible('target')));
  await act(async () => { callbacks.get(3)!(0); callbacks.delete(3); callbacks.get(4)!(0); callbacks.delete(4); });
  expect(hook.positioned).toHaveBeenCalledWith('target');
  requestFrame.mockRestore();
  cancelFrame.mockRestore();
});

it('annule les tentatives et la révélation quand une autre recherche remplace la cible', async () => {
  const hook = await setup();
  await prepare(hook);
  await measure(hook);
  await act(async () => hook.result.current.positionScroll(4));
  await act(async () => hook.result.current.onScrollToIndexFailed(failure));
  await prepare(hook, 'second');
  hook.scrollToIndex.mockClear();
  await act(async () => jest.advanceTimersByTimeAsync(150));
  expect(hook.scrollToIndex).not.toHaveBeenCalled();
  await measure(hook);
  await act(async () => hook.result.current.positionScroll(1));
  await act(async () => hook.result.current.onViewableItemsChanged(visible('second')));
  await prepare(hook, 'third');
  await frames();
  expect(hook.positioned).not.toHaveBeenCalled();
  expect(hook.result.current.scrollTarget).toBe('third');
});

it('annule la révélation quand le placement échoue après un événement de visibilité', async () => {
  const hook = await setup();
  await prepare(hook);
  await measure(hook);
  await act(async () => hook.result.current.positionScroll(4));
  await act(async () => hook.result.current.onViewableItemsChanged(visible('target')));
  await act(async () => hook.result.current.onScrollToIndexFailed(failure));
  await frames();
  expect(hook.positioned).not.toHaveBeenCalled();
  await hook.unmount();
  await act(async () => jest.advanceTimersByTimeAsync(150));
  expect(hook.scrollToIndex).toHaveBeenCalledTimes(1);
});

it('ignore les événements tardifs sans demande active et attend une liste remontée', async () => {
  const hook = await setup();
  await act(async () => {
    hook.result.current.positionScroll(4);
    hook.result.current.onListLayout();
    hook.result.current.onListContentSizeChange();
    hook.result.current.onViewableItemsChanged(visible('target'));
    hook.result.current.onScrollToIndexFailed(failure);
  });
  expect(hook.scrollToIndex).not.toHaveBeenCalled();
  await prepare(hook);
  hook.ref.current = null;
  await measure(hook);
  await act(async () => hook.result.current.positionScroll(4));
  await act(async () => hook.result.current.onScrollToIndexFailed(failure));
  await act(async () => jest.advanceTimersByTimeAsync(150));
  expect(hook.scrollToIndex).not.toHaveBeenCalled();
  expect(hook.scrollToOffset).not.toHaveBeenCalled();
  await act(async () => hook.result.current.clearScroll());
  expect(hook.result.current.hasPendingScroll()).toBe(false);
});
