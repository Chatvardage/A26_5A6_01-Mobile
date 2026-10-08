import type { NavigatorScreenParams } from '@react-navigation/native';

import { isUuid, parseConversationId } from '@/types/conversationId';

/** Onglets du parcours principal. */
export type MainTabParamList = {
  DirectMessages: undefined;
  Servers: undefined;
  Search: undefined;
  Preferences: undefined;
};

/** Pile racine : Login seul sans session ; Main, Server, Conversation et NewDirectMessage avec session. */
export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  Server: { serverId: string; title?: string };
  Conversation: { conversationId: string; title?: string };
  NewDirectMessage: undefined;
};

export const Routes = {
  Login: 'Login',
  Register: 'Register',
  Main: 'Main',
  Server: 'Server',
  Conversation: 'Conversation',
  NewDirectMessage: 'NewDirectMessage',
  DirectMessages: 'DirectMessages',
  Servers: 'Servers',
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

export type ServerParams = { serverId: string; title?: string };

/** Valide les paramètres de la route Server avant tout chargement ; `null` si invalides. */
export function parseServerParams(params: unknown): ServerParams | null {
  if (typeof params !== 'object' || params === null) return null;
  const { serverId, title } = params as Record<string, unknown>;
  if (typeof serverId !== 'string' || !isUuid(serverId)) return null;
  return { serverId, title: typeof title === 'string' ? title : undefined };
}
