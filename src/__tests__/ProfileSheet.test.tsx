import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { Pressable, Text, View } from 'react-native';

import { useProfileSheet, type ProfileTarget } from '@/components/ProfileSheet';
import type { DisplayProfile } from '@/hooks/usePublicProfiles';
import { lookupPseudos } from '@/services/usersService';

let mockProfiles: Record<string, DisplayProfile> = {};
jest.mock('@/hooks/usePublicProfiles', () => ({ usePublicProfiles: () => mockProfiles }));
jest.mock('@/session/SessionContext', () => ({ useSession: () => ({ user: { id: 'me' } }) }));
jest.mock('@/services/usersService', () => {
  const actual = jest.requireActual('@/services/usersService');
  return { ...actual, lookupPseudos: jest.fn() };
});

const onMessage = jest.fn();
function Host({ target, current, profiles }: { target: ProfileTarget; current?: string; profiles?: Record<string, DisplayProfile> }) {
  const { show, sheet } = useProfileSheet({ onMessage, currentConversationId: current, profiles });
  return <View><Pressable accessibilityRole="button" onPress={() => show(target)}><Text>Ouvrir</Text></Pressable>{sheet}</View>;
}
const open = async (target: ProfileTarget, current?: string) => {
  await render(<Host target={target} current={current} />);
  await fireEvent.press(screen.getByText('Ouvrir'));
  return within(screen.getByTestId('profile-sheet'));
};
const alice: DisplayProfile = { idUtilisateur: 'alice', alias: 'Ali', avatar: null, actif: true, online: true };

beforeEach(() => {
  jest.clearAllMocks();
  mockProfiles = {};
  jest.mocked(lookupPseudos).mockResolvedValue({ alice: 'alice42' });
});

it('affiche alias, pseudo, présence et ouvre la conversation privée en fermant la fiche', async () => {
  mockProfiles = { alice };
  const sheet = await open({ userId: 'alice', pseudo: 'alice42' });
  expect(sheet.getByRole('header')).toHaveTextContent('Ali');
  expect(sheet.getByText('@alice42')).toBeTruthy();
  expect(sheet.getByText('En ligne')).toBeTruthy();
  expect(sheet.getAllByText('Ali')).toHaveLength(2);
  // Pseudo fourni par l'écran : aucune requête.
  expect(lookupPseudos).not.toHaveBeenCalled();
  await fireEvent.press(sheet.getByRole('button', { name: 'Message privé' }));
  expect(onMessage).toHaveBeenCalledWith('alice', 'Ali');
  expect(screen.queryByTestId('profile-sheet')).toBeNull();
});

it('sans alias, montre le pseudo résolu ; hors ligne', async () => {
  mockProfiles = { alice: { ...alice, alias: null, online: false } };
  const sheet = await open({ userId: 'alice' });
  expect(await sheet.findByText('@alice42')).toBeTruthy();
  expect(sheet.getByRole('header')).toHaveTextContent('alice42');
  expect(sheet.getByText('Aucun alias')).toBeTruthy();
  expect(sheet.getByText('Hors ligne')).toBeTruthy();
  expect(lookupPseudos).toHaveBeenCalledWith(['alice']);
});

it('reste lisible si la personne est inconnue ou si la recherche du pseudo échoue', async () => {
  jest.mocked(lookupPseudos).mockResolvedValueOnce({});
  const unknown = await open({ userId: 'bob' });
  await act(async () => undefined);
  expect(unknown.getByRole('header')).toHaveTextContent('Utilisateur inconnu');
  expect(unknown.queryByText(/^@/)).toBeNull();
  await fireEvent.press(unknown.getByRole('button', { name: 'Fermer' }));
  expect(screen.queryByTestId('profile-sheet')).toBeNull();

  jest.mocked(lookupPseudos).mockRejectedValueOnce(new Error('réseau'));
  await fireEvent.press(screen.getByText('Ouvrir'));
  await act(async () => undefined);
  expect(within(screen.getByTestId('profile-sheet')).getByRole('header')).toHaveTextContent('Utilisateur inconnu');
});

it('ignore un pseudo arrivé après la fermeture', async () => {
  let resolve!: (names: Record<string, string>) => void;
  jest.mocked(lookupPseudos).mockReturnValueOnce(new Promise(done => { resolve = done; }));
  await open({ userId: 'alice' });
  // Appui sur le fond : ferme la fiche.
  await fireEvent.press(screen.getByLabelText('Fermer'));
  await act(async () => resolve({ alice: 'alice42' }));
  expect(screen.queryByTestId('profile-sheet')).toBeNull();
});

it('un appui sur le contenu ne ferme pas la fiche ; retour Android la ferme', async () => {
  await open({ userId: 'alice', pseudo: 'alice42' });
  await fireEvent.press(screen.getByTestId('profile-sheet'));
  expect(screen.getByTestId('profile-sheet')).toBeTruthy();
  // L'événement remonte jusqu'au `onRequestClose` du Modal.
  await fireEvent(screen.getByTestId('profile-sheet'), 'requestClose');
  expect(screen.queryByTestId('profile-sheet')).toBeNull();
});

it.each([
  ['son propre profil', { userId: 'me', pseudo: 'moi' }, undefined],
  ['la conversation déjà ouverte avec cette personne', { userId: 'alice', pseudo: 'alice42' }, 'dm:alice'],
])('pas de bouton Message privé pour %s', async (_label, target, current) => {
  const sheet = await open(target, current);
  expect(sheet.queryByRole('button', { name: 'Message privé' })).toBeNull();
  expect(sheet.getByRole('button', { name: 'Fermer' })).toBeTruthy();
});

it('reprend la présence suivie par l’écran qui l’ouvre (même valeur que sa pastille)', async () => {
  // Le suivi propre de la fiche dirait « en ligne » : c'est celui de l'écran qui fait foi.
  mockProfiles = { alice };
  await render(<Host target={{ userId: 'alice', pseudo: 'alice42' }} profiles={{ alice: { ...alice, online: false } }} />);
  await fireEvent.press(screen.getByText('Ouvrir'));
  const sheet = within(screen.getByTestId('profile-sheet'));
  expect(sheet.getByText('Hors ligne')).toBeTruthy();
  expect(sheet.getByLabelText('Ali, Hors ligne')).toBeTruthy();
});
