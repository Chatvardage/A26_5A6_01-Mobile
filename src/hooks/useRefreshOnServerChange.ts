import { useEffect } from 'react';

import { useSession } from '@/session/SessionContext';

/**
 * Relance `refresh` quand Room-Service signale un changement de serveur (`serveur.change` : salon ou
 * serveur créé, supprimé, membres modifiés). Avec `serverId`, seuls les changements de ce serveur comptent.
 * Sans cela, une liste ouverte ne verrait un nouveau salon qu'en la rouvrant ou en tirant pour rafraîchir.
 */
export function useRefreshOnServerChange(refresh: () => unknown, serverId?: string) {
  const { subscribe } = useSession().realtime;
  useEffect(() => {
    try {
      return subscribe('serveur.change', (raw) => {
        const changed = typeof raw === 'object' && raw !== null ? (raw as { serveurId?: unknown }).serveurId : undefined;
        if (serverId && changed !== serverId) return;
        void refresh();
      });
    } catch {
      // Canal temps réel non configuré : la liste se rafraîchit toujours au retour sur l'écran.
      return undefined;
    }
  }, [refresh, serverId, subscribe]);
}
