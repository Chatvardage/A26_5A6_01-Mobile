import type { ConversationSummary } from '@/types/conversation';
import { toConversationId } from '@/types/conversationId';

import { apiFetch } from './httpClient';
import { getCountsSafe, noUnreadSource, type UnreadSource } from './unreadSource';
import { lookupPseudos } from './usersService';
import { getTranslations } from '@/i18n';

type DmItem = {
  otherUserId: string;
  lastMessage: { id: string; senderId: string; content: string; createdAt: string };
};

const activityTime = (c: ConversationSummary): number => (c.lastMessage ? Date.parse(c.lastMessage.createdAt) || 0 : 0);

/** Messages privés de l'utilisateur, du plus récemment actif au plus ancien. */
export async function fetchDirectMessages(unread: UnreadSource = noUnreadSource): Promise<ConversationSummary[]> {
  const [items, counts] = await Promise.all([
    apiFetch<DmItem[]>('/api/messages/conversations'),
    getCountsSafe(unread),
  ]);
  const pseudos = await lookupPseudos(items.map((i) => i.otherUserId)).catch(() => ({}) as Record<string, string>);

  return items
    .map((item): ConversationSummary => {
      const id = toConversationId({ kind: 'dm', targetId: item.otherUserId });
      return {
        id,
        kind: 'dm',
        title: pseudos[item.otherUserId] ?? getTranslations().conversation.unknownUser,
        lastMessage: item.lastMessage,
        unreadCount: Math.max(0, counts[id] ?? 0),
      };
    })
    .sort((a, b) => activityTime(b) - activityTime(a));
}
