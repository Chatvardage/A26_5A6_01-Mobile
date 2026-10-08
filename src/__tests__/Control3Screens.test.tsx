import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { DiscoverServersScreen } from '@/screens/DiscoverServersScreen';
import { ServerScreen } from '@/screens/ServerScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { useProfile } from '@/profile/ProfileContext';
import * as rooms from '@/services/rooms.service';
import { useServerChannels } from '@/hooks/useServerChannels';
import { pickAvatar } from '@/adapters/avatar.adapter';
import { ApiError } from '@/services/ApiError';
jest.mock('@/services/rooms.service', () => ({ ...jest.requireActual('@/services/rooms.service'), getServer: jest.fn(), discoverServers: jest.fn(), getInvitations: jest.fn(), joinServer: jest.fn(), leaveServer: jest.fn(), acceptInvitation: jest.fn(), refuseInvitation: jest.fn(), createServer: jest.fn() }));
jest.mock('@/profile/ProfileContext', () => ({ useProfile: jest.fn() }));
jest.mock('@/adapters/avatar.adapter');
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('@/hooks/useConnection', () => ({ useConnection: () => ({ status:'online' }) }));
jest.mock('@/hooks/useRefreshOnFocus'); jest.mock('@/hooks/useRefreshOnServerChange');
jest.mock('@/hooks/useServerChannels');
jest.mock('@/hooks/useNotificationPermission', () => ({ useNotificationPermission: () => ({ permission:'granted' }) }));
jest.mock('@/session/SessionContext', () => ({ useSession: () => ({ user: { id:'me',pseudo:'Alice' },signOut: mockSignOut }) }));
const mockSignOut = jest.fn(async () => undefined); const save = jest.fn(async () => undefined); const presence = jest.fn(async () => undefined);
const id = '11111111-1111-4111-8111-111111111111';
const server: rooms.Server = { id,nom:'Équipe',public:true,parDefaut:false,proprietaireId:'owner',monRole:'membre',nombreMembres:2,salons:[],invitations:[],icone:null };
const navigation = { navigate:jest.fn(),replace:jest.fn(),popTo:jest.fn() };
const discoverProps = { navigation } as unknown as Parameters<typeof DiscoverServersScreen>[0];
const serverProps = { navigation,route:{params:{serverId:id}} } as unknown as Parameters<typeof ServerScreen>[0];
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(rooms.discoverServers).mockResolvedValue({serveurs:[server],total:1,suivant:null}); jest.mocked(rooms.getInvitations).mockResolvedValue([]); jest.mocked(rooms.getServer).mockResolvedValue(server); jest.mocked(rooms.joinServer).mockResolvedValue(server);
  jest.mocked(useServerChannels).mockReturnValue({ state:{ status:'ready',data:{ name:'Équipe',channels:[{ id:`room:${id}`,title:'#général',kind:'room',lastMessage:null,unreadCount:0 }] } },refresh:jest.fn(),retry:jest.fn(),refreshing:false } as never);
  jest.mocked(useProfile).mockReturnValue({ profile:{idUtilisateur:'me',alias:'Ari',avatar:null,theme:'sombre',langue:'fr',statutPresence:'enLigne',modeNotification:'systeme'},loading:false,error:null,reload:jest.fn(),save,presence });
});
it('découvre puis rejoint un serveur et ouvre ses salons après succès', async () => {
  await render(<DiscoverServersScreen {...discoverProps} />);
  await fireEvent.press(await screen.findByRole('button',{name:'Rejoindre · Équipe'}));
  expect(rooms.joinServer).toHaveBeenCalledWith(id); expect(navigation.replace).toHaveBeenCalledWith('Server',{serverId:id,title:'Équipe'});
});
it('garde la découverte et affiche le refus si l’adhésion échoue', async () => {
  jest.mocked(rooms.joinServer).mockRejectedValue(new ApiError('forbidden','x'));
  await render(<DiscoverServersScreen {...discoverProps} />); await fireEvent.press(await screen.findByText('Rejoindre · Équipe'));
  expect(screen.getByRole('alert')).toBeTruthy(); expect(navigation.replace).not.toHaveBeenCalled();
});
it('crée un serveur privé avec un nom valide', async () => {
  jest.mocked(rooms.createServer).mockResolvedValue(server);
  await render(<DiscoverServersScreen {...discoverProps} route={{ key: 'create', name: 'DiscoverServers', params: { mode: 'create' } }} />);
  await fireEvent.changeText(screen.getByLabelText('Nom du serveur'),'Nouveau'); await fireEvent.press(screen.getByRole('button',{name:'Créer un serveur'}));
  expect(rooms.createServer).toHaveBeenCalledWith('Nouveau',false);
});
it('accepte et refuse une invitation', async () => {
  jest.mocked(rooms.getInvitations).mockResolvedValue([{serveur:server,invitePar:'owner',inviteLe:'2026-10-08'}]); jest.mocked(rooms.acceptInvitation).mockResolvedValue(server);
  const view=await render(<DiscoverServersScreen {...discoverProps} />); await fireEvent.press(await screen.findByText('Accepter')); expect(rooms.acceptInvitation).toHaveBeenCalledWith(id);
  await view.unmount(); await render(<DiscoverServersScreen {...discoverProps} />); await fireEvent.press(await screen.findByText('Refuser')); expect(rooms.refuseInvitation).toHaveBeenCalledWith(id);
});
it('affiche les invitations au-dessus des serveurs publics, sans section vide', async () => {
  const view = await render(<DiscoverServersScreen {...discoverProps} />);
  await screen.findByText('Rejoindre · Équipe'); expect(screen.queryByText('Invitations')).toBeNull();
  await view.unmount();
  jest.mocked(rooms.getInvitations).mockResolvedValue([{serveur:{...server,id:'invite',nom:'Invitant'},invitePar:'owner',inviteLe:'2026-10-08'}]);
  await render(<DiscoverServersScreen {...discoverProps} />); await screen.findByText('Invitant');
  const texts = screen.getAllByText(/^(Invitations|Serveurs publics)$/).map(node => node.props.children);
  expect(texts).toEqual(['Invitations','Serveurs publics']);
  expect(screen.getByLabelText('Rechercher un serveur…').props.placeholderTextColor).toBeTruthy();
});
it('propose les serveurs sans recherche, charge la page suivante puis filtre par nom', async () => {
  const autre = {...server,id:'22222222-2222-4222-8222-222222222222',nom:'Autre'};
  jest.mocked(rooms.discoverServers).mockResolvedValueOnce({serveurs:[server],total:2,suivant:20}).mockResolvedValueOnce({serveurs:[server,autre],total:2,suivant:null}).mockResolvedValue({serveurs:[autre],total:1,suivant:null});
  await render(<DiscoverServersScreen {...discoverProps} />);
  await fireEvent.press(await screen.findByRole('button',{name:'Afficher plus de serveurs'}));
  expect(rooms.discoverServers).toHaveBeenLastCalledWith('',20);
  expect(await screen.findByText('Rejoindre · Autre')).toBeTruthy(); expect(screen.getAllByText('Rejoindre · Équipe')).toHaveLength(1);
  expect(screen.queryByRole('button',{name:'Afficher plus de serveurs'})).toBeNull();
  await fireEvent.changeText(screen.getByLabelText('Rechercher un serveur…'),' aut ');
  await waitFor(() => expect(rooms.discoverServers).toHaveBeenLastCalledWith('aut'));
  await waitFor(() => expect(screen.queryByText('Rejoindre · Équipe')).toBeNull());
});
it('signale l’échec de la page suivante sans perdre la première', async () => {
  jest.mocked(rooms.discoverServers).mockResolvedValueOnce({serveurs:[server],total:2,suivant:20}).mockRejectedValueOnce(new ApiError('network','x'));
  await render(<DiscoverServersScreen {...discoverProps} />);
  await fireEvent.press(await screen.findByRole('button',{name:'Afficher plus de serveurs'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de joindre le serveur. Vérifiez votre connexion.');
  expect(screen.getByText('Rejoindre · Équipe')).toBeTruthy(); expect(screen.getByRole('button',{name:'Afficher plus de serveurs'})).toBeTruthy();
});
it('affiche une panne de découverte et réessaie', async () => {
  jest.mocked(rooms.discoverServers).mockRejectedValueOnce(new ApiError('network','x'));
  await render(<DiscoverServersScreen {...discoverProps} />);
  await fireEvent.press(await screen.findByText('Réessayer'));
  expect(await screen.findByText('Rejoindre · Équipe')).toBeTruthy();
});
it('confirme la sortie avant de quitter un serveur et revient à la liste', async () => {
  await render(<ServerScreen {...serverProps} />); await fireEvent.press(await screen.findByText('Quitter le serveur'));
  expect(rooms.leaveServer).not.toHaveBeenCalled();
  const dialog = within(screen.getByTestId('app-dialog'));
  expect(dialog.getByRole('header')).toHaveTextContent('Quitter Équipe ?');
  expect(dialog.getAllByRole('button').map(b => b.props.accessibilityLabel)).toEqual(['Annuler','Quitter le serveur']);
  await fireEvent.press(dialog.getByRole('button',{name:'Quitter le serveur'}));
  expect(rooms.leaveServer).toHaveBeenCalledWith(id); expect(navigation.popTo).toHaveBeenCalledWith('Main',{screen:'Servers'});
});
it.each([{parDefaut:true},{proprietaireId:'me'}])('ne propose pas de quitter Chatvardage ou son serveur (%p)',async patch => {
  jest.mocked(rooms.getServer).mockResolvedValue({...server,...patch}); await render(<ServerScreen {...serverProps} />); await waitFor(() => expect(rooms.getServer).toHaveBeenCalled()); expect(screen.queryByText('Quitter le serveur')).toBeNull();
});
it('enregistre alias, langue, notification et présence',async () => {
  await render(<SettingsScreen />); await fireEvent.changeText(screen.getByLabelText('Alias'),'  Ariane  '); await fireEvent.press(screen.getByRole('button',{name:'Enregistrer'})); expect(save).toHaveBeenCalledWith({alias:'Ariane'});
  for (const [label,patch] of [['Discret : badges uniquement',{modeNotification:'discret'}]] as const) { await fireEvent.press(screen.getByText(label)); expect(save).toHaveBeenCalledWith(patch); }
  await fireEvent.press(screen.getByText('Hors ligne')); expect(presence).toHaveBeenCalledWith('horsLigne'); expect(screen.getByText('Paramètres enregistrés')).toBeTruthy();
});
it('enregistre une photo choisie et tolère l’annulation',async () => {
  jest.mocked(pickAvatar).mockResolvedValueOnce('data:image/jpeg;base64,AAAA').mockResolvedValueOnce(null);
  await render(<SettingsScreen />); await fireEvent.press(screen.getByText('Choisir une photo')); expect(save).toHaveBeenCalledWith({avatar:'data:image/jpeg;base64,AAAA'});
  await fireEvent.press(screen.getByText('Choisir une photo')); expect(save).toHaveBeenCalledTimes(1);
});
it('signale un échec sans annoncer un enregistrement réussi',async () => {
  save.mockRejectedValueOnce(new ApiError('network','x')); await render(<SettingsScreen />); await fireEvent.press(screen.getByRole('button',{name:'Enregistrer'})); expect(screen.getByRole('alert')).toHaveTextContent('Impossible de joindre le serveur. Vérifiez votre connexion.'); expect(screen.queryByText('Paramètres enregistrés')).toBeNull();
});
