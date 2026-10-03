import { apiFetch } from './httpClient';

const MAX_IDS = 100;

/** Résout `{ id -> pseudo }` ; un identifiant inconnu est simplement absent du résultat. */
export async function lookupPseudos(ids: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids)];
  const result: Record<string, string> = {};
  for (let i = 0; i < unique.length; i += MAX_IDS) {
    const chunk = unique.slice(i, i + MAX_IDS);
    const users = await apiFetch<{ id: string; pseudo: string }[]>(
      `/api/users/lookup?ids=${chunk.join(',')}`,
    );
    for (const u of users) result[u.id] = u.pseudo;
  }
  return result;
}
