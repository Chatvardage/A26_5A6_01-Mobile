import { normalizeQuery } from '@/partage/search';
import { isUuid, parseConversationId } from '@/types/conversationId';
import { ApiError } from './ApiError';
import { apiFetch } from './httpClient';
import { lookupDisplayNames } from './usersService';

export type ConversationMatch = { conversationId: string; count: number; title?: string };
export type ServerMatch = { serverId: string; count: number; title?: string; channels: ConversationMatch[] };
export type SearchSummary = { directMessages: ConversationMatch[]; servers: ServerMatch[] };

function conversations(raw: unknown, kind: 'dm' | 'room'): ConversationMatch[] {
  if (!Array.isArray(raw)) throw new ApiError('invalid_response', 'Invalid search summary');
  return raw.map((entry: { conversationId?: unknown; count?: unknown }) => {
    if (!entry || parseConversationId(entry.conversationId)?.kind !== kind || !Number.isSafeInteger(entry.count) || (entry.count as number) < 0) {
      throw new ApiError('invalid_response', 'Invalid conversation count');
    }
    return { conversationId: entry.conversationId as string, count: entry.count as number };
  }).filter(entry => entry.count > 0);
}

/** Totaux calculés par le service, sans télécharger l'historique pour les compter. */
export async function searchSummary(query: string, signal?: AbortSignal): Promise<SearchSummary> {
  const q = normalizeQuery(query);
  if (!q) throw new ApiError('bad_request', 'Search query too short', 400);
  const raw = await apiFetch<{ directMessages?: unknown; servers?: unknown }>(
    `/api/messages/search/summary?${new URLSearchParams({ q })}`, { signal },
  );
  if (!raw || !Array.isArray(raw.servers)) throw new ApiError('invalid_response', 'Invalid search summary');
  const directMessages = conversations(raw.directMessages, 'dm');
  const servers: ServerMatch[] = raw.servers.map((entry: { serverId?: unknown; count?: unknown; channels?: unknown }) => {
    if (!entry || typeof entry.serverId !== 'string' || !isUuid(entry.serverId) || !Number.isSafeInteger(entry.count) || (entry.count as number) < 0) {
      throw new ApiError('invalid_response', 'Invalid server count');
    }
    return { serverId: entry.serverId as string, count: entry.count as number, channels: conversations(entry.channels, 'room') };
  }).filter(entry => entry.count > 0 && entry.channels.length > 0);
  const [names, metadata] = await Promise.all([
    directMessages.length ? lookupDisplayNames(directMessages.map(entry => parseConversationId(entry.conversationId)!.targetId)).catch(() => ({} as Record<string, string>)) : Promise.resolve({} as Record<string, string>),
    servers.length ? apiFetch<{ id: string; nom: string; salons: { id: string; nom: string }[] }[]>('/api/servers', { signal }).catch(() => []) : Promise.resolve([]),
  ]);
  const serverNames = new Map((Array.isArray(metadata) ? metadata : []).map(server => [server.id, server]));
  return {
    directMessages: directMessages.map(entry => ({ ...entry, title: names[parseConversationId(entry.conversationId)!.targetId] })),
    servers: servers.map(entry => {
      const server = serverNames.get(entry.serverId);
      const channels = new Map(server?.salons?.map(channel => [channel.id, `#${channel.nom}`]));
      return { ...entry, title: server?.nom, channels: entry.channels.map(channel => ({ ...channel, title: channels.get(parseConversationId(channel.conversationId)!.targetId) })) };
    }),
  };
}
