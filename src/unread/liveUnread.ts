import { useMemo } from 'react';

import type { ConversationSummary } from '@/types/conversation';
import type { ServerSummary } from '@/types/server';

import { useUnread } from './UnreadContext';

/**
 * Applique les compteurs en direct aux listes : une liste chargée il y a un moment ne connaît pas les
 * messages arrivés depuis. Tant que les compteurs du serveur ne sont pas lus, on garde ceux du chargement.
 */
export function useLiveConversations(conversations: ConversationSummary[]): ConversationSummary[] {
  const { counts, loaded } = useUnread();
  return useMemo(
    () => (loaded ? conversations.map((c) => ({ ...c, unreadCount: counts[c.id] ?? 0 })) : conversations),
    [conversations, counts, loaded],
  );
}

/** Pastille d'un serveur : somme des non-lus de ses salons. */
export function useLiveServers(servers: ServerSummary[]): ServerSummary[] {
  const { counts, loaded } = useUnread();
  return useMemo(
    () =>
      loaded
        ? servers.map((s) => ({
            ...s,
            unreadCount: s.channelIds.reduce((total, channelId) => total + (counts[`room:${channelId}`] ?? 0), 0),
          }))
        : servers,
    [servers, counts, loaded],
  );
}
