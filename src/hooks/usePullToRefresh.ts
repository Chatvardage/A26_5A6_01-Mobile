import { useCallback, useState } from 'react';

/**
 * Indicateur du geste « tirer pour rafraîchir » : vrai seulement pendant un rafraîchissement lancé par
 * l'utilisateur. Les rafraîchissements en arrière-plan (`serveur.change`, retour sur l'écran) mettent la liste
 * à jour sans afficher le spinner, qui décalerait la liste vers le bas puis la remonterait.
 */
export function usePullToRefresh(refresh: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);
  return { refreshing, onRefresh };
}
