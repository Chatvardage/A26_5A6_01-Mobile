import { useCallback, useEffect, useState } from 'react';

import { userMessage } from '@/services/ApiError';
import { fetchHistory } from '@/services/messagesService';
import type { ChatMessage } from '@/types/conversation';

export type HistoryState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty' }
  | { status: 'ready'; messages: ChatMessage[] };

type Settled = Exclude<HistoryState, { status: 'loading' }>;

/** Chargement initial de l'historique REST d'une conversation (temps réel et pagination: hors périmètre). */
export function useConversationHistory(conversationId: string) {
  const [attempt, setAttempt] = useState(0);
  const key = `${conversationId}#${attempt}`;
  const [result, setResult] = useState<{ key: string; state: Settled } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchHistory(conversationId)
      .then((messages): Settled => (messages.length ? { status: 'ready', messages } : { status: 'empty' }))
      .catch((error): Settled => ({ status: 'error', message: userMessage(error) }))
      .then((state) => {
        if (!cancelled) setResult({ key, state });
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId, key]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  // Tant que le résultat ne correspond pas à la requête courante, on est en chargement.
  const state: HistoryState = result?.key === key ? result.state : { status: 'loading' };
  return { state, retry };
}
