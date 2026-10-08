import { normalizeQuery, type SearchInput, type SearchPage, type SearchResult } from '@/partage/search';
import { isUuid, parseConversationId } from '@/types/conversationId';

import { ApiError } from './ApiError';
import { apiFetch } from './httpClient';
import { lookupPseudos } from './usersService';

export { MAX_QUERY_LENGTH, MIN_QUERY_LENGTH, normalizeQuery } from '@/partage/search';
export type { SearchPage, SearchResult } from '@/partage/search';

const DEFAULT_LIMIT = 20;

type RawEntry = {
  conversationId?: unknown;
  kind?: unknown;
  message?: { id?: unknown; senderId?: unknown; authorId?: unknown; content?: unknown; createdAt?: unknown; updatedAt?: unknown };
};

type Base = Omit<SearchResult, 'senderName' | 'conversationTitle' | 'serverName'>;

function parseEntry(entry: RawEntry): Base | null {
  const ref = parseConversationId(entry.conversationId);
  const m = entry.message;
  if (!ref || !m || typeof m.id !== 'string' || typeof m.content !== 'string' || typeof m.createdAt !== 'string') return null;
  const senderId = ref.kind === 'dm' ? m.senderId : m.authorId;
  if (typeof senderId !== 'string') return null;
  return {
    id: m.id,
    conversationId: entry.conversationId as string,
    kind: ref.kind,
    senderId,
    content: m.content,
    createdAt: m.createdAt,
    updatedAt: typeof m.updatedAt === 'string' ? m.updatedAt : m.createdAt,
  };
}

/** Auteur du message de bienvenue : pas un compte, donc sans pseudo ; l'interface le nomme (voir `SearchResultItem`). */
export const SYSTEM_AUTHOR = 'system';

type ChannelInfo = { channel: string; server?: string };

/** `{ identifiant du salon -> { #nom, serveur } }` d'après la liste des serveurs ; vide si elle est indisponible. */
async function channelNames(): Promise<Record<string, ChannelInfo>> {
  try {
    const servers = await apiFetch<{ nom?: string; salons?: { id: string; nom: string }[] }[]>('/api/servers');
    const names: Record<string, ChannelInfo> = {};
    if (Array.isArray(servers)) {
      for (const server of servers) {
        for (const salon of server.salons ?? []) names[salon.id] = { channel: `#${salon.nom}`, server: server.nom };
      }
    }
    return names;
  } catch {
    return {};
  }
}

/**
 * Recherche de texte dans les conversations accessibles (l'API filtre les droits). Les résultats
 * viennent du plus récent au plus ancien ; `nextCursor` pagine sans doublon. Les erreurs sont des `ApiError`
 * au message technique : le texte affiché est choisi par l'appelant (`userMessage`), jamais par le service.
 */
export async function searchMessages(input: SearchInput): Promise<SearchPage> {
  const q = normalizeQuery(input.q);
  if (!q) throw new ApiError('bad_request', 'Search query too short', 400);
  if (input.conversationId && !parseConversationId(input.conversationId)) {
    throw new ApiError('not_found', 'Invalid conversation id');
  }

  const params = new URLSearchParams({ q, limit: String(input.limit ?? DEFAULT_LIMIT) });
  if (input.cursor) params.set('cursor', input.cursor);
  if (input.conversationId) params.set('conversationId', input.conversationId);
  const raw = await apiFetch<{ results?: RawEntry[]; nextCursor?: unknown }>(
    `/api/messages/search?${params.toString()}`,
    { signal: input.signal },
  );
  if (!raw || !Array.isArray(raw.results)) {
    throw new ApiError('invalid_response', 'Invalid search response');
  }

  const entries = raw.results.map(parseEntry).filter((entry): entry is Base => entry !== null);
  // L'auteur du message de bienvenue est `system` (pas un compte) : un identifiant invalide ferait
  // échouer toute la résolution des pseudos.
  const ids = entries
    .flatMap((e) => [e.senderId, ...(e.kind === 'dm' ? [parseConversationId(e.conversationId)!.targetId] : [])])
    .filter(isUuid);
  const [names, channels] = await Promise.all([
    ids.length ? lookupPseudos(ids).catch(() => ({}) as Record<string, string>) : Promise.resolve({} as Record<string, string>),
    entries.some((e) => e.kind === 'room') ? channelNames() : Promise.resolve({} as Record<string, ChannelInfo>),
  ]);

  const results = entries.map((e): SearchResult => {
    const targetId = parseConversationId(e.conversationId)!.targetId;
    return {
      ...e,
      senderName: names[e.senderId],
      conversationTitle: e.kind === 'dm' ? names[targetId] : channels[targetId]?.channel,
      serverName: e.kind === 'room' ? channels[targetId]?.server : undefined,
    };
  });
  return { results, nextCursor: typeof raw.nextCursor === 'string' && raw.nextCursor ? raw.nextCursor : null };
}
