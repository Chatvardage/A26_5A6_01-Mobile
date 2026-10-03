import { useCallback } from 'react';

import { fetchHistory } from '@/services/messagesService';

import { useLoadable } from './useLoadable';

/** Chargement initial de l'historique REST d'une conversation (temps réel et pagination: hors périmètre). */
export function useConversationHistory(conversationId: string) {
  const load = useCallback(() => fetchHistory(conversationId), [conversationId]);
  return useLoadable(load, (messages) => messages.length === 0);
}
