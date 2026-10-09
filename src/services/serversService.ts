import type { ConversationSummary } from '@/types/conversation';
import { parseConversationId, toConversationId } from '@/types/conversationId';
import { canModerate } from '@/types/serverRole';
import type { ServerSummary } from '@/types/server';

import { mapWithConcurrency } from '@/utils/mapWithConcurrency';

import { apiFetch } from './httpClient';
import { getCountsSafe, noUnreadSource, type UnreadSource } from './unreadSource';

type RawChannel = { id: string; nom: string };
type RawServer = { id: string; nom: string; nombreMembres: number; salons: RawChannel[]; monRole?: unknown };
type RawRoomMessage = { id: string; authorId: string; content: string; createdAt: string };

// Une requête de dernier message par salon (pas d'endpoint dédié) : on limite la concurrence sur mobile.
// TODO(api) : à supprimer si le Serveur-API ajoute `dernierMessage` à la réponse de GET /api/servers/:id.
const LAST_MESSAGE_CONCURRENCY = 5;

const roomId = (channelId: string) => toConversationId({ kind: 'room', targetId: channelId });

/** Dernier message de chaque salon lisible ; une panne laisse simplement l'ordre de l'API. */
async function fetchActivity(): Promise<Record<string, string>> {
  try {
    const body = await apiFetch<{ rooms?: Record<string, string> }>('/api/messages/activity');
    return body?.rooms ?? {};
  } catch {
    return {};
  }
}

const activityTime = (server: ServerSummary) => (server.lastActivity ? Date.parse(server.lastActivity) || 0 : 0);

/**
 * Serveurs de l'utilisateur, du plus récemment actif (dernier message d'un de ses salons) au moins actif.
 * À activité égale (ou sans message), l'ordre de l'API est conservé.
 */
export async function fetchServers(unread: UnreadSource = noUnreadSource): Promise<ServerSummary[]> {
  const [servers, counts, activity] = await Promise.all([apiFetch<RawServer[]>('/api/servers'), getCountsSafe(unread), fetchActivity()]);
  return servers
    .map((server): ServerSummary => {
      const last = server.salons.map((s) => activity[roomId(s.id)]).filter(Boolean).sort().at(-1) ?? null;
      return {
        id: server.id,
        name: server.nom,
        memberCount: server.nombreMembres,
        channelIds: server.salons.map((s) => s.id),
        unreadCount: server.salons.reduce((sum, s) => sum + Math.max(0, counts[roomId(s.id)] ?? 0), 0),
        lastActivity: last,
      };
    })
    .sort((a, b) => activityTime(b) - activityTime(a));
}

/**
 * L'utilisateur peut-il supprimer les messages des autres dans cette conversation ? Seuls les salons ont des
 * modérateurs : un message privé répond toujours non, sans appel réseau. Le rôle vient de `monRole` de
 * `GET /api/servers` (rôle effectif de l'appelant dans chaque serveur).
 */
export async function fetchCanModerate(conversationId: string): Promise<boolean> {
  const ref = parseConversationId(conversationId);
  if (ref?.kind !== 'room') return false;
  const servers = await apiFetch<RawServer[]>('/api/servers');
  // Réponse inattendue : pas de modération proposée (l'API refuserait de toute façon).
  if (!Array.isArray(servers)) return false;
  const server = servers.find(
    (candidate) => Array.isArray(candidate?.salons) && candidate.salons.some((channel) => channel.id === ref.targetId),
  );
  return canModerate(server?.monRole);
}

export type ServerChannels = { name: string; channels: ConversationSummary[] };

/** Salons accessibles d'un serveur (l'API ne renvoie que ceux que l'utilisateur peut voir), avec leur dernier message. */
export async function fetchServerChannels(serverId: string, unread: UnreadSource = noUnreadSource): Promise<ServerChannels> {
  const [server, counts] = await Promise.all([apiFetch<RawServer>(`/api/servers/${serverId}`), getCountsSafe(unread)]);

  const channels = await mapWithConcurrency(
    server.salons,
    LAST_MESSAGE_CONCURRENCY,
    async (salon): Promise<ConversationSummary> => {
      const last = await apiFetch<RawRoomMessage[]>(`/api/messages/rooms/${salon.id}/history?limit=1`).then(
        (messages) => messages[messages.length - 1] ?? null,
        () => null,
      );
      const id = roomId(salon.id);
      return {
        id,
        kind: 'room',
        title: `#${salon.nom}`,
        lastMessage: last
          ? { id: last.id, senderId: last.authorId, content: last.content, createdAt: last.createdAt }
          : null,
        unreadCount: Math.max(0, counts[id] ?? 0),
      };
    },
  );
  return { name: server.nom, channels };
}
