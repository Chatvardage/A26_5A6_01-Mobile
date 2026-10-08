/**
 * Point d'extension pour les messages non lus (calcul, persistance, temps réel :
 * hors du périmètre navigation/interface). La liste n'affiche que ce qui est fourni ici.
 */
export type UnreadCounts = Record<string, number>;

export interface UnreadSource {
  getCounts(): Promise<UnreadCounts>;
}

/** Compteurs de non-lus ; une panne de la source ne doit pas casser la liste, mais elle est journalisée. */
export async function getCountsSafe(unread: UnreadSource): Promise<UnreadCounts> {
  try {
    return await unread.getCounts();
  } catch (error) {
    console.warn('[unread] compteurs de non-lus indisponibles', error);
    return {};
  }
}

export const noUnreadSource: UnreadSource = {
  getCounts: async () => ({}),
};
