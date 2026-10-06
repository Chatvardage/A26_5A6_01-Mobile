import { mapWithConcurrency } from '@/utils/mapWithConcurrency';

import { apiFetch } from './httpClient';

const MAX_IDS = 100;
const CONCURRENCY = 3;
/** Longueur maximale d'une recherche par pseudo (même borne que le Frontend). */
export const SEARCH_MAX_LENGTH = 20;
const SEARCH_LIMIT = 20;
/** Premiers membres suggérés par serveur : tout le monde est membre du serveur par défaut. */
const MEMBERS_PER_SERVER = 20;

export type UserChoice = { id: string; pseudo: string };
export type DmSuggestions = { users: UserChoice[]; partnerIds: string[] };

type RawServer = { id: string };
type RawMembersPage = { membres: { utilisateurId: string }[] };
type RawDmItem = { otherUserId: string };

const byPseudo = (a: UserChoice, b: UserChoice) => a.pseudo.localeCompare(b.pseudo, undefined, { sensitivity: 'base' });

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

/**
 * Recherche par début de pseudo (`GET /api/users/search`) pour écrire à quelqu'un avec qui on ne
 * partage aucune conversation ni aucun serveur. L'API n'exclut pas l'appelant : on le retire ici.
 */
export async function searchUsers(text: string, currentUserId: string): Promise<UserChoice[]> {
  const q = text.trim().slice(0, SEARCH_MAX_LENGTH);
  if (!q) return [];
  const users = await apiFetch<UserChoice[]>(`/api/users/search?q=${encodeURIComponent(q)}&limit=${SEARCH_LIMIT}`);
  return users.filter((user) => user.id !== currentUserId).map(({ id, pseudo }) => ({ id, pseudo }));
}

/**
 * Suggestions « Nouveau message privé » sans rien taper : interlocuteurs déjà connus et premiers
 * membres de chacun de ses serveurs. Chaque source est facultative ; l'échec n'est signalé que si
 * aucune des deux listes n'a pu être lue.
 */
export async function fetchDmSuggestions(currentUserId: string): Promise<DmSuggestions> {
  const [conversations, servers] = await Promise.allSettled([
    apiFetch<RawDmItem[]>('/api/messages/conversations'),
    apiFetch<RawServer[]>('/api/servers'),
  ]);
  if (conversations.status === 'rejected' && servers.status === 'rejected') throw conversations.reason;

  const partnerIds = conversations.status === 'fulfilled' ? conversations.value.map((item) => item.otherUserId) : [];
  const pages =
    servers.status === 'fulfilled'
      ? await mapWithConcurrency(servers.value, CONCURRENCY, (server) =>
          apiFetch<RawMembersPage>(
            `/api/servers/${encodeURIComponent(server.id)}/members?limite=${MEMBERS_PER_SERVER}`,
          ).catch(() => null),
        )
      : [];

  const ids = new Set(partnerIds);
  for (const page of pages) for (const member of page?.membres ?? []) ids.add(member.utilisateurId);
  ids.delete(currentUserId);

  const names = await lookupPseudos([...ids]);
  const users = [...ids]
    .filter((id) => names[id])
    .map((id) => ({ id, pseudo: names[id] }))
    .sort(byPseudo);
  return { users, partnerIds };
}
