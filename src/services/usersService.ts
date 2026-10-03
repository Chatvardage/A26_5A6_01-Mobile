import { mapWithConcurrency } from '@/utils/mapWithConcurrency';

import { apiFetch } from './httpClient';

const MAX_IDS = 100;
const CONCURRENCY = 3;

/** Résout `{ id -> pseudo }` ; un identifiant inconnu est simplement absent du résultat. */
export async function lookupPseudos(ids: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids)];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += MAX_IDS) chunks.push(unique.slice(i, i + MAX_IDS));

  const pages = await mapWithConcurrency(chunks, CONCURRENCY, (chunk) =>
    apiFetch<{ id: string; pseudo: string }[]>(`/api/users/lookup?ids=${chunk.map(encodeURIComponent).join(',')}`),
  );

  const result: Record<string, string> = {};
  for (const users of pages) for (const u of users) result[u.id] = u.pseudo;
  return result;
}
