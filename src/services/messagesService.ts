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

function normalizeMessage(message: RawMessage, senderName?: string): ChatMessage {
  validateMessageDates(message);
  return {
    id: message.id,
    senderId: message.senderId ?? message.authorId ?? '',
    senderName,
    content: message.content,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
  };
}

function dateValue(value: string): number {
  const timestamp = typeof value === 'string' ? Date.parse(value) : NaN;
  if (Number.isNaN(timestamp)) throw new ApiError('invalid_response', 'Date de message invalide');
  return timestamp;
}

function validateMessageDates(message: Pick<ChatMessage, 'createdAt' | 'updatedAt'>): void {
  dateValue(message.createdAt);
  dateValue(message.updatedAt);
}

/** Fusionne par id, conserve la version modifiée la plus récente et trie pour FlatList inversée. */
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  current.forEach(validateMessageDates);
  incoming.forEach(validateMessageDates);
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    const existing = byId.get(message.id);
    if (!existing || dateValue(message.updatedAt) >= dateValue(existing.updatedAt)) {
      byId.set(message.id, {
        ...message,
        senderName: message.senderName ?? existing?.senderName,
      });
    } else if (!existing.senderName && message.senderName) {
      byId.set(message.id, { ...existing, senderName: message.senderName });
    }
  }
  return [...byId.values()].sort(
    (a, b) => dateValue(b.createdAt) - dateValue(a.createdAt) || b.id.localeCompare(a.id),
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
 */
export async function fetchHistory(conversationId: string, limit = 50, cursor?: string): Promise<ChatMessage[]> {
  const ref = routeFor(conversationId);
  const path =
    ref.kind === 'dm'
      ? `/api/messages/history/${ref.targetId}?${query(limit, cursor)}`
      : `/api/messages/rooms/${ref.targetId}/history?${query(limit, cursor)}`;
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
      : await apiFetch<RawMessage>(`/api/messages/rooms/${ref.targetId}`, {
          method: 'POST',
          body: JSON.stringify({ content }),
        });
  return normalizeMessage(response);
}

export async function editMessage(conversationId: string, messageId: string, content: string): Promise<ChatMessage> {
  const ref = routeFor(conversationId);
  const path =
    ref.kind === 'dm'
      ? `/api/messages/${encodeURIComponent(messageId)}`
      : `/api/messages/rooms/${ref.targetId}/${encodeURIComponent(messageId)}`;
  return normalizeMessage(
    await apiFetch<RawMessage>(path, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    }),
  );
}
