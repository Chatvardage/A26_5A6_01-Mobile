import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { fetchHistory } from '@/services/messagesService';
import { hasRealtimeBeenReady, onReady } from '@/services/websocketService';
import type { ChatMessage } from '@/types/conversation';

import { useLoadable, type LoadState } from './useLoadable';

const PAGE_SIZE = 50;
/** Garde-fou comme le client Web : au plus 20 pages (1 000 messages) chargées pour atteindre un message. */
const MAX_JUMP_PAGES = 20;

const byNewest = (a: ChatMessage, b: ChatMessage) =>
  (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0) || b.id.localeCompare(a.id);

/** Fusion sans doublon, du plus récent au plus ancien (ordre de la FlatList inversée). */
function mergeHistory(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const known = new Set(current.map((m) => m.id));
  return [...current, ...incoming.filter((m) => !known.has(m.id))].sort(byNewest);
}

/**
 * Historique REST d'une conversation. `jumpTo(messageId)` charge les pages plus anciennes, sans trou,
 * jusqu'à ce message (comme « Charger plus » sur le Web) et retourne `false` s'il est introuvable.
 */
export function useConversationHistory(conversationId: string) {
  const load = useCallback(() => fetchHistory(conversationId), [conversationId]);
  const loadable = useLoadable(load, (messages) => messages.length === 0);
  const [older, setOlder] = useState<{ id: string; messages: ChatMessage[] }>({ id: conversationId, messages: [] });
  const merged = useMemo(
    () =>
      loadable.state.status === 'ready'
        ? mergeHistory(loadable.state.data, older.id === conversationId ? older.messages : [])
        : null,
    [loadable.state, older, conversationId],
  );
  const loaded = useRef<ChatMessage[]>([]);
  const exhausted = useRef(false);
  const active = useRef(conversationId);
  useEffect(() => {
    loaded.current = merged ?? [];
  }, [merged]);
  useEffect(() => {
    active.current = conversationId;
    exhausted.current = false;
  }, [conversationId]);

  const jumpTo = useCallback(
    async (messageId: string): Promise<boolean> => {
      for (let page = 0; ; page++) {
        if (loaded.current.some((m) => m.id === messageId)) return true;
        const oldest = loaded.current.at(-1);
        if (exhausted.current || !oldest || page >= MAX_JUMP_PAGES) return false;
        try {
          const previous = await fetchHistory(conversationId, PAGE_SIZE, oldest.id);
          if (active.current !== conversationId) return false;
          exhausted.current = previous.length < PAGE_SIZE;
          loaded.current = mergeHistory(loaded.current, previous);
          setOlder((prev) => ({
            id: conversationId,
            messages: mergeHistory(prev.id === conversationId ? prev.messages : [], previous),
          }));
        } catch {
          return false;
        }
      }
    },
    [conversationId],
  );

  // Après une coupure, le canal temps réel qui redevient prêt déclenche un rechargement par l'API :
  // les messages manqués réapparaissent sans doublon (l'historique REST est la source de vérité).
  const { refresh } = loadable;
  const firstReady = useRef(true);
  useEffect(() => {
    firstReady.current = !hasRealtimeBeenReady();
    try {
      return onReady(() => {
        // Le premier signal suit la connexion initiale : l'historique vient d'être chargé.
        if (firstReady.current) {
          firstReady.current = false;
          return;
        }
        void refresh();
      });
    } catch {
      return undefined;
    }
  }, [refresh]);

  const state: LoadState<ChatMessage[]> = merged ? { status: 'ready', data: merged } : loadable.state;
  return { ...loadable, state, jumpTo };
}
