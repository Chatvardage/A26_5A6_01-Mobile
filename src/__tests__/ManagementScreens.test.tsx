import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { ManageServerScreen } from '@/screens/ManageServerScreen';
import { ServerMembersScreen } from '@/screens/ServerMembersScreen';
import * as rooms from '@/services/rooms.service';
import { searchUsers } from '@/services/usersService';
import { ApiError } from '@/services/ApiError';
jest.mock('@/services/rooms.service',()=>({ ...jest.requireActual('@/services/rooms.service'),getServer:jest.fn(),updateServer:jest.fn(),deleteServer:jest.fn(),createRoom:jest.fn(),updateRoom:jest.fn(),deleteRoom:jest.fn(),getMembers:jest.fn(),inviteMember:jest.fn(),changeMemberRole:jest.fn(),kickMember:jest.fn() }));
jest.mock('@/hooks/usePublicProfiles', () => ({ usePublicProfiles: () => ({}) }));
jest.mock('@/services/usersService');jest.mock('@/hooks/useRefreshOnServerChange');jest.mock('@/hooks/useRefreshOnFocus');
jest.mock('@/session/SessionContext',()=>({useSession:()=>({user:{id:'me'}})}));
const id='11111111-1111-4111-8111-111111111111';
const room:rooms.Room={id:'channel',serveurId:id,nom:'général',position:0,acces:'tous',ecriture:'tous',peutEcrire:true};
const server:rooms.Server={id,nom:'Équipe',public:false,parDefaut:false,proprietaireId:'me',monRole:'proprietaire',nombreMembres:3,salons:[room,{...room,id:'second',nom:'annonces',position:1}],invitations:[],icone:null};
const navigation={navigate:jest.fn(),popTo:jest.fn()};
// Dialogue de confirmation au style de l'app (Annuler à gauche, action à droite).
const dialog=()=>within(screen.getByTestId('app-dialog'));
const confirmWith=(label:string)=>fireEvent.press(dialog().getByRole('button',{name:label}));
const manage={navigation,route:{params:{serverId:id}}} as unknown as Parameters<typeof ManageServerScreen>[0];
const members={navigation,route:{params:{serverId:id}}} as unknown as Parameters<typeof ServerMembersScreen>[0];
beforeEach(()=>{jest.clearAllMocks();jest.mocked(rooms.getServer).mockResolvedValue(server);jest.mocked(rooms.getMembers).mockResolvedValue({membres:[{utilisateurId:'me',role:'proprietaire',pseudo:'Moi'},{utilisateurId:'alice',role:'membre',pseudo:'Alice'}],total:2,suivant:null});});
it.each([ManageServerScreen,ServerMembersScreen])('rejette une route invalide avant tout chargement',async Screen=>{await render(<Screen {...({...manage,route:{params:{serverId:'invalid'}}} as Parameters<typeof ManageServerScreen>[0] & Parameters<typeof ServerMembersScreen>[0])} />);expect(screen.getByText('Ce serveur est introuvable.')).toBeTruthy();expect(rooms.getServer).not.toHaveBeenCalled();});
it('affiche une panne puis permet de recharger la gestion',async()=>{jest.mocked(rooms.getServer).mockRejectedValueOnce(new ApiError('network','x'));await render(<ManageServerScreen {...manage} />);await fireEvent.press(await screen.findByText('Réessayer'));expect(await screen.findByText('Équipe')).toBeTruthy();});
it('refuse la gestion pour un membre simple',async()=>{jest.mocked(rooms.getServer).mockResolvedValue({...server,monRole:'membre'});await render(<ManageServerScreen {...manage} />);expect(await screen.findByText('Vous n’avez pas accès à cette conversation.')).toBeTruthy();});
it('modifie nom et visibilité puis crée un salon réservé aux modérateurs',async()=>{await render(<ManageServerScreen {...manage} />);await screen.findByText('Équipe');await fireEvent.changeText(screen.getByLabelText('Nom du serveur'),'Nouvelle équipe');await fireEvent(screen.getByLabelText('Serveur public'), 'valueChange', true);await fireEvent.press(screen.getByText('Enregistrer'));expect(rooms.updateServer).toHaveBeenCalledWith(id,{nom:'Nouvelle équipe',public:true});await fireEvent.changeText(screen.getByLabelText('Nom du salon'),'modération');await fireEvent.press(screen.getAllByRole('button', {name: /Modérateurs/})[0]);await fireEvent.press(screen.getAllByRole('button', {name: /Modérateurs/})[1]);await fireEvent.press(screen.getByRole('button',{name:'Créer un salon'}));expect(rooms.createRoom).toHaveBeenCalledWith(id,{nom:'modération',acces:'moderateurs',ecriture:'moderateurs'});});
it('ouvre la modification d’un salon sur un écran séparé',async()=>{await render(<ManageServerScreen {...manage} />);await fireEvent.press(await screen.findByText('Modifier · #général'));expect(navigation.navigate).toHaveBeenCalledWith('EditRoom',{serverId:id,roomId:'channel'});expect(rooms.updateRoom).not.toHaveBeenCalled();expect(screen.getByLabelText('Nom du salon')).toHaveDisplayValue('');});
it('confirme les suppressions de salon et serveur',async()=>{await render(<ManageServerScreen {...manage} />);await fireEvent.press(await screen.findByText('Supprimer · #général'));expect(dialog().getByRole('header')).toHaveTextContent('Supprimer le salon #général ?');expect(dialog().getAllByRole('button').map(b=>b.props.accessibilityLabel)).toEqual(['Annuler','Supprimer']);expect(rooms.deleteRoom).not.toHaveBeenCalled();await confirmWith('Supprimer');expect(rooms.deleteRoom).toHaveBeenCalledWith('channel');await fireEvent.press(screen.getByText('Supprimer · Équipe'));expect(dialog().getByRole('header')).toHaveTextContent('Supprimer le serveur Équipe ?');await confirmWith('Supprimer');expect(rooms.deleteServer).toHaveBeenCalledWith(id);expect(navigation.popTo).toHaveBeenCalledWith('Main',{screen:'Servers'});});
it('annuler une suppression ferme le dialogue sans rien supprimer',async()=>{await render(<ManageServerScreen {...manage} />);await fireEvent.press(await screen.findByText('Supprimer · #général'));await confirmWith('Annuler');expect(screen.queryByTestId('app-dialog')).toBeNull();expect(rooms.deleteRoom).not.toHaveBeenCalled();});
it('vide le formulaire après la création d’un salon',async()=>{jest.mocked(rooms.createRoom).mockResolvedValue(room);await render(<ManageServerScreen {...manage} />);await fireEvent.changeText(await screen.findByLabelText('Nom du salon'),'nouveau');await fireEvent.press(screen.getByRole('button',{name:'Créer un salon'}));expect(rooms.createRoom).toHaveBeenCalledWith(id,{nom:'nouveau',acces:'tous',ecriture:'tous'});expect(screen.getByLabelText('Nom du salon')).toHaveDisplayValue('');});
it('préserve les actions de serveur par défaut et interdit de supprimer le dernier salon',async()=>{jest.mocked(rooms.getServer).mockResolvedValue({...server,parDefaut:true,public:true,salons:[room]});await render(<ManageServerScreen {...manage} />);await screen.findByText('Équipe');expect(screen.queryByText('Supprimer · Équipe')).toBeNull();expect(screen.getByRole('button',{name:'Supprimer · #général'})).toBeDisabled();await fireEvent.press(screen.getByText('Enregistrer'));expect(rooms.updateServer).toHaveBeenCalledWith(id,{nom:'Équipe',public:true});});
it('un modérateur ne voit que la gestion des salons',async()=>{jest.mocked(rooms.getServer).mockResolvedValue({...server,monRole:'moderateur'});await render(<ManageServerScreen {...manage} />);await screen.findByRole('button', {name:'Créer un salon'});expect(screen.queryByLabelText('Nom du serveur')).toBeNull();});
it('affiche un échec d’action et conserve le formulaire',async()=>{jest.mocked(rooms.createRoom).mockRejectedValueOnce(new ApiError('forbidden','x'));await render(<ManageServerScreen {...manage} />);await fireEvent.changeText(await screen.findByLabelText('Nom du salon'),'test');await fireEvent.press(screen.getByRole('button',{name:'Créer un salon'}));expect(screen.getByRole('alert')).toBeTruthy();expect(screen.getByLabelText('Nom du salon')).toHaveDisplayValue('test');});
it('ouvre un message privé depuis les membres, puis promeut et retire le rôle',async()=>{await render(<ServerMembersScreen {...members} />);await fireEvent.press(await screen.findByText('Message privé · Alice'));expect(navigation.navigate).toHaveBeenCalledWith('Conversation',{conversationId:'dm:alice',title:'Alice'});await fireEvent.press(screen.getByText('Nommer modérateur'));expect(rooms.changeMemberRole).toHaveBeenCalledWith(id,'alice','moderateur');jest.mocked(rooms.getMembers).mockResolvedValue({membres:[{utilisateurId:'alice',role:'moderateur',pseudo:'Alice'}],total:1,suivant:null});await fireEvent.press(screen.getByText('Nommer modérateur'));await fireEvent.press(await screen.findByText('Retirer la modération'));expect(rooms.changeMemberRole).toHaveBeenLastCalledWith(id,'alice','membre');});
it('expulse après confirmation puis cherche et invite un utilisateur',async()=>{jest.mocked(searchUsers).mockResolvedValue([{id:'bob',pseudo:'Bob'}]);await render(<ServerMembersScreen {...members} />);await fireEvent.press(await screen.findByText('Expulser'));expect(dialog().getByRole('header')).toHaveTextContent('Expulser Alice ?');await confirmWith('Expulser');expect(rooms.kickMember).toHaveBeenCalledWith(id,'alice');await fireEvent.changeText(screen.getByLabelText('Rechercher'),'bo');await fireEvent.press(screen.getByRole('button',{name:'Rechercher'}));await fireEvent.press(await screen.findByText('Inviter un utilisateur · Bob'));expect(rooms.inviteMember).toHaveBeenCalledWith(id,'bob');});
it('charge la suite des membres sans doublons',async()=>{jest.mocked(rooms.getMembers).mockResolvedValueOnce({membres:[{utilisateurId:'alice',role:'membre',pseudo:'Alice'}],total:3,suivant:50}).mockResolvedValueOnce({membres:[{utilisateurId:'alice',role:'membre',pseudo:'Alice'},{utilisateurId:'bob',role:'membre',pseudo:'Bob'}],total:3,suivant:null});await render(<ServerMembersScreen {...members} />);await fireEvent.press(await screen.findByText('Charger la suite'));expect(rooms.getMembers).toHaveBeenLastCalledWith(id,50);expect(screen.getAllByText('Alice')).toHaveLength(1);expect(screen.getByText('Bob')).toBeTruthy();expect(screen.queryByText('Charger la suite')).toBeNull();});
it('un membre simple n’a pas les actions de gestion ou d’invitation',async()=>{jest.mocked(rooms.getServer).mockResolvedValue({...server,monRole:'membre'});await render(<ServerMembersScreen {...members} />);await screen.findByText('Alice');expect(screen.queryByText('Expulser')).toBeNull();expect(screen.queryByText('Nommer modérateur')).toBeNull();expect(screen.queryByLabelText('Rechercher')).toBeNull();});
it('affiche une panne de liste et un refus d’invitation',async()=>{jest.mocked(rooms.getMembers).mockRejectedValueOnce(new ApiError('network','x'));jest.mocked(searchUsers).mockResolvedValue([{id:'bob',pseudo:'Bob'}]);jest.mocked(rooms.inviteMember).mockRejectedValueOnce(new ApiError('conflict','x'));await render(<ServerMembersScreen {...members} />);await fireEvent.press(await screen.findByText('Réessayer'));await fireEvent.changeText(await screen.findByLabelText('Rechercher'),'bo');await fireEvent.press(screen.getByRole('button',{name:'Rechercher'}));await fireEvent.press(await screen.findByText('Inviter un utilisateur · Bob'));expect(screen.getByRole('alert')).toBeTruthy();});

it('annuler une expulsion ne modifie pas le serveur', async () => {
  await render(<ServerMembersScreen {...members} />);
  await fireEvent.press(await screen.findByText('Expulser'));
  await confirmWith('Annuler');
  expect(screen.queryByTestId('app-dialog')).toBeNull();
  expect(rooms.kickMember).not.toHaveBeenCalled();
});
it('un refus d expulsion affiche une erreur et conserve le membre', async () => {
  jest.mocked(rooms.kickMember).mockRejectedValueOnce(new ApiError('forbidden', 'x'));
  await render(<ServerMembersScreen {...members} />);
  await fireEvent.press(await screen.findByText('Expulser'));
  await confirmWith('Expulser');
  expect(screen.getByRole('alert')).toBeTruthy();
  expect(screen.getByText('Alice')).toBeTruthy();
});
it('apres expulsion la liste refl ete les membres retournes par le serveur', async () => {
  await render(<ServerMembersScreen {...members} />);
  jest.mocked(rooms.getMembers).mockResolvedValue({ membres: [{utilisateurId:'me',role:'membre',pseudo:'Moi'}],total:1,suivant:null });
  await fireEvent.press(await screen.findByText('Expulser'));
  await confirmWith('Expulser');
  expect(screen.queryByText('Alice')).toBeNull();
  expect(screen.getByText('Propriétaire')).toBeTruthy();
});

it('centre la visibilite et colore les indications des champs', async () => {
  await render(<ManageServerScreen {...manage} />);
  await screen.findByLabelText('Nom du serveur');
  expect(screen.getByTestId('server-visibility')).toHaveStyle({alignItems:'center',justifyContent:'space-between'});
  for (const label of ['Nom du serveur','Nom du salon']) {
    expect(screen.getByLabelText(label).props.placeholderTextColor).toBeTruthy();
  }
});

it('un admin expulse le propriétaire en nommant un autre membre propriétaire', async () => {
  jest.mocked(rooms.getServer).mockResolvedValue({ ...server, proprietaireId: 'owner', monRole: 'admin' });
  jest.mocked(rooms.getMembers).mockResolvedValue({ membres: [{ utilisateurId: 'owner', role: 'membre', pseudo: 'Lili' }, { utilisateurId: 'alice', role: 'membre', pseudo: 'Alice' }], total: 2, suivant: null });
  await render(<ServerMembersScreen {...members} />);
  await fireEvent.press((await screen.findAllByRole('button', { name: 'Expulser' }))[0]);
  expect(screen.queryByTestId('app-dialog')).toBeNull();
  expect(screen.getByText('Expulser Lili, propriétaire du serveur')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Nommer propriétaire · Lili' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Expulser' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Nommer propriétaire · Alice' }));
  expect(dialog().getByRole('header')).toHaveTextContent('Expulser Lili et nommer Alice propriétaire ?');
  await confirmWith('Expulser');
  expect(rooms.kickMember).toHaveBeenCalledWith(id, 'owner', 'alice');
  expect(screen.queryByText('Expulser Lili, propriétaire du serveur')).toBeNull();
});

it('annule le choix du nouveau propriétaire sans rien expulser', async () => {
  jest.mocked(rooms.getServer).mockResolvedValue({ ...server, proprietaireId: 'owner', monRole: 'admin' });
  jest.mocked(rooms.getMembers).mockResolvedValue({ membres: [{ utilisateurId: 'owner', role: 'membre', pseudo: 'Lili' }, { utilisateurId: 'alice', role: 'membre', pseudo: 'Alice' }], total: 2, suivant: null });
  await render(<ServerMembersScreen {...members} />);
  await fireEvent.press((await screen.findAllByRole('button', { name: 'Expulser' }))[0]);
  await fireEvent.press(screen.getByRole('button', { name: 'Annuler' }));
  expect(screen.queryByText('Expulser Lili, propriétaire du serveur')).toBeNull();
  expect(screen.getAllByRole('button', { name: 'Expulser' })).toHaveLength(2);
  expect(rooms.kickMember).not.toHaveBeenCalled();
});
