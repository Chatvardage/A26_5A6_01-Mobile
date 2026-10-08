import { fireEvent, render, screen } from '@testing-library/react-native';
import { EditRoomScreen } from '@/screens/EditRoomScreen';
import * as rooms from '@/services/rooms.service';
import { ApiError } from '@/services/ApiError';
jest.mock('@/services/rooms.service', () => ({ ...jest.requireActual('@/services/rooms.service'), getServer: jest.fn(), updateRoom: jest.fn() }));
const id = '11111111-1111-4111-8111-111111111111';
const roomId = '33333333-3333-4333-8333-333333333333';
const room: rooms.Room = { id: roomId, serveurId: id, nom: 'général', position: 0, acces: 'tous', ecriture: 'moderateurs', peutEcrire: true };
const server: rooms.Server = { id, nom: 'Équipe', public: false, parDefaut: false, proprietaireId: 'me', monRole: 'moderateur', nombreMembres: 3, salons: [room], invitations: [], icone: null };
const navigation = { goBack: jest.fn() };
const props = (params: unknown) => ({ navigation, route: { params } }) as unknown as Parameters<typeof EditRoomScreen>[0];
beforeEach(() => { jest.clearAllMocks(); jest.mocked(rooms.getServer).mockResolvedValue(server); });

it('pré-remplit le salon, enregistre ses changements puis revient à la gestion', async () => {
  jest.mocked(rooms.updateRoom).mockResolvedValue(room);
  await render(<EditRoomScreen {...props({ serverId: id, roomId })} />);
  expect(await screen.findByLabelText('Nom du salon')).toHaveDisplayValue('général');
  expect(screen.getByLabelText('Nom du salon').props.placeholderTextColor).toBeTruthy();
  expect(screen.getAllByRole('button', { name: /Modérateurs/ })[1]).toHaveTextContent('✓ Modérateurs');
  await fireEvent.changeText(screen.getByLabelText('Nom du salon'), ' discussion ');
  await fireEvent.press(screen.getAllByRole('button', { name: /Modérateurs/ })[0]);
  await fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }));
  expect(rooms.updateRoom).toHaveBeenCalledWith(roomId, { nom: 'discussion', acces: 'moderateurs', ecriture: 'moderateurs' });
  expect(navigation.goBack).toHaveBeenCalled();
});

it('garde le formulaire et affiche le refus du serveur', async () => {
  jest.mocked(rooms.updateRoom).mockRejectedValueOnce(new ApiError('forbidden', 'x'));
  await render(<EditRoomScreen {...props({ serverId: id, roomId })} />);
  await fireEvent.changeText(await screen.findByLabelText('Nom du salon'), 'autre');
  await fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }));
  expect(screen.getByRole('alert')).toBeTruthy();
  expect(screen.getByLabelText('Nom du salon')).toHaveDisplayValue('autre');
  expect(navigation.goBack).not.toHaveBeenCalled();
});

it.each([{ serverId: id, roomId: 'invalide' }, { serverId: 'invalide', roomId }, null])('rejette une route invalide sans charger (%p)', async params => {
  await render(<EditRoomScreen {...props(params)} />);
  expect(screen.getByText('Ce salon est introuvable.')).toBeTruthy();
  expect(rooms.getServer).not.toHaveBeenCalled();
});

it('signale un salon disparu, un membre sans droit et une panne', async () => {
  const view = await render(<EditRoomScreen {...props({ serverId: id, roomId: '44444444-4444-4444-8444-444444444444' })} />);
  expect(await screen.findByText('Ce salon est introuvable.')).toBeTruthy();
  await view.unmount();
  jest.mocked(rooms.getServer).mockResolvedValue({ ...server, monRole: 'membre' });
  const second = await render(<EditRoomScreen {...props({ serverId: id, roomId })} />);
  expect(await screen.findByText('Vous n’avez pas accès à cette conversation.')).toBeTruthy();
  await second.unmount();
  jest.mocked(rooms.getServer).mockRejectedValueOnce(new ApiError('network', 'x')).mockResolvedValue(server);
  await render(<EditRoomScreen {...props({ serverId: id, roomId })} />);
  await fireEvent.press(await screen.findByText('Réessayer'));
  expect(await screen.findByLabelText('Nom du salon')).toHaveDisplayValue('général');
});
