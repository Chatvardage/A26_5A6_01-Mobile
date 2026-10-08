import type { Translations } from '@/i18n';
export const WELCOME_MESSAGE_ID = '00000000-0000-4000-8000-000000000101';
/** Traduit uniquement le message de bienvenue d'origine, jamais le contenu des utilisateurs. */
export function displayMessage(message: {id: string; content: string; createdAt: string; updatedAt?: string}, strings: Translations): string {
  return message.id === WELCOME_MESSAGE_ID && Date.parse(message.createdAt) === Date.parse(message.updatedAt ?? '')
    ? strings.conversation.welcome : message.content;
}
