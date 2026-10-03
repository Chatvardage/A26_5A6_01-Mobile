import type { NavigatorScreenParams } from '@react-navigation/native';

import { parseConversationId } from '@/types/conversationId';

/** Onglets du parcours principal. */
export type MainTabParamList = {
  Conversations: undefined;
  Search: undefined;
  Preferences: undefined;
};

/** Pile racine : Login seul sans session ; Main puis Conversation avec session. */
export type RootStackParamList = {
  Login: undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  Conversation: { conversationId: string; title?: string };
};

export const Routes = {
  Login: 'Login',
  Main: 'Main',
  Conversation: 'Conversation',
  Conversations: 'Conversations',
  Search: 'Search',
  Preferences: 'Preferences',
} as const;

export type ConversationParams = { conversationId: string; title?: string };

/** Valide les paramètres de la route Conversation avant tout chargement ; `null` si invalides. */
export function parseConversationParams(params: unknown): ConversationParams | null {
  if (typeof params !== 'object' || params === null) return null;
  const { conversationId, title } = params as Record<string, unknown>;
  if (!parseConversationId(conversationId)) return null;
  return {
    conversationId: conversationId as string,
    title: typeof title === 'string' ? title : undefined,
  };
}
