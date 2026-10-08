import { userMessage } from '@/services/ApiError';

import { useAsyncResource, type LoadState } from '@/partage/useAsyncResource';

export type { LoadState };

/**
 * Chargement d'une liste de l'application mobile : le noyau `useAsyncResource` avec les messages d'erreur
 * traduits de l'app (`userMessage`). Voir ce fichier pour les cinq états et le rafraîchissement.
 */
export function useLoadable<T>(load: () => Promise<T>, isEmpty: (data: T) => boolean) {
  return useAsyncResource(load, isEmpty, userMessage);
}
