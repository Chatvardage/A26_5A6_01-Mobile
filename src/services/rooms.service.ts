import { apiFetch } from './httpClient';
import { lookupPseudos } from './usersService';
import type { ServerRole } from '@/types/serverRole';

export const DEFAULT_SERVER_ID = '00000000-0000-4000-8000-000000000001';
export const ANNOUNCEMENTS_ID = '00000000-0000-4000-8000-000000000002';
export type ChannelPolicy = 'tous' | 'moderateurs';
export type Room = { id: string; serveurId: string; nom: string; position: number; acces: ChannelPolicy; ecriture: ChannelPolicy; peutEcrire: boolean };
export type Server = { id: string; nom: string; public: boolean; parDefaut: boolean; proprietaireId: string | null; monRole: ServerRole | null; nombreMembres: number; salons: Room[]; invitations: string[]; icone: string | null };
export type Member = { utilisateurId: string; role: ServerRole; pseudo?: string };
export type MembersPage = { membres: Member[]; total: number; suivant: number | null };
export type DiscoverableServer = Pick<Server, 'id' | 'nom' | 'nombreMembres' | 'icone' | 'public' | 'parDefaut'>;
export type Invitation = { serveur: DiscoverableServer; invitePar: string; inviteLe: string };
const url = (id: string) => `/api/servers/${encodeURIComponent(id)}`;
const body = (method: string, data?: unknown): RequestInit => ({ method, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
export const getServer = (id: string) => apiFetch<Server>(url(id));
export type DiscoverPage = { serveurs: DiscoverableServer[]; total: number; suivant: number | null };
/** Serveurs publics à rejoindre, par pages de 20 (`suivant` : décalage de la page suivante, `null` à la fin). */
export const discoverServers = (query: string, offset = 0) => apiFetch<DiscoverPage>(`/api/servers/decouvrir?q=${encodeURIComponent(query.trim().slice(0, 80))}&decalage=${offset}&limite=${DISCOVER_PAGE_SIZE}`);
export const DISCOVER_PAGE_SIZE = 20;
export const getInvitations = () => apiFetch<Invitation[]>('/api/servers/invitations/me');
export const createServer = (nom: string, isPublic: boolean) => apiFetch<Server>('/api/servers', body('POST', { nom: nom.trim(), public: isPublic }));
export const updateServer = (id: string, patch: { nom?: string; public?: boolean; icone?: string }) => apiFetch<Server>(url(id), body('PATCH', patch));
export const deleteServer = (id: string) => apiFetch<void>(url(id), body('DELETE'));
export const joinServer = (id: string) => apiFetch<Server>(`${url(id)}/join`, body('POST'));
export const leaveServer = (id: string) => apiFetch<void>(`${url(id)}/leave`, body('POST'));
export const acceptInvitation = (id: string) => apiFetch<Server>(`${url(id)}/invitations/accept`, body('POST'));
export const refuseInvitation = (id: string) => apiFetch<void>(`${url(id)}/invitations/refuse`, body('POST'));
export const inviteMember = (id: string, utilisateurId: string) => apiFetch(`${url(id)}/invitations`, body('POST', { utilisateurId }));
export const changeMemberRole = (id: string, userId: string, role: 'membre' | 'moderateur') => apiFetch(`${url(id)}/members/${encodeURIComponent(userId)}`, body('PATCH', { role }));
export const kickMember = (id: string, userId: string) => apiFetch(`${url(id)}/members/${encodeURIComponent(userId)}`, body('DELETE'));
export async function getMembers(id: string, offset = 0): Promise<MembersPage> {
  const page = await apiFetch<MembersPage>(`${url(id)}/members?decalage=${offset}&limite=50`);
  const names = await lookupPseudos(page.membres.map(m => m.utilisateurId));
  return { ...page, membres: page.membres.map(m => ({ ...m, pseudo: names[m.utilisateurId] })) };
}
export type RoomInput = { nom: string; acces: ChannelPolicy; ecriture: ChannelPolicy };
export const createRoom = (serverId: string, input: RoomInput) => apiFetch<Room>(`${url(serverId)}/channels`, body('POST', input));
export const updateRoom = (id: string, input: Partial<RoomInput> & { position?: number }) => apiFetch<Room>(`/api/channels/${encodeURIComponent(id)}`, body('PATCH', input));
export const deleteRoom = (id: string) => apiFetch<void>(`/api/channels/${encodeURIComponent(id)}`, body('DELETE'));
/** Les droits UI suivent le rôle fourni par le serveur; l'API reste l'autorité. */
export const canManageServer = (server: Server) => server.monRole === 'admin' || server.monRole === 'proprietaire';
export const canManageRooms = (server: Server) => canManageServer(server) || server.monRole === 'moderateur';
export const canLeaveServer = (server: Server, userId: string) => !server.parDefaut && server.proprietaireId !== userId && server.monRole !== null;
export function canKick(server: Server, member: Member, userId: string): boolean {
  const ranks = { membre: 1, moderateur: 2, proprietaire: 3, admin: 4 };
  return !server.parDefaut && member.utilisateurId !== userId && server.monRole !== null && ranks[server.monRole] > ranks[effectiveMemberRole(server, member, userId)];
}

/** Role effectif affiche : le proprietaire ne doit jamais etre presente comme simple membre. */
export function effectiveMemberRole(server: Server, member: Member, currentUserId: string): ServerRole {
  if (member.utilisateurId === currentUserId && server.monRole) return server.monRole;
  if (member.utilisateurId === server.proprietaireId) return 'proprietaire';
  return member.role;
}
