import { useCallback, useEffect, useRef, useState } from 'react';

import { userMessage } from '@/services/ApiError';
import { discoverServers, type DiscoverableServer } from '@/services/rooms.service';

/** Délai entre la dernière frappe et la recherche (une requête par pause, pas par lettre). */
export const DISCOVER_DEBOUNCE_MS = 300;

type State = { status: 'loading' | 'ready' | 'error'; servers: DiscoverableServer[]; next: number | null; message: string | null };

/**
 * Serveurs publics à rejoindre, par pages : la première page s'affiche sans recherche, le texte filtre par nom
 * (après une courte pause) et `loadMore` ajoute la page suivante. Une réponse arrivée après un nouveau filtre
 * est ignorée.
 */
export function useDiscoverServers(query: string) {
  const [term, setTerm] = useState(query.trim());
  useEffect(() => {
    const timer = setTimeout(() => setTerm(query.trim()), DISCOVER_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);
  const [state, setState] = useState<State>({ status: 'loading', servers: [], next: null, message: null });
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const generation = useRef(0);

  const reload = useCallback(async () => {
    const id = ++generation.current;
    setState(current => ({ ...current, status: 'loading', message: null }));
    setLoadingMore(false); setMoreError(null);
    try {
      const page = await discoverServers(term);
      if (id === generation.current) setState({ status: 'ready', servers: page.serveurs, next: page.suivant, message: null });
    } catch (error) {
      if (id === generation.current) setState({ status: 'error', servers: [], next: null, message: userMessage(error) });
    }
  }, [term]);
  // Nouveau filtre : on repart de la première page.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void reload(); }, [reload]);

  const loadMore = useCallback(async () => {
    if (state.status !== 'ready' || state.next === null || loadingMore) return;
    const id = generation.current;
    setLoadingMore(true); setMoreError(null);
    try {
      const page = await discoverServers(term, state.next);
      if (id !== generation.current) return;
      // Un serveur peut glisser d'une page à l'autre (création, adhésion) : pas de doublon.
      setState(current => {
        const known = new Set(current.servers.map(server => server.id));
        return { ...current, servers: [...current.servers, ...page.serveurs.filter(server => !known.has(server.id))], next: page.suivant };
      });
    } catch (error) {
      if (id === generation.current) setMoreError(userMessage(error));
    } finally {
      if (id === generation.current) setLoadingMore(false);
    }
  }, [state.status, state.next, loadingMore, term]);

  return { ...state, loadingMore, moreError, loadMore, reload };
}
