import { apiFetch } from '@/services/httpClient';
import { lookupPseudos } from '@/services/usersService';
import * as rooms from '@/services/rooms.service';
jest.mock('@/services/httpClient'); jest.mock('@/services/usersService');
const request = jest.mocked(apiFetch);
const server: rooms.Server = { id: 's', nom: 'Équipe', public: true, parDefaut: false, proprietaireId: 'owner', monRole: 'membre', nombreMembres: 2, salons: [], invitations: [], icone: null };
beforeEach(() => jest.clearAllMocks());
it('encode la découverte et borne la recherche au contrat', async () => {
  const page = { serveurs: [], total: 0, suivant: null }; request.mockResolvedValue(page);
  expect(await rooms.discoverServers('  équipe & amis  ')).toBe(page);
  expect(request).toHaveBeenCalledWith('/api/servers/decouvrir?q=%C3%A9quipe%20%26%20amis&decalage=0&limite=20');
  await rooms.discoverServers('a'.repeat(100)); expect(request).toHaveBeenLastCalledWith('/api/servers/decouvrir?q='+ 'a'.repeat(80) + '&decalage=0&limite=20');
  await rooms.discoverServers('', 40); expect(request).toHaveBeenLastCalledWith('/api/servers/decouvrir?q=&decalage=40&limite=20');
});
it('joint et quitte le serveur via le contrat serveur, sans ancienne route rooms', async () => {
  request.mockResolvedValueOnce(server).mockResolvedValueOnce(undefined);
  expect(await rooms.joinServer('s/a')).toBe(server); await rooms.leaveServer('s/a');
  expect(request.mock.calls).toEqual([['/api/servers/s%2Fa/join', { method: 'POST' }], ['/api/servers/s%2Fa/leave', { method: 'POST' }]]);
});
it.each([rooms.joinServer, rooms.leaveServer, rooms.getServer, rooms.deleteServer])('propage un refus du serveur (%s)', async method => {
  const error = new Error('403'); request.mockRejectedValueOnce(error); await expect(method('s')).rejects.toBe(error);
});
it('lit les invitations, accepte et refuse', async () => {
  request.mockResolvedValue([]); await rooms.getInvitations(); await rooms.acceptInvitation('s'); await rooms.refuseInvitation('s');
  expect(request.mock.calls).toEqual([['/api/servers/invitations/me'], ['/api/servers/s/invitations/accept', { method: 'POST' }], ['/api/servers/s/invitations/refuse', { method: 'POST' }]]);
});
it('crée et modifie les serveurs et salons en préservant les politiques', async () => {
  const room = { nom: 'annonces', acces: 'tous', ecriture: 'moderateurs' } as const;
  await rooms.createServer(' Équipe ', false); await rooms.updateServer('s', { public: true });
  await rooms.createRoom('s', room); await rooms.updateRoom('c/a', { position: 2 }); await rooms.deleteRoom('c/a');
  expect(request.mock.calls).toEqual([
    ['/api/servers', { method: 'POST', body: JSON.stringify({ nom: 'Équipe', public: false }) }],
    ['/api/servers/s', { method: 'PATCH', body: '{"public":true}' }],
    ['/api/servers/s/channels', { method: 'POST', body: JSON.stringify(room) }],
    ['/api/channels/c%2Fa', { method: 'PATCH', body: '{"position":2}' }],
    ['/api/channels/c%2Fa', { method: 'DELETE' }],
  ]);
});
it('charge les membres par pages et résout leurs pseudos', async () => {
  request.mockResolvedValue({ membres: [{ utilisateurId: 'alice', role: 'membre' }, { utilisateurId: 'missing', role: 'membre' }], total: 3, suivant: 50 });
  jest.mocked(lookupPseudos).mockResolvedValue({ alice: 'Alice' });
  const page = await rooms.getMembers('s'); expect(page.membres[0].pseudo).toBe('Alice'); expect(page.membres[1].pseudo).toBeUndefined(); expect(page.suivant).toBe(50);
  await rooms.getMembers('s', 50); expect(request).toHaveBeenLastCalledWith('/api/servers/s/members?decalage=50&limite=50');
});
it('invite, change le rôle et expulse par identifiant encodé', async () => {
  await rooms.inviteMember('s','u'); await rooms.changeMemberRole('s','u/a','moderateur'); await rooms.kickMember('s','u/a');
  expect(request.mock.calls).toEqual([['/api/servers/s/invitations',{ method:'POST', body:'{"utilisateurId":"u"}' }], ['/api/servers/s/members/u%2Fa',{ method:'PATCH',body:'{"role":"moderateur"}' }], ['/api/servers/s/members/u%2Fa',{method:'DELETE'}]]);
});
it.each(['membre','moderateur','proprietaire','admin',null] as const)('propose seulement les actions de rôle %s', role => {
  const value = { ...server, monRole: role };
  expect(rooms.canManageServer(value)).toBe(role === 'proprietaire' || role === 'admin');
  expect(rooms.canManageRooms(value)).toBe(role !== null && role !== 'membre');
  expect(rooms.canLeaveServer(value,'member')).toBe(role !== null);
});
it('interdit de quitter Chatvardage ou son propre serveur', () => {
  expect(rooms.canLeaveServer({ ...server, parDefaut: true },'me')).toBe(false);
  expect(rooms.canLeaveServer(server,'owner')).toBe(false);
});
it('limite les expulsions aux membres de rang inférieur et jamais Chatvardage', () => {
  const member = { utilisateurId: 'u', role: 'membre' as const };
  expect(rooms.canKick(server,member,'me')).toBe(false);
  expect(rooms.canKick({ ...server, monRole:'moderateur' },member,'me')).toBe(true);
  expect(rooms.canKick({ ...server, monRole:'moderateur' },{ ...member,role:'moderateur' },'me')).toBe(false);
  expect(rooms.canKick({ ...server, monRole:'admin',parDefaut:true },member,'me')).toBe(false);
  expect(rooms.canKick({ ...server, monRole:'admin' },member,'u')).toBe(false);
  expect(rooms.canKick({ ...server, monRole:null },member,'me')).toBe(false);
});

it('le proprietaire reste protege lorsque son adhesion indique membre', () => {
  const value = { ...server, monRole: 'moderateur' as const };
  const owner = { utilisateurId: 'owner', role: 'membre' as const };
  expect(rooms.effectiveMemberRole(value, owner, 'me')).toBe('proprietaire');
  expect(rooms.canKick(value, owner, 'me')).toBe(false);
  expect(rooms.effectiveMemberRole(value, {utilisateurId:'me',role:'membre'}, 'me')).toBe('moderateur');
  expect(rooms.effectiveMemberRole(value, {utilisateurId:'other',role:'membre'}, 'me')).toBe('membre');
});
