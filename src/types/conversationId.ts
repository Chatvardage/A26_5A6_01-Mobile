export type ConversationRef = { kind: 'dm' | 'room'; targetId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: string): boolean => UUID.test(value);

/** `dm:<userId>` pour un message privé, `room:<channelId>` pour un salon. */
export function toConversationId(ref: ConversationRef): string {
  return `${ref.kind}:${ref.targetId}`;
}

/** Valide un identifiant venant d'un paramètre de route ; `null` s'il est invalide. */
export function parseConversationId(value: unknown): ConversationRef | null {
  if (typeof value !== 'string') return null;
  const [kind, targetId, ...rest] = value.split(':');
  if (rest.length > 0) return null;
  if ((kind !== 'dm' && kind !== 'room') || !targetId || !UUID.test(targetId)) return null;
  return { kind, targetId };
}
