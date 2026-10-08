import { useCallback, useEffect, useRef, useState } from 'react';

import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { useRefreshOnServerChange } from '@/hooks/useRefreshOnServerChange';
import { getInvitations } from '@/services/rooms.service';

/**
 * Nombre d'invitations en attente (pastille de « Découvrir des serveurs »). Relu au retour sur l'écran et à
 * chaque `serveur.change` (invitation reçue, acceptée ou refusée). Un échec garde la dernière valeur connue :
 * la pastille n'est qu'un indice, la liste des invitations reste la référence.
 */
export function usePendingInvitations(): number {
  const [count, setCount] = useState(0);
  const request = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++request.current;
    try {
      const invitations = await getInvitations();
      if (id === request.current) setCount(invitations.length);
    } catch {
      // Dernière valeur connue conservée.
    }
  }, []);
  useEffect(() => {
    void refresh();
    return () => {
      request.current++;
    };
  }, [refresh]);
  useRefreshOnFocus(refresh);
  useRefreshOnServerChange(refresh);
  return count;
}
