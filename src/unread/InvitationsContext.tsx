import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { useRefreshOnServerChange } from '@/hooks/useRefreshOnServerChange';
import { getInvitations } from '@/services/rooms.service';

export type InvitationsValue = { count: number; refresh: () => Promise<void> };

const InvitationsContext = createContext<InvitationsValue>({ count: 0, refresh: async () => undefined });

/**
 * Nombre d'invitations en attente, partagé par la barre de navigation (onglet Serveurs) et « Découvrir des
 * serveurs ». Relu au démarrage, à chaque `serveur.change` (invitation reçue, acceptée ou refusée) et au
 * retour au premier plan. Un échec garde la dernière valeur : la pastille n'est qu'un indice.
 */
export function InvitationsProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);
  const request = useRef(0);
  const mounted = useRef(true);
  const refresh = useCallback(async () => {
    const id = ++request.current;
    try {
      const invitations = await getInvitations();
      if (mounted.current && id === request.current) setCount(invitations.length);
    } catch {
      // Dernière valeur connue conservée.
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    // Lecture initiale ; setCount n'arrive qu'à la réponse réseau.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => {
      mounted.current = false;
      appState.remove();
    };
  }, [refresh]);
  useRefreshOnServerChange(refresh);
  const value = useMemo(() => ({ count, refresh }), [count, refresh]);
  return <InvitationsContext.Provider value={value}>{children}</InvitationsContext.Provider>;
}

export function useInvitations(): InvitationsValue {
  return useContext(InvitationsContext);
}
