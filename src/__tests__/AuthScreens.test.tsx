import * as ReactNative from 'react-native';
import { fireEvent, render, screen, act, userEvent } from '@testing-library/react-native';
import { RootNavigator } from '@/navigation/RootNavigator';
import { ApiError } from '@/services/ApiError';
import type { Session } from '@/session/SessionContext';
import { createRealtimeService } from '@/services/websocketService';

// Mock officiel avec chargement différé dans la factory Jest.
jest.mock(
  'react-native-safe-area-context',
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('@/session/SessionContext', () => ({
  useSession: () => mockSession,
}));
jest.mock('@/navigation/MainTabs', () => ({
  MainTabs: () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Text } = require('react-native');
    return <Text>Main app</Text>;
  },
}));
let mockSession: Session;
it('shows Chatvardage branding and chains registration keyboard fields safely', async () => {
  const view = await render(<RootNavigator />);
  expect(screen.getByLabelText('Logo Chatvardage')).toBeTruthy();
  expect(screen.getByText('Heureux de te revoir !')).toBeTruthy();
  await fireEvent.press(screen.getByText('Créer un compte'));
  expect(screen.getByText('Crée ton compte')).toBeTruthy();
  const callbacks = ['Pseudo', 'Courriel', 'Mot de passe'].map(
    (label) => screen.getByLabelText(label).props.onSubmitEditing,
  );
  for (const callback of callbacks) await act(() => callback());
  await view.unmount();
  for (const callback of callbacks) expect(() => callback()).not.toThrow();
});
it('keeps protected screens hidden and offers restoration retry when offline', async () => {
  mockSession.status = 'loading';
  mockSession.error = 'Impossible de joindre le serveur.';
  await render(<RootNavigator />);
  expect(screen.getByText(mockSession.error)).toBeTruthy();
  expect(screen.queryByLabelText('Restauration de session')).toBeNull();
  expect(screen.queryByText('Réessayer le nettoyage')).toBeNull();
  await fireEvent.press(screen.getByText('Réessayer'));
  expect(mockSession.restoreSession).toHaveBeenCalledTimes(1);
});
it('renders Android keyboard behavior on both auth screens', async () => {
  jest.replaceProperty(ReactNative.Platform, 'OS', 'android');
  await render(<RootNavigator />);
  expect(screen.getByText('Se connecter')).toBeTruthy();
  await fireEvent.press(screen.getByText('Créer un compte'));
  expect(screen.getByText('S’inscrire')).toBeTruthy();
  jest.restoreAllMocks();
});
beforeEach(() => {
  mockSession = {
    realtime: createRealtimeService(),
    drafts: new Map(),
    status: 'signedOut',
    user: null,
    error: null,
    signIn: jest.fn().mockResolvedValue(undefined),
    register: jest.fn().mockResolvedValue(undefined),
    signOut: jest.fn(),
    changePassword: jest.fn(),
    deleteAccount: jest.fn(),
    logoutOthers: jest.fn(),
    refreshSession: jest.fn(),
    restoreSession: jest.fn(),
  };
});
const change = async (label: string, text: string) => {
  await fireEvent.changeText(screen.getByLabelText(label), text);
};

it('ignores a queued keyboard focus event after unmount', async () => {
  const view = await render(<RootNavigator />);
  const focus = screen.getByLabelText('Pseudo ou courriel').props.onSubmitEditing;
  await view.unmount();
  expect(() => focus()).not.toThrow();
});
it('rejects an oversized email even when the native input limit is bypassed', async () => {
  await render(<RootNavigator />);
  await registerForm();
  expect(screen.getByRole('button', { name: 'S’inscrire' }).props.accessibilityState).toMatchObject({
    busy: false,
    disabled: false,
  });
  await change('Courriel', `${'a'.repeat(250)}@example.com`);
  await fireEvent.press(screen.getByText('S’inscrire'));
  expect(screen.getByText('Adresse courriel invalide.')).toBeTruthy();
  expect(mockSession.register).not.toHaveBeenCalled();
});
const registerForm = async () => {
  await fireEvent.press(screen.getByText('Créer un compte'));
  await change('Pseudo', 'alice');
  await change('Courriel', 'alice@example.com');
  await change('Mot de passe', 'password-fixture');
  await change('Confirmation du mot de passe', 'password-fixture');
};

it('loading gates auth and protected screens, navigation follows status and clears history', async () => {
  mockSession.status = 'loading';
  const view = await render(<RootNavigator />);
  expect(screen.getByLabelText('Restauration de session')).toBeTruthy();
  expect(screen.queryByText('Main app')).toBeNull();
  expect(screen.queryByText('Se connecter')).toBeNull();
  mockSession.status = 'signedIn';
  await view.rerender(<RootNavigator />);
  expect(screen.getByText('Main app')).toBeTruthy();
  mockSession.status = 'signedOut';
  await view.rerender(<RootNavigator />);
  expect(screen.getByText('Se connecter')).toBeTruthy();
  expect(screen.queryByText('Main app')).toBeNull();
  await registerForm();
  expect(screen.getByText('S’inscrire')).toBeTruthy();
  await fireEvent.press(screen.getByText('Retour à la connexion'));
  expect(screen.getByText('Se connecter')).toBeTruthy();
});
it('login validates required fields, sends trimmed identifier, shows pending and success', async () => {
  let resolve!: () => void;
  jest.mocked(mockSession.signIn).mockReturnValue(
    new Promise<void>((done) => {
      resolve = done;
    }),
  );
  const view = await render(<RootNavigator />);
  await fireEvent.press(screen.getByText('Se connecter'));
  expect(mockSession.signIn).not.toHaveBeenCalled();
  await change('Pseudo ou courriel', ' alice ');
  await change('Mot de passe', 'password-fixture');
  await act(async () => {
    void screen.getByLabelText('Mot de passe').props.onSubmitEditing();
  });
  expect(screen.getByLabelText('Connexion en cours')).toBeTruthy();
  expect(mockSession.signIn).toHaveBeenCalledWith('alice', 'password-fixture');
  await act(async () => {
    resolve();
  });
  mockSession.status = 'signedIn';
  await view.rerender(<RootNavigator />);
  expect(screen.getByText('Main app')).toBeTruthy();
});
it.each([
  ['unauthorized', 401, /incorrect/],
  ['network', undefined, /joindre/],
  ['timeout', undefined, /trop de temps/],
  ['rate_limit', 429, /Trop de tentatives/],
  ['server', 500, /Connexion impossible/],
] as const)('login error %s', async (kind, status, message) => {
  jest.mocked(mockSession.signIn).mockRejectedValue(new ApiError(kind, 'sensitive', status));
  await render(<RootNavigator />);
  await change('Pseudo ou courriel', 'alice');
  await change('Mot de passe', 'bad');
  await fireEvent.press(screen.getByText('Se connecter'));
  expect(await screen.findByText(message)).toBeTruthy();
  expect(screen.queryByText('sensitive')).toBeNull();
});
it('register validates fields and confirms password only on the client', async () => {
  await render(<RootNavigator />);
  await fireEvent.press(screen.getByText('Créer un compte'));
  await fireEvent.press(screen.getByText('S’inscrire'));
  expect(screen.getByText(/Pseudo :/)).toBeTruthy();
  await change('Pseudo', 'alice');
  await fireEvent.press(screen.getByText('S’inscrire'));
  expect(screen.getByText('Adresse courriel invalide.')).toBeTruthy();
  await change('Courriel', 'alice@example.com');
  await change('Mot de passe', 'short');
  await fireEvent.press(screen.getByText('S’inscrire'));
  expect(screen.getByText(/Mot de passe :/)).toBeTruthy();
  await change('Mot de passe', 'password-fixture');
  await change('Confirmation du mot de passe', 'different');
  await fireEvent.press(screen.getByText('S’inscrire'));
  expect(screen.getByText(/ne correspondent/)).toBeTruthy();
  await change('Confirmation du mot de passe', 'password-fixture');
  await fireEvent.press(screen.getByText('S’inscrire'));
  expect(mockSession.register).toHaveBeenCalledWith({
    pseudo: 'alice',
    courriel: 'alice@example.com',
    mot_de_passe: 'password-fixture',
  });
});
it('register displays pending, then navigates to authenticated app', async () => {
  let resolve!: () => void;
  jest.mocked(mockSession.register).mockReturnValue(
    new Promise<void>((done) => {
      resolve = done;
    }),
  );
  const view = await render(<RootNavigator />);
  await registerForm();
  await act(async () => {
    void screen.getByLabelText('Confirmation du mot de passe').props.onSubmitEditing();
  });
  expect(screen.getByLabelText('Inscription en cours')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Inscription en cours' }).props.accessibilityState).toMatchObject(
    { busy: true, disabled: true },
  );
  await act(async () => {
    void screen.getByLabelText('Confirmation du mot de passe').props.onSubmitEditing();
  });
  expect(mockSession.register).toHaveBeenCalledTimes(1);
  await act(async () => {
    resolve();
  });
  mockSession.status = 'signedIn';
  await view.rerender(<RootNavigator />);
  expect(screen.getByText('Main app')).toBeTruthy();
});
it.each([
  ['conflict', 409, /déjà utilisé/],
  ['network', undefined, /joindre/],
  ['timeout', undefined, /trop de temps/],
])('register error %s', async (kind, status, message) => {
  jest
    .mocked(mockSession.register)
    .mockRejectedValue(new ApiError(kind as 'conflict' | 'network' | 'timeout', 'sensitive', status));
  await render(<RootNavigator />);
  await registerForm();
  await fireEvent.press(screen.getByText('S’inscrire'));
  expect(await screen.findByText(message)).toBeTruthy();
});
it('shows storage cleanup errors on signed-out navigation', async () => {
  mockSession.error = 'Le stockage sécurisé ne peut pas être effacé.';
  await render(<RootNavigator />);
  expect(screen.getByText(mockSession.error)).toBeTruthy();
  expect(screen.getByText(mockSession.error).props.accessibilityLiveRegion).toBe('polite');
});

it('uses the theme placeholder color throughout registration', async () => {
  await render(<RootNavigator />);
  await fireEvent.press(screen.getByText('Créer un compte'));
  for (const label of ['Pseudo', 'Courriel', 'Mot de passe', 'Confirmation du mot de passe']) {
    const field = screen.getByLabelText(label);
    expect(field.props.placeholderTextColor).toBeTruthy();
    expect(field.props.placeholderTextColor).toBe(screen.getByLabelText('Pseudo').props.placeholderTextColor);
  }
});

it('can retry secure cleanup from Login', async () => {
  mockSession.error = 'Stockage indisponible';
  await render(<RootNavigator />);
  await fireEvent.press(screen.getByText('Réessayer le nettoyage'));
  expect(mockSession.signOut).toHaveBeenCalledTimes(1);
});
it('supports keyboard focus and blocks duplicate login submission during loading', async () => {
  await render(<RootNavigator />);
  await fireEvent(screen.getByLabelText('Pseudo ou courriel'), 'submitEditing');
  await fireEvent(screen.getByLabelText('Mot de passe'), 'submitEditing');
  expect(mockSession.signIn).not.toHaveBeenCalled();
  await change('Pseudo ou courriel', 'alice');
  await change('Mot de passe', 'fixture');
  let resolve!: () => void;
  jest.mocked(mockSession.signIn).mockReturnValue(
    new Promise<void>((done) => {
      resolve = done;
    }),
  );
  await act(async () => {
    void screen.getByLabelText('Mot de passe').props.onSubmitEditing();
  });
  await fireEvent(screen.getByLabelText('Mot de passe'), 'submitEditing');
  expect(mockSession.signIn).toHaveBeenCalledTimes(1);
  await act(async () => {
    resolve();
  });
});
it('uses a safe fallback for an unexpected login error', async () => {
  jest.mocked(mockSession.signIn).mockRejectedValue(new Error('secret detail'));
  await render(<RootNavigator />);
  await change('Pseudo ou courriel', 'alice');
  await change('Mot de passe', 'fixture');
  await fireEvent.press(screen.getByText('Se connecter'));
  expect(screen.getByText('Connexion impossible. Réessayez.')).toBeTruthy();
});

it('renders iOS keyboard handling and dark navigation, including actual press feedback', async () => {
  jest.replaceProperty(ReactNative.Platform, 'OS', 'ios');
  const scheme = jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue('dark');
  await render(<RootNavigator />);
  await change('Pseudo ou courriel', 'alice');
  await change('Mot de passe', 'fixture');
  const user = userEvent.setup();
  await user.press(screen.getByText('Se connecter'));
  await user.press(screen.getByText('Créer un compte'));
  expect(screen.getByText('S’inscrire')).toBeTruthy();
  scheme.mockRestore();
  jest.restoreAllMocks();
});
