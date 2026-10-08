import { useSearchResults, type SearchStatus } from '@/partage/useSearch';
import { userMessage } from '@/services/ApiError';
import { searchMessages } from '@/services/searchService';

export type { SearchStatus };

const dependencies = { search: searchMessages, describeError: userMessage };

/** Recherche de l'application mobile : le hook commun (`src/partage/useSearch.ts`) branché sur l'API et les textes de l'app. */
export function useSearch(conversationId?: string) {
  return useSearchResults(dependencies, conversationId);
}
