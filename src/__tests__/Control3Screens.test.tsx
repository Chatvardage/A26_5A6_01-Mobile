import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
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
let mockConnection = 'online';
jest.mock('@/hooks/useConnection', () => ({ useConnection: () => ({ status: mockConnection }) }));
jest.mock('@/hooks/useRefreshOnFocus'); jest.mock('@/hooks/useRefreshOnServerChange');
jest.mock('@/hooks/useServerChannels');
jest.mock('@/hooks/useNotificationPermission', () => ({ useNotificationPermission: () => ({ permission:'granted' }) }));
let mockUser: { id: string; pseudo: string } | null = { id:'me',pseudo:'Alice' };
jest.mock('@/session/SessionContext', () => ({ useSession: () => ({ user: mockUser,signOut: mockSignOut }) }));
// Props des boutons rendus (rendu inchangé) : deux appuis dans la même image, sans rendu entre eux.
const mockButtons = new Map<string, { onPress: () => void }>();
jest.mock('@/components/ActionButton', () => {
  const actual = jest.requireActual('@/components/ActionButton');
  return { ActionButton: (props: { label: string; onPress: () => void }) => { mockButtons.set(props.label, props); return actual.ActionButton(props); } };
});
const doubleTap = (label: string) => act(async () => { const { onPress } = mockButtons.get(label)!; onPress(); onPress(); });
const mockSignOut = jest.fn(async () => undefined); const save = jest.fn(async () => undefined); const presence = jest.fn(async () => undefined);
const id = '11111111-1111-4111-8111-111111111111';
const server: rooms.Server = { id,nom:'Équipe',public:true,parDefaut:false,proprietaireId:'owner',monRole:'membre',nombreMembres:2,salons:[],invitations:[],icone:null };
const navigation = { navigate:jest.fn(),replace:jest.fn(),popTo:jest.fn() };
const discoverProps = { navigation } as unknown as Parameters<typeof DiscoverServersScreen>[0];
const serverProps = { navigation,route:{params:{serverId:id}} } as unknown as Parameters<typeof ServerScreen>[0];
beforeEach(() => {
  jest.clearAllMocks();
  mockConnection = 'online'; mockUser = { id:'me',pseudo:'Alice' };
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

describe('actions en cours et cas limites', () => {
  it('découverte : un seul appel pour deux appuis rapides sur Rejoindre', async () => {
    let finish!: () => void;
    jest.mocked(rooms.joinServer).mockReturnValueOnce(new Promise(done => { finish = () => done(server); }));
    await render(<DiscoverServersScreen {...discoverProps} />);
    await screen.findByText('Rejoindre · Équipe');
    await doubleTap('Rejoindre · Équipe');
    expect(rooms.joinServer).toHaveBeenCalledTimes(1);
    await act(async () => finish());
  });

  it('découverte : panne des invitations, liste publique vide', async () => {
    jest.mocked(rooms.getInvitations).mockRejectedValueOnce(new ApiError('network', 'x'));
    jest.mocked(rooms.discoverServers).mockResolvedValue({ serveurs: [], total: 0, suivant: null });
    await render(<DiscoverServersScreen {...discoverProps} />);
    expect(await screen.findByText('Aucun serveur public à rejoindre')).toBeTruthy();
    expect(screen.getByText('Impossible de joindre le serveur. Vérifiez votre connexion.')).toBeTruthy();
    jest.mocked(rooms.getInvitations).mockResolvedValueOnce([{ serveur: server, invitePar: 'owner', inviteLe: '2026-10-08' }]);
    await fireEvent.press(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Accepter')).toBeTruthy();
  });

  it('création : affiche le refus et reste sur le formulaire sans serveur renvoyé', async () => {
    const create = { key: 'create', name: 'DiscoverServers', params: { mode: 'create' } } as const;
    jest.mocked(rooms.createServer).mockRejectedValueOnce(new ApiError('forbidden', 'x')).mockResolvedValueOnce(undefined as never);
    await render(<DiscoverServersScreen {...discoverProps} route={create} />);
    await fireEvent.changeText(screen.getByLabelText('Nom du serveur'), 'Nouveau');
    await fireEvent.press(screen.getByRole('button', { name: 'Créer un serveur' }));
    expect(screen.getByRole('alert')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Créer un serveur' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('serveur : membres, gestion, échec de sortie et un seul départ pour deux confirmations', async () => {
    jest.mocked(rooms.getServer).mockResolvedValue({ ...server, monRole: 'moderateur' });
    jest.mocked(rooms.leaveServer).mockRejectedValueOnce(new ApiError('forbidden', 'x'));
    await render(<ServerScreen {...serverProps} />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Gérer' }));
    expect(navigation.navigate).toHaveBeenCalledWith('ManageServer', { serverId: id });
    await fireEvent.press(screen.getByRole('button', { name: 'Membres' }));
    expect(navigation.navigate).toHaveBeenCalledWith('ServerMembers', { serverId: id });
    await fireEvent.press(screen.getByText('Quitter le serveur'));
    await fireEvent.press(within(screen.getByTestId('app-dialog')).getByRole('button', { name: 'Quitter le serveur' }));
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(navigation.popTo).not.toHaveBeenCalled();
    // Départ en cours : un dialogue rouvert entre-temps ne relance pas un second départ.
    let finish!: () => void;
    jest.mocked(rooms.leaveServer).mockReturnValueOnce(new Promise(done => { finish = () => done(undefined as never); }));
    const confirm = () => fireEvent.press(within(screen.getByTestId('app-dialog')).getByRole('button', { name: 'Quitter le serveur' }));
    await fireEvent.press(screen.getByText('Quitter le serveur'));
    await confirm();
    await act(async () => mockButtons.get('Quitter le serveur')!.onPress());
    await confirm();
    await act(async () => finish());
    expect(navigation.popTo).toHaveBeenCalledTimes(1);
    expect(rooms.leaveServer).toHaveBeenCalledTimes(2);
  });

  it('serveur : sans compte connu, la sortie reste proposée à un membre', async () => {
    mockUser = null;
    await render(<ServerScreen {...serverProps} />);
    expect(await screen.findByText('Quitter le serveur')).toBeTruthy();
  });

  it('paramètres : état de connexion, chargement, panne du profil et photo retirée', async () => {
    const reload = jest.fn(async () => undefined);
    jest.mocked(useProfile).mockReturnValue({ profile: { idUtilisateur: 'me', alias: null, avatar: 'data:image/png;base64,AA', theme: 'sombre', langue: 'fr', statutPresence: 'enLigne', modeNotification: 'systeme' }, loading: true, error: 'Profil indisponible', reload, save, presence });
    mockConnection = 'offline';
    const view = await render(<SettingsScreen />);
    expect(screen.getByText(/^État de connexion : Hors ligne$/)).toBeTruthy();
    // Relecture en arrière-plan d'un profil déjà affiché : aucun indicateur qui décalerait la page.
    expect(screen.queryByText('Chargement…')).toBeNull();
    expect(screen.getByLabelText('Photo de profil')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Réessayer' }));
    expect(reload).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Retirer la photo' }));
    expect(save).toHaveBeenCalledWith({ avatar: null });
    mockConnection = 'connecting';
    mockUser = null;
    await view.rerender(<SettingsScreen />);
    expect(screen.getByText(/^État de connexion : Reconnexion en cours…$/)).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('paramètres : deux appuis rapides n’enregistrent qu’une fois', async () => {
    let finish!: () => void;
    save.mockReturnValueOnce(new Promise<undefined>(done => { finish = () => done(undefined); }));
    await render(<SettingsScreen />);
    await doubleTap('Enregistrer');
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => finish());
  });
});

it('paramètres : indique le chargement tant qu’aucun profil n’est affiché', async () => {
  jest.mocked(useProfile).mockReturnValue({ profile: null, loading: true, error: null, reload: jest.fn(), save, presence });
  await render(<SettingsScreen />);
  expect(screen.getByText('Chargement…')).toBeTruthy();
  expect(screen.queryByLabelText('Alias')).toBeNull();
});
