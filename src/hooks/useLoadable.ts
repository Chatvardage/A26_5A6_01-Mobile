import { useCallback, useEffect, useRef, useState } from 'react';

import { userMessage } from '@/services/ApiError';

export type LoadState<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty' }
  | { status: 'ready'; data: T };

/**
 * Chargement d'une ressource avec états loading / empty / error / ready, nouvelle tentative et
 * rafraîchissement. `load` doit être stable (useCallback) : un changement relance le chargement.
 */
export function useLoadable<T>(load: () => Promise<T>, isEmpty: (data: T) => boolean) {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const requestId = useRef(0);
  const isEmptyRef = useRef(isEmpty);
  isEmptyRef.current = isEmpty;

  const run = useCallback(
    async (mode: 'initial' | 'refresh') => {
      const id = ++requestId.current;
      if (mode === 'initial') setState({ status: 'loading' });
      else setRefreshing(true);
      try {
        const data = await load();
        if (id !== requestId.current) return;
        setState(isEmptyRef.current(data) ? { status: 'empty' } : { status: 'ready', data });
      } catch (error) {
        if (id !== requestId.current) return;
        // Un échec de rafraîchissement ne vide pas ce qui est déjà affiché.
        setState((prev) =>
          mode === 'refresh' && prev.status === 'ready' ? prev : { status: 'error', message: userMessage(error) },
        );
      } finally {
        if (id === requestId.current) setRefreshing(false);
      }
    },
    [load],
  );

  useEffect(() => {
    void run('initial');
    return () => {
      // Compteur de requêtes (pas un nœud React) : on invalide la réponse en vol.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      requestId.current++;
    };
  }, [run]);

  const retry = useCallback(() => run('initial'), [run]);
  const refresh = useCallback(() => run('refresh'), [run]);
  return { state, refreshing, retry, refresh };
}
