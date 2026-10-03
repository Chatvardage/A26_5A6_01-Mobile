/**
 * Point d'extension pour les messages non lus (calcul, persistance, temps réel :
 * hors du périmètre navigation/interface). La liste n'affiche que ce qui est fourni ici.
 */
export type UnreadCounts = Record<string, number>;

export interface UnreadSource {
  getCounts(): Promise<UnreadCounts>;
}

export const noUnreadSource: UnreadSource = {
  getCounts: async () => ({}),
};
