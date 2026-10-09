import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { FlatList, ViewToken } from 'react-native';

import type { ChatMessage } from '@/types/conversation';

type Target = { id: string; index: number | null; visible: boolean; precise: boolean };

/** Garde la liste masquée jusqu'au placement natif d'une cible mesurée et visible. */
export function useMessageScrollTarget(listRef: RefObject<FlatList<ChatMessage> | null>, onPositioned: (id: string) => void) {
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);
  const target = useRef<Target | null>(null);
  const laidOut = useRef(false);
  const contentReady = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealFrame = useRef<number | null>(null);

  const cancelPending = useCallback(() => {
    if (retryTimer.current !== null) clearTimeout(retryTimer.current);
    if (revealFrame.current !== null) cancelAnimationFrame(revealFrame.current);
    retryTimer.current = null;
    revealFrame.current = null;
  }, []);

  const clearScroll = useCallback(() => {
    cancelPending();
    target.current = null;
    setScrollTarget(null);
  }, [cancelPending]);

  const reveal = useCallback(() => {
    const request = target.current;
    if (!request || !request.precise || !request.visible || revealFrame.current !== null) return;
    // Laisser au natif le temps d'appliquer le placement avant d'enlever le chargement.
    revealFrame.current = requestAnimationFrame(() => {
      revealFrame.current = requestAnimationFrame(() => {
        clearScroll();
        onPositioned(request.id);
      });
    });
  }, [clearScroll, onPositioned]);

  const attempt = useCallback(() => {
    const request = target.current;
    const list = listRef.current;
    if (!request || request.index === null || !laidOut.current || !contentReady.current || !list) return;
    cancelPending();
    request.precise = true;
    // onScrollToIndexFailed est synchrone : il remet precise à false si les cellules ne sont pas mesurées.
    list.scrollToIndex({ index: request.index, viewPosition: 0.5, animated: false });
    reveal();
  }, [cancelPending, listRef, reveal]);

  useEffect(() => cancelPending, [cancelPending]);

  const prepareScroll = useCallback((id: string) => {
    cancelPending();
    laidOut.current = false;
    contentReady.current = false;
    target.current = { id, index: null, visible: false, precise: false };
    setScrollTarget(id);
  }, [cancelPending]);

  const positionScroll = useCallback((index: number) => {
    const request = target.current;
    if (!request) return;
    request.index = index;
    attempt();
  }, [attempt]);

  const onListLayout = useCallback(() => {
    laidOut.current = true;
    attempt();
  }, [attempt]);

  const onListContentSizeChange = useCallback(() => {
    contentReady.current = true;
    attempt();
  }, [attempt]);

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken<ChatMessage>[] }) => {
    const request = target.current;
    if (!request) return;
    request.visible = viewableItems.some(item => item.isViewable && item.item.id === request.id);
    if (!request.visible) {
      if (revealFrame.current !== null) cancelAnimationFrame(revealFrame.current);
      revealFrame.current = null;
      return;
    }
    reveal();
  }, [reveal]);

  const onScrollToIndexFailed = useCallback((info: { index: number; averageItemLength: number }) => {
    const request = target.current;
    if (!request) return;
    request.precise = false;
    cancelPending();
    listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
    // La cible reste masquée pendant les approximations. Recalculer son index à chaque nouvelle demande.
    retryTimer.current = setTimeout(() => {
      retryTimer.current = null;
      attempt();
    }, 100);
  }, [attempt, cancelPending, listRef]);

  const hasPendingScroll = useCallback(() => target.current !== null, []);

  return { scrollTarget, prepareScroll, clearScroll, positionScroll, hasPendingScroll, onListLayout, onListContentSizeChange, onViewableItemsChanged, onScrollToIndexFailed };
}
