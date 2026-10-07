import { parseConversationId } from '@/types/conversationId';

import { ApiError } from './ApiError';
import { apiFetch } from './httpClient';
import type { UnreadCounts, UnreadSource } from './unreadSource';
import { getTranslations } from '@/i18n';

/** Compteurs persistés côté serveur (état de lecture en base) : justes après un redémarrage de l'application. */
export async function fetchUnreadCounts(): Promise<UnreadCounts> {
  const raw = await apiFetch<{ counts?: Record<string, unknown> }>('/api/messages/unread');
  const counts: UnreadCounts = {};
  for (const [id, value] of Object.entries(raw?.counts ?? {})) {
    if (parseConversationId(id) && typeof value === 'number' && value > 0) counts[id] = Math.floor(value);
  }
  return counts;
}

export const apiUnreadSource: UnreadSource = { getCounts: fetchUnreadCounts };

/** Marque la conversation comme lue jusqu'à son message le plus récent. */
export async function markConversationRead(conversationId: string): Promise<void> {
  const ref = parseConversationId(conversationId);
  if (!ref) throw new ApiError('not_found', getTranslations().errors.invalidConversationId);
  const path =
    ref.kind === 'dm'
      ? `/api/messages/conversations/${ref.targetId}/read`
      : `/api/messages/rooms/${ref.targetId}/read`;
  await apiFetch<unknown>(path, { method: 'PUT' });
}
