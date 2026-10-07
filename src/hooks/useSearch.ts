import { useCallback, useEffect, useRef, useState } from 'react';

import { userMessage } from '@/services/ApiError';
import { normalizeQuery, searchMessages, type SearchResult } from '@/services/searchService';

const DEBOUNCE_MS = 350;

export type SearchStatus = 'idle' | 'tooShort' | 'loading' | 'ready' | 'empty' | 'error';

type Remote =
  | { key: string; status: 'ready'; results: SearchResult[]; nextCursor: string | null }
  | { key: string; status: 'error'; message: string };

function appendUnique(current: SearchResult[], page: SearchResult[]): SearchResult[] {
  const seen = new Set(current.map((r) => r.id));
  return [...current, ...page.filter((r) => !seen.has(r.id))];
}

/**
 * Recherche avec délai de frappe : une saisie plus récente annule la requête en vol et ignore sa
 * réponse. `conversationId` limite la recherche à la conversation affichée.
 */
export function useSearch(conversationId?: string) {
  const [query, setQuery] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [remote, setRemote] = useState<Remote | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const moreRequest = useRef(false);

  const normalized = normalizeQuery(query);
  const key = `${conversationId ?? ''}|${normalized ?? ''}|${attempt}`;

  useEffect(() => {
    if (!normalized) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchMessages({ q: normalized, conversationId, signal: controller.signal }).then(
        (page) => setRemote({ key, status: 'ready', results: page.results, nextCursor: page.nextCursor }),
        (error: unknown) => {
          if (!controller.signal.aborted) setRemote({ key, status: 'error', message: userMessage(error) });
        },
      );
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
      moreRequest.current = false;
      setLoadingMore(false);
      setMoreError(null);
    };
  }, [normalized, conversationId, key]);

  const current = remote?.key === key ? remote : null;
  let status: SearchStatus;
  if (!normalized) status = query.trim() ? 'tooShort' : 'idle';
  else if (!current) status = 'loading';
  else if (current.status === 'error') status = 'error';
  else status = current.results.length ? 'ready' : 'empty';

  const results = current?.status === 'ready' ? current.results : [];
  const nextCursor = current?.status === 'ready' ? current.nextCursor : null;

  const loadMore = useCallback(async () => {
    if (!normalized || !current || current.status !== 'ready' || !current.nextCursor || moreRequest.current) return;
    moreRequest.current = true;
    setLoadingMore(true);
    setMoreError(null);
    const requestKey = current.key;
    try {
      const page = await searchMessages({ q: normalized, conversationId, cursor: current.nextCursor });
      setRemote((prev) =>
        prev?.key === requestKey && prev.status === 'ready'
          ? { ...prev, results: appendUnique(prev.results, page.results), nextCursor: page.nextCursor }
          : prev,
      );
    } catch (error) {
      setMoreError(userMessage(error));
    } finally {
      moreRequest.current = false;
      setLoadingMore(false);
    }
  }, [normalized, conversationId, current]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return {
    query,
    setQuery,
    status,
    /** Texte réellement recherché (sans espaces superflus), pour surligner les résultats. */
    term: normalized ?? '',
    results,
    hasMore: nextCursor !== null,
    errorMessage: current?.status === 'error' ? current.message : null,
    loadingMore,
    moreError,
    loadMore,
    retry,
  };
}
