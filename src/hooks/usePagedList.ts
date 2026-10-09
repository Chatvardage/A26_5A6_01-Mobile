import { useCallback, useState } from 'react';

/** Taille des pages des listes de serveurs et de messages privés. */
export const LIST_PAGE_SIZE = 15;

/**
 * Affichage par pages d'une liste déjà triée : les `pageSize` premiers éléments, puis `showMore` en ajoute
 * autant. Le nombre affiché est conservé quand la liste se recharge.
 */
export function usePagedList<T>(items: T[], pageSize = LIST_PAGE_SIZE) {
  const [limit, setLimit] = useState(pageSize);
  const showMore = useCallback(() => setLimit(current => current + pageSize), [pageSize]);
  return { visible: items.slice(0, limit), hasMore: items.length > limit, showMore };
}
