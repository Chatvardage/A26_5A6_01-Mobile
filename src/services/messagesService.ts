import type { ChatMessage } from '@/types/conversation';
import { parseConversationId } from '@/types/conversationId';

import { ApiError } from './ApiError';
import { apiFetch } from './httpClient';
import { lookupPseudos } from './usersService';
import { getTranslations } from '@/i18n';

export type RawMessage = {
  id: string;
  senderId?: string;
  authorId?: string;
  recipientId?: string;
  roomId?: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

type MessageDates = { createdAt: string; updatedAt: string; created: number; updated: number };
// Le cache ne retient pas les messages supprimés et se renouvelle si leurs chaînes de dates changent.
const messageDates = new WeakMap<object, MessageDates>();

function normalizeMessage(message: RawMessage, senderName?: string): ChatMessage {
  const normalized = {
    id: message.id,
    senderId: message.senderId ?? message.authorId ?? '',
    senderName,
    content: message.content,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
  };
  getMessageDates(normalized);
  return normalized;
}

function dateValue(value: string): number {
  const timestamp = typeof value === 'string' ? Date.parse(value) : NaN;
  if (Number.isNaN(timestamp)) throw new ApiError('invalid_response', 'Date de message invalide');
  return timestamp;
}

function getMessageDates(message: Pick<ChatMessage, 'createdAt' | 'updatedAt'>): MessageDates {
  const cached = messageDates.get(message);
  if (cached && cached.createdAt === message.createdAt && cached.updatedAt === message.updatedAt) return cached;
  const dates = {
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
    created: dateValue(message.createdAt),
    updated: dateValue(message.updatedAt),
  };
  messageDates.set(message, dates);
  return dates;
}

/** Fusionne par id, conserve la version modifiée la plus récente et trie pour FlatList inversée. */
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  incoming.forEach(getMessageDates);
  const byId = new Map(current.map((message) => {
    getMessageDates(message);
    return [message.id, message] as const;
  }));
  for (const message of incoming) {
    const existing = byId.get(message.id);
    if (!existing || getMessageDates(message).updated >= getMessageDates(existing).updated) {
      const merged = {
        ...message,
        senderName: message.senderName ?? existing?.senderName,
      };
      messageDates.set(merged, getMessageDates(message));
      byId.set(message.id, merged);
    } else if (!existing.senderName && message.senderName) {
      const enriched = { ...existing, senderName: message.senderName };
      messageDates.set(enriched, getMessageDates(existing));
      byId.set(message.id, enriched);
    }
  }
  return [...byId.values()].sort(
    (a, b) => getMessageDates(b).created - getMessageDates(a).created || b.id.localeCompare(a.id),
  );
}

/** Vérifie qu'un événement Socket.IO appartient à la conversation affichée. */
export function belongsTo(conversationId: string, currentUserId: string, rawMessage: unknown): boolean {
  const ref = parseConversationId(conversationId);
  if (!ref || typeof rawMessage !== 'object' || rawMessage === null) return false;
  const message = rawMessage as Partial<RawMessage>;
  if (ref.kind === 'room') return message.roomId === ref.targetId;

  const senderId = message.senderId ?? message.authorId;
  const recipientId = message.recipientId;
  return (
    (senderId === currentUserId && recipientId === ref.targetId) ||
    (senderId === ref.targetId && recipientId === currentUserId)
  );
}

function routeFor(conversationId: string) {
  const ref = parseConversationId(conversationId);
  if (!ref) throw new ApiError('not_found', getTranslations().errors.invalidConversationId);
  return ref;
}

function query(limit: number, cursor?: string): string {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  return params.toString();
}

/**
 * Historique récent d'une conversation, du plus récent au plus ancien (ordre attendu par une
 * FlatList inversée). L'API renvoie la page du plus ancien au plus récent : on l'inverse ici.
 * Avec `cursor`, charge la page précédente (messages plus anciens que ce message).
 */
export async function fetchHistory(conversationId: string, limit = 50, cursor?: string): Promise<ChatMessage[]> {
  const ref = routeFor(conversationId);
  const path =
    ref.kind === 'dm'
      ? `/api/messages/history/${encodeURIComponent(ref.targetId)}?${query(limit, cursor)}`
      : `/api/messages/rooms/${encodeURIComponent(ref.targetId)}/history?${query(limit, cursor)}`;
  const raw = await apiFetch<RawMessage[]>(path);

  // Messages privés : `senderId` ; messages de salon : `authorId` (les deux existent toujours côté API).
  const senderIds = raw.map((m) => m.senderId ?? m.authorId ?? '');
  const names = await lookupPseudos(senderIds.filter(Boolean)).catch((): Record<string, string> => ({}));

  return [...raw]
    .reverse()
    .map((message) => normalizeMessage(message, names[message.senderId ?? message.authorId ?? '']));
}

export async function sendMessage(conversationId: string, content: string): Promise<ChatMessage> {
  const ref = routeFor(conversationId);
  const response =
    ref.kind === 'dm'
      ? await apiFetch<RawMessage>('/api/messages', {
          method: 'POST',
          body: JSON.stringify({ recipientId: ref.targetId, content }),
        })
      : await apiFetch<RawMessage>(`/api/messages/rooms/${encodeURIComponent(ref.targetId)}`, {
          method: 'POST',
          body: JSON.stringify({ content }),
        });
  return normalizeMessage(response);
}

/**
 * Supprime un message. Messages privés : l'expéditeur seulement (403 sinon). Salons : l'auteur, ou un
 * modérateur, le propriétaire ou un administrateur du serveur (le client ne propose la suppression des messages
 * des autres qu'à ceux-ci, d'après `monRole` ; l'API vérifie toujours le droit).
 */
export async function deleteMessage(conversationId: string, messageId: string): Promise<void> {
  const ref = routeFor(conversationId);
  const path =
    ref.kind === 'dm'
      ? `/api/messages/${encodeURIComponent(messageId)}`
      : `/api/messages/rooms/${encodeURIComponent(ref.targetId)}/${encodeURIComponent(messageId)}`;
  await apiFetch<unknown>(path, { method: 'DELETE' });
}

export async function editMessage(conversationId: string, messageId: string, content: string): Promise<ChatMessage> {
  const ref = routeFor(conversationId);
  const path =
    ref.kind === 'dm'
      ? `/api/messages/${encodeURIComponent(messageId)}`
      : `/api/messages/rooms/${encodeURIComponent(ref.targetId)}/${encodeURIComponent(messageId)}`;
  return normalizeMessage(
    await apiFetch<RawMessage>(path, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    }),
  );
}
