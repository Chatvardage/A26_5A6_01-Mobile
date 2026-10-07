import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Brouillons de messages (texte non envoyé), un par conversation. Données non sensibles pour la
 * plateforme (pas de jeton) mais privées : effacées à la déconnexion. Une panne de stockage ne doit
 * jamais empêcher d'écrire ou d'envoyer : toutes les opérations avalent leurs erreurs.
 */
const PREFIX = 'chatvardage:draft:';
const keyOf = (conversationId: string) => `${PREFIX}${conversationId}`;

export async function loadDraft(conversationId: string): Promise<string> {
  try {
    return (await AsyncStorage.getItem(keyOf(conversationId))) ?? '';
  } catch {
    return '';
  }
}

export async function saveDraft(conversationId: string, text: string): Promise<void> {
  try {
    if (text) await AsyncStorage.setItem(keyOf(conversationId), text);
    else await AsyncStorage.removeItem(keyOf(conversationId));
  } catch {
    // Brouillon non conservé : le texte reste dans le champ tant que l'écran est ouvert.
  }
}

export async function clearAllDrafts(): Promise<void> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(PREFIX));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch {
    // Rien de plus à faire : la session est déjà effacée.
  }
}
