import { apiFetch } from './httpClient';
import { mapWithConcurrency } from '@/utils/mapWithConcurrency';
export type PublicProfile = { idUtilisateur: string; alias: string | null; avatar: string | null; actif: boolean };
export async function getPublicProfiles(ids: string[]): Promise<PublicProfile[]> {
  const unique = [...new Set(ids)].filter(Boolean);
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += 100) chunks.push(unique.slice(i, i + 100));
  return (await mapWithConcurrency(chunks, 3, chunk => apiFetch<PublicProfile[]>(`/api/config-utilisateur/publiques?ids=${chunk.map(encodeURIComponent).join(',')}`))).flat();
}
