import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { AccountSection } from '@/components/AccountSection';
import { ApiError } from '@/services/ApiError';

const mockChangePassword = jest.fn();
const mockDeleteAccount = jest.fn();
jest.mock('@/session/SessionContext', () => ({
  useSession: () => ({ changePassword: mockChangePassword, deleteAccount: mockDeleteAccount }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockChangePassword.mockResolvedValue(undefined);
  mockDeleteAccount.mockResolvedValue(undefined);
});
const fill = async (current: string, next: string, confirmation = next) => {
  await fireEvent.changeText(screen.getByLabelText('Mot de passe actuel'), current);
  await fireEvent.changeText(screen.getByLabelText('Nouveau mot de passe'), next);
  await fireEvent.changeText(screen.getByLabelText('Confirmer le nouveau mot de passe'), confirmation);
  await fireEvent.press(screen.getByRole('button', { name: 'Modifier le mot de passe' }));
};

it('modifie le mot de passe et vide le formulaire', async () => {
  await render(<AccountSection cardStyle={{}} />);
  expect(screen.getByRole('button', { name: 'Modifier le mot de passe' })).toBeDisabled();
  await fill('ancien-mdp', 'nouveau-mdp');
  expect(mockChangePassword).toHaveBeenCalledWith('ancien-mdp', 'nouveau-mdp');
  expect(screen.getByText('Mot de passe modifié.')).toBeTruthy();
  expect(screen.getByLabelText('Mot de passe actuel')).toHaveDisplayValue('');
  expect(screen.getByLabelText('Mot de passe actuel').props.secureTextEntry).toBe(true);
});

it('valide le nouveau mot de passe avant tout appel et affiche un refus', async () => {
  await render(<AccountSection cardStyle={{}} />);
  await fill('ancien-mdp', 'court');
  expect(screen.getByRole('alert')).toHaveTextContent('Mot de passe : 8 à 128 caractères.');
  await fill('ancien-mdp', 'nouveau-mdp', 'autre-mdp');
  expect(screen.getByRole('alert')).toHaveTextContent('Les mots de passe ne correspondent pas.');
  expect(mockChangePassword).not.toHaveBeenCalled();
  mockChangePassword.mockRejectedValueOnce(new ApiError('wrong_password', 'x', 401));
  await fill('faux-mdp', 'nouveau-mdp');
  expect(screen.getByRole('alert')).toHaveTextContent('Mot de passe actuel incorrect.');
  expect(screen.getByLabelText('Nouveau mot de passe')).toHaveDisplayValue('nouveau-mdp');
});

it('supprime le compte après confirmation, et rien si on annule', async () => {
  await render(<AccountSection cardStyle={{}} />);
  expect(screen.getByRole('button', { name: 'Supprimer mon compte' })).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('Supprimer mon compte · Mot de passe actuel'), 'mdp-actuel');
  await fireEvent.press(screen.getByRole('button', { name: 'Supprimer mon compte' }));
  const dialog = () => within(screen.getByTestId('app-dialog'));
  expect(dialog().getByRole('header')).toHaveTextContent('Supprimer ton compte ?');
  await fireEvent.press(dialog().getByRole('button', { name: 'Annuler' }));
  expect(mockDeleteAccount).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Supprimer mon compte' }));
  await fireEvent.press(dialog().getByRole('button', { name: 'Supprimer mon compte' }));
  expect(mockDeleteAccount).toHaveBeenCalledWith('mdp-actuel');
  mockDeleteAccount.mockRejectedValueOnce(new ApiError('wrong_password', 'x', 401));
  await fireEvent.press(screen.getByRole('button', { name: 'Supprimer mon compte' }));
  await fireEvent.press(dialog().getByRole('button', { name: 'Supprimer mon compte' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Mot de passe actuel incorrect.');
});
