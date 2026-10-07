import type { ChatMessage } from '@/types/conversation';
import { parseConversationId } from '@/types/conversationId';

import { ApiError } from './ApiError';
import { apiFetch } from './httpClient';
import { lookupPseudos } from './usersService';
import { getTranslations } from '@/i18n';

type RawMessage = { id: string; senderId?: string; authorId?: string; content: string; createdAt: string; updatedAt: string };

/**
 * Historique récent d'une conversation, du plus récent au plus ancien (ordre attendu par une
 * FlatList inversée). L'API renvoie la page du plus ancien au plus récent : on l'inverse ici.
 * Avec `cursor`, charge la page précédente (messages plus anciens que ce message).
 */
export async function fetchHistory(conversationId: string, limit = 50, cursor?: string): Promise<ChatMessage[]> {
  const ref = parseConversationId(conversationId);
  if (!ref) throw new ApiError('not_found', getTranslations().errors.invalidConversationId);

  // `cursor` : identifiant du plus ancien message déjà chargé ; l'API renvoie les messages précédents.
  const page = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
  const path =
    ref.kind === 'dm'
      ? `/api/messages/history/${ref.targetId}?limit=${limit}${page}`
      : `/api/messages/rooms/${ref.targetId}/history?limit=${limit}${page}`;
  const raw = await apiFetch<RawMessage[]>(path);

  // Messages privés : `senderId` ; messages de salon : `authorId` (les deux existent toujours côté API).
  const senderIds = raw.map((m) => m.senderId ?? m.authorId ?? '');
  const names = await lookupPseudos(senderIds.filter(Boolean)).catch(() => ({}) as Record<string, string>);

  return [...raw]
    .reverse()
    .map((m): ChatMessage => {
      const senderId = m.senderId ?? m.authorId ?? '';
      return {
        id: m.id,
        senderId,
        senderName: names[senderId],
        content: m.content,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      };
    });
}
