import { useEffect } from 'react';

import { useSession } from '@/session/SessionContext';

/**
 * Relance `refresh` quand un utilisateur change d'alias ou de photo (`profil.changed`) : les listes affichent
 * l'alias dès qu'il est choisi, et de nouveau le pseudo s'il est retiré, sans rouvrir l'écran.
 */
export function useRefreshOnProfileChange(refresh: () => unknown) {
  const { subscribe } = useSession().realtime;
  useEffect(() => {
    try {
      return subscribe('profil.changed', () => void refresh());
    } catch {
      // Canal temps réel non configuré : la liste se rafraîchit toujours au retour sur l'écran.
      return undefined;
    }
  }, [refresh, subscribe]);
}
