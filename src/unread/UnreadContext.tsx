import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { getPermission, setAppBadge } from '@/adapters/notifications.adapter';
import { fetchUnreadCounts } from '@/services/unreadService';
import type { UnreadCounts } from '@/services/unreadSource';
import { useSession } from '@/session/SessionContext';

export type UnreadValue = {
  counts: UnreadCounts;
  /** Vrai une fois les compteurs lus sur le serveur : les listes se fient alors à `counts` plutôt qu'à leur chargement initial. */
  loaded: boolean;
  /** Somme des messages privés non lus / des salons non lus : badges des onglets. */
  dmTotal: number;
  roomTotal: number;
  refresh: () => Promise<void>;
  increment: (conversationId: string) => void;
  clear: (conversationId: string) => void;
};

const EMPTY: UnreadValue = {
  counts: {},
  loaded: false,
  dmTotal: 0,
  roomTotal: 0,
  refresh: async () => undefined,
  increment: () => undefined,
  clear: () => undefined,
};

const UnreadContext = createContext<UnreadValue>(EMPTY);

const sum = (counts: UnreadCounts, prefix: string) =>
  Object.entries(counts).reduce((total, [id, n]) => (id.startsWith(prefix) ? total + n : total), 0);

/**
 * Compteurs de non-lus de l'application. La vérité est l'état de lecture en base : on le recharge au
 * démarrage, à chaque (re)connexion du canal temps réel et au retour au premier plan, ce qui rattrape
 * les messages reçus pendant une coupure. Entre deux rechargements, les événements temps réel
 * incrémentent localement. Le badge reste donc utilisable sans permission de notification.
 */
export function UnreadProvider({ children }: { children: ReactNode }) {
  const { onReady } = useSession().realtime;
  const [counts, setCounts] = useState<UnreadCounts>({});
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setCounts(await fetchUnreadCounts());
      setLoaded(true);
    } catch {
      // Panne réseau ou serveur : on garde les compteurs affichés, le prochain rechargement corrigera.
    }
  }, []);

  const increment = useCallback((conversationId: string) => {
    setCounts((current) => ({ ...current, [conversationId]: (current[conversationId] ?? 0) + 1 }));
  }, []);

  const clear = useCallback((conversationId: string) => {
    setCounts((current) => {
      if (!current[conversationId]) return current;
      const { [conversationId]: _removed, ...rest } = current;
      return rest;
    });
  }, []);

  useEffect(() => {
    // Chargement initial depuis le serveur (système externe) : le setState arrive après la réponse.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    let offReady: () => void = () => undefined;
    try {
      offReady = onReady(() => void refresh());
    } catch {
      // Session absente : le provider n'est monté que connecté, mais on ne casse jamais l'affichage.
    }
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => {
      offReady();
      appState.remove();
    };
  }, [refresh, onReady]);

  const dmTotal = sum(counts, 'dm:');
  const roomTotal = sum(counts, 'room:');

  // Badge de l'icône : bonus quand la permission est accordée ; sinon le badge dans l'application suffit.
  // La permission n'est relue que tant qu'elle n'est pas accordée (évite un appel natif par message reçu).
  const badgeGranted = useRef(false);
  useEffect(() => {
    if (badgeGranted.current) {
      void setAppBadge(dmTotal + roomTotal);
      return;
    }
    void getPermission().then((permission) => {
      if (permission !== 'granted') return;
      badgeGranted.current = true;
      void setAppBadge(dmTotal + roomTotal);
    });
  }, [dmTotal, roomTotal]);

  const value = useMemo<UnreadValue>(
    () => ({ counts, loaded, dmTotal, roomTotal, refresh, increment, clear }),
    [counts, loaded, dmTotal, roomTotal, refresh, increment, clear],
  );
  return <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>;
}

export function useUnread(): UnreadValue {
  return useContext(UnreadContext);
}
