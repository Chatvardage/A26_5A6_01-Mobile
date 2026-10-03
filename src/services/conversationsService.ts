import type { ConversationSummary, LastMessage } from '@/types/conversation';
import { toConversationId } from '@/types/conversationId';

import { apiFetch } from './httpClient';
import { noUnreadSource, type UnreadSource } from './unreadSource';
import { lookupPseudos } from './usersService';

type DmItem = {
  otherUserId: string;
  lastMessage: { id: string; senderId: string; content: string; createdAt: string };
};
type ServerItem = { id: string; nom: string; salons: { id: string; nom: string }[] };
type RoomMessageItem = { id: string; authorId: string; content: string; createdAt: string };

function byRecentActivity(a: ConversationSummary, b: ConversationSummary): number {
  const ta = a.lastMessage ? Date.parse(a.lastMessage.createdAt) : -Infinity;
  const tb = b.lastMessage ? Date.parse(b.lastMessage.createdAt) : -Infinity;
  if (ta !== tb) return tb - ta;
  return a.title.localeCompare(b.title);
}

async function loadDirectMessages(): Promise<ConversationSummary[]> {
  const items = await apiFetch<DmItem[]>('/api/messages/conversations');
  const pseudos = await lookupPseudos(items.map((i) => i.otherUserId)).catch(() => ({}) as Record<string, string>);
  return items.map((item) => ({
    id: toConversationId({ kind: 'dm', targetId: item.otherUserId }),
    kind: 'dm',
    title: pseudos[item.otherUserId] ?? 'Utilisateur inconnu',
    lastMessage: item.lastMessage satisfies LastMessage,
    unreadCount: 0,
  }));
}

async function loadRooms(): Promise<ConversationSummary[]> {
  const servers = await apiFetch<ServerItem[]>('/api/servers');
  const channels = servers.flatMap((server) => server.salons.map((salon) => ({ server, salon })));
  return Promise.all(
    channels.map(async ({ server, salon }): Promise<ConversationSummary> => {
      const last = await apiFetch<RoomMessageItem[]>(`/api/messages/rooms/${salon.id}/history?limit=1`).then(
        (messages) => messages[0] ?? null,
        () => null,
      );
      return {
        id: toConversationId({ kind: 'room', targetId: salon.id }),
        kind: 'room',
        title: `#${salon.nom}`,
        subtitle: server.nom,
        lastMessage: last
          ? { id: last.id, senderId: last.authorId, content: last.content, createdAt: last.createdAt }
          : null,
        unreadCount: 0,
      };
    }),
  );
}

/** Conversations accessibles (messages privés + salons), triées par activité récente. */
export async function fetchConversations(unread: UnreadSource = noUnreadSource): Promise<ConversationSummary[]> {
  const [dms, rooms, counts] = await Promise.allSettled([loadDirectMessages(), loadRooms(), unread.getCounts()]);
  if (dms.status === 'rejected' && rooms.status === 'rejected') throw dms.reason;

  const unreadCounts = counts.status === 'fulfilled' ? counts.value : {};
  return [...(dms.status === 'fulfilled' ? dms.value : []), ...(rooms.status === 'fulfilled' ? rooms.value : [])]
    .map((c) => ({ ...c, unreadCount: Math.max(0, unreadCounts[c.id] ?? 0) }))
    .sort(byRecentActivity);
}
