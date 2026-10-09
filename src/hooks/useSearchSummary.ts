import { useCallback, useEffect, useState } from 'react';
import { normalizeQuery } from '@/partage/search';
import type { SearchStatus } from '@/partage/useSearch';
import { userMessage } from '@/services/ApiError';
import { searchSummary, type SearchSummary } from '@/services/searchSummaryService';

type Remote = { key: string; data: SearchSummary } | { key: string; error: string };

/** Une frappe plus récente invalide les comptes et annule la requête précédente. */
export function useSearchSummary(initialQuery = '') {
  const [query, setQuery] = useState(initialQuery);
  const [attempt, setAttempt] = useState(0);
  const [remote, setRemote] = useState<Remote | null>(null);
  const term = normalizeQuery(query);
  const key = `${term ?? ''}|${attempt}`;
  useEffect(() => {
    if (!term) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void searchSummary(term, controller.signal).then(
        data => { if (!controller.signal.aborted) setRemote({ key, data }); },
        error => { if (!controller.signal.aborted) setRemote({ key, error: userMessage(error) }); },
      );
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [term, key]);
  const current = remote?.key === key ? remote : null;
  const data = current && 'data' in current ? current.data : null;
  const error = current && 'error' in current ? current.error : null;
  const status: SearchStatus = !term ? (query.trim() ? 'tooShort' : 'idle')
    : !current ? 'loading' : error !== null ? 'error'
      : data && (data.directMessages.length || data.servers.length) ? 'ready' : 'empty';
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  return { query, setQuery, term: term ?? '', status, data, error, retry };
}
