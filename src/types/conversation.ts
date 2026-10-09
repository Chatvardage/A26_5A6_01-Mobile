export type ConversationKind = 'dm' | 'room';

export type LastMessage = {
  id: string;
  content: string;
  createdAt: string;
  senderId: string;
};

/** Modèle affiché par la liste ; `id` est l'identifiant transmis entre les écrans. */
export type ConversationSummary = {
  id: string;
  kind: ConversationKind;
  title: string;
  subtitle?: string;
  lastMessage: LastMessage | null;
  unreadCount: number;
};

export type ChatMessage = {
  id: string;
  deliveredAt?: string | null;
  senderId: string;
  senderName?: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};
