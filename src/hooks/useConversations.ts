import { useCallback, useEffect, useRef, useState } from 'react';

import { userMessage } from '@/services/ApiError';
import { fetchConversations } from '@/services/conversationsService';
import type { UnreadSource } from '@/services/unreadSource';
import type { ConversationSummary } from '@/types/conversation';

export type ConversationsState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty' }
  | { status: 'ready'; conversations: ConversationSummary[] };

export function useConversations(unread?: UnreadSource) {
  const [state, setState] = useState<ConversationsState>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      const id = ++requestId.current;
      if (mode === 'initial') setState({ status: 'loading' });
      else setRefreshing(true);
      try {
        const conversations = await fetchConversations(unread);
        if (id !== requestId.current) return;
        setState(conversations.length === 0 ? { status: 'empty' } : { status: 'ready', conversations });
      } catch (error) {
        if (id !== requestId.current) return;
        // Un échec de rafraîchissement ne vide pas une liste déjà affichée.
        setState((prev) =>
          mode === 'refresh' && prev.status === 'ready' ? prev : { status: 'error', message: userMessage(error) },
        );
      } finally {
        if (id === requestId.current) setRefreshing(false);
      }
    },
    [unread],
  );

  useEffect(() => {
    void load('initial');
    return () => {
      // Compteur de requêtes (pas un nœud React) : on invalide la réponse en vol.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      requestId.current++;
    };
  }, [load]);

  const retry = useCallback(() => load('initial'), [load]);
  const refresh = useCallback(() => load('refresh'), [load]);

  return { state, refreshing, retry, refresh };
}
