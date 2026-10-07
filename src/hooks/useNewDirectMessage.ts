import { useCallback, useEffect, useMemo, useState } from 'react';

import { userMessage } from '@/services/ApiError';
import { fetchDmSuggestions, searchUsers, SEARCH_MAX_LENGTH, type UserChoice } from '@/services/usersService';

import { useLoadable, type LoadState } from './useLoadable';

export const SEARCH_DEBOUNCE_MS = 250;

export type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; users: UserChoice[] };

/**
 * Choix du destinataire d'un nouveau message privé : suggestions tant que le champ est vide,
 * recherche par début de pseudo (avec délai de frappe) sinon. Une réponse arrivée après un
 * changement du texte, une nouvelle tentative ou le démontage est ignorée.
 */
export function useNewDirectMessage(currentUserId: string) {
  const loadSuggestions = useCallback(() => fetchDmSuggestions(currentUserId), [currentUserId]);
  const { state: suggestionsState, retry: retrySuggestions } = useLoadable(
    loadSuggestions,
    (data) => data.users.length === 0,
  );
  const [query, setQueryState] = useState('');
  const [attempt, setAttempt] = useState(0);
  // Dernière réponse reçue, associée à la requête (texte + tentative) qui l'a produite.
  const [result, setResult] = useState<{ key: string; state: SearchState } | null>(null);

  const term = query.trim();
  const key = `${attempt}:${term}`;

  useEffect(() => {
    if (!term) return;
    let current = true;
    const timer = setTimeout(() => {
      searchUsers(term, currentUserId).then(
        (users) => {
          if (current) setResult({ key, state: { status: 'ready', users } });
        },
        (error: unknown) => {
          if (current) setResult({ key, state: { status: 'error', message: userMessage(error) } });
        },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [term, key, currentUserId]);

  let search: SearchState = { status: 'idle' };
  if (term) search = result?.key === key ? result.state : { status: 'loading' };
  const setQuery = useCallback((value: string) => setQueryState(value.slice(0, SEARCH_MAX_LENGTH)), []);
  const retrySearch = useCallback(() => setAttempt((value) => value + 1), []);

  const partnerIds = useMemo(
    () => new Set(suggestionsState.status === 'ready' ? suggestionsState.data.partnerIds : []),
    [suggestionsState],
  );
  const suggestions: LoadState<UserChoice[]> =
    suggestionsState.status === 'ready' ? { status: 'ready', data: suggestionsState.data.users } : suggestionsState;

  return {
    query,
    setQuery,
    searching: term.length > 0,
    search,
    retrySearch,
    suggestions,
    retrySuggestions,
    hasConversationWith: (userId: string) => partnerIds.has(userId),
  };
}
