import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { Platform, TextInput } from 'react-native';

import { LoginScreen } from '@/screens/LoginScreen';
import { PreferencesScreen } from '@/screens/PreferencesScreen';
import { SearchScreen } from '@/screens/SearchScreen';
import { ApiError } from '@/services/ApiError';
import { useSession } from '@/session/SessionContext';

jest.mock('@/session/SessionContext', () => ({ useSession: jest.fn() }));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
const signIn = jest.fn();
const signOut = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  signIn.mockResolvedValue(undefined);
  (useSession as jest.Mock).mockReturnValue({ user: { pseudo: 'Alice' }, signIn, signOut });
});

async function fillLogin() {
  await fireEvent.changeText(screen.getByLabelText('Pseudo ou courriel'), '  alice  ');
  await fireEvent.changeText(screen.getByLabelText('Mot de passe'), 'secret-test');
}

describe('LoginScreen', () => {
  it('refuse les champs vides et transmet les identifiants sans espaces superflus', async () => {
    await render(<LoginScreen />);
    await fireEvent(screen.getByLabelText('Mot de passe'), 'submitEditing');
    expect(signIn).not.toHaveBeenCalled();
    const focus = jest.spyOn(TextInput.prototype, 'focus');
    await fireEvent(screen.getByLabelText('Pseudo ou courriel'), 'submitEditing');
    expect(focus).toHaveBeenCalled();
    await fillLogin();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Se connecter' }));
    expect(signIn).toHaveBeenCalledWith('alice', 'secret-test');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Se connecter')).toBeTruthy();
    focus.mockRestore();
  });

  it.each([
    [new ApiError('timeout', 'x'), 'Le serveur met trop de temps à répondre. Réessayez.'],
    [new ApiError('network', 'x'), 'Impossible de joindre le serveur. Vérifiez votre connexion.'],
    [new ApiError('unauthorized', 'x'), 'Identifiant ou mot de passe incorrect.'],
    [new ApiError('rate_limited', 'x', 429), 'Trop de tentatives. Réessayez dans quelques instants.'],
    [new ApiError('server', 'x', 500), 'Connexion impossible. Réessayez.'],
    [new Error('x'), 'Connexion impossible. Réessayez.'],
  ])('affiche une erreur adaptée puis permet une nouvelle tentative (%s)', async (error, expected) => {
    signIn.mockRejectedValueOnce(error);
    await render(<LoginScreen />);
    await fillLogin();
    await fireEvent.press(screen.getByRole('button', { name: 'Se connecter' }));
    expect(screen.getByRole('alert')).toHaveTextContent(expected);
    await fireEvent(screen.getByLabelText('Mot de passe'), 'submitEditing');
    expect(signIn).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('empêche un second envoi pendant la connexion et affiche un indicateur', async () => {
    let resolve!: () => void;
    signIn.mockReturnValueOnce(new Promise<void>((done) => { resolve = done; }));
    await render(<LoginScreen />);
    await fillLogin();
    await act(async () => { void screen.getByLabelText('Mot de passe').props.onSubmitEditing(); });
    expect(screen.queryByText('Se connecter')).toBeNull();
    await act(async () => { void screen.getByLabelText('Mot de passe').props.onSubmitEditing(); });
    expect(signIn).toHaveBeenCalledTimes(1);
    await act(async () => resolve());
    expect(screen.getByText('Se connecter')).toBeTruthy();
  });
});

it('affiche l’utilisateur connecté et déclenche la déconnexion', async () => {
  const view = await render(<PreferencesScreen />);
  expect(screen.getByText('Alice')).toBeTruthy();
  await userEvent.setup().press(screen.getByRole('button', { name: 'Se déconnecter' }));
  expect(signOut).toHaveBeenCalledTimes(1);
  (useSession as jest.Mock).mockReturnValue({ user: null, signOut });
  await view.rerender(<PreferencesScreen />);
  expect(screen.getByText('—')).toBeTruthy();
});

it('conserve la saisie de recherche et indique la disponibilité du service', async () => {
  await render(<SearchScreen />);
  expect(screen.getByText('Recherchez un message')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Recherche'), 'salut');
  expect(screen.getByLabelText('Recherche')).toHaveDisplayValue('salut');
  expect(screen.getByText('Recherche non disponible')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Recherche'), '   ');
  expect(screen.getByText('Recherchez un message')).toBeTruthy();
});

it('adapte le clavier à Android', async () => {
  const os = jest.replaceProperty(Platform, 'OS', 'android');
  try {
    await render(<LoginScreen />);
    expect(screen.getByLabelText('Mot de passe')).toBeTruthy();
  } finally {
    os.restore();
  }
});
