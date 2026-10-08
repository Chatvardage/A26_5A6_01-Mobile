import { apiFetch } from './httpClient';
import { ApiError } from './ApiError';
import { parseConversationId } from '@/types/conversationId';
export type Reader = { userId: string; lastReadAt: string | null; lastReadMessageId: string | null };
export function confirmDelivery(messageId: string): Promise<unknown> {
  return apiFetch(`/api/messages/${encodeURIComponent(messageId)}/delivered`, { method: 'PUT' });
}
export async function getReaders(conversationId: string): Promise<Reader[]> {
  const ref = parseConversationId(conversationId);
  if (!ref) throw new ApiError('not_found', 'Invalid conversation');
  return ref.kind === 'dm'
    ? [await apiFetch<Reader>(`/api/messages/conversations/${ref.targetId}/read-state`)]
    : (await apiFetch<{ lecteurs: Reader[] }>(`/api/messages/rooms/${ref.targetId}/read-states`)).lecteurs;
}
export function hasRead(reader: Reader, message: { id: string; createdAt: string }): boolean {
  const read = reader.lastReadAt ? Date.parse(reader.lastReadAt) : NaN;
  const sent = Date.parse(message.createdAt);
  return read > sent || (read === sent && (!reader.lastReadMessageId || reader.lastReadMessageId >= message.id));
}
