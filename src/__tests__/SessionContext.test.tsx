import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { SessionProvider, useSession } from '@/session/SessionContext';
import { configureHttpClient } from '@/services/httpClient';
import { configureRealtime, disconnectRealtime } from '@/services/websocketService';
import { login } from '@/services/authService';
import { ApiError } from '@/services/ApiError';

jest.mock('@/services/authService', () => ({ login: jest.fn() }));
jest.mock('@/services/httpClient', () => ({ configureHttpClient: jest.fn() }));
jest.mock('@/services/websocketService', () => ({
  configureRealtime: jest.fn(),
  disconnectRealtime: jest.fn(),
}));

function SessionProbe() {
  const session = useSession();
  return (
    <>
      <Pressable onPress={session.signOut} accessibilityRole="button">
        <Text>{session.status}</Text>
      </Pressable>
    </>
  );
}

describe('SessionProvider temps réel', () => {
  beforeEach(() => jest.clearAllMocks());
  it('configure le socket avec le jeton privé et le ferme à la déconnexion', async () => {
    await render(
      <SessionProvider>
        <SessionProbe />
      </SessionProvider>,
    );
    expect(configureHttpClient).toHaveBeenCalledTimes(1);
    expect(configureRealtime).toHaveBeenCalledWith(
      expect.objectContaining({ getToken: expect.any(Function), onUnauthorized: expect.any(Function) }),
    );

    await fireEvent.press(screen.getByRole('button'));
    expect(disconnectRealtime).toHaveBeenCalledTimes(1);
    expect(screen.getByText('signedOut')).toBeTruthy();
  });

  it('ouvre une session, fournit le jeton aux services et l’efface à la révocation', async () => {
    const user = { id: 'alice', pseudo: 'Alice', courriel: 'alice@example.test', role: 'user' };
    jest.mocked(login).mockResolvedValueOnce({ jeton: 'token-test', utilisateur: user });
    const { result } = await renderHook(useSession, { wrapper: SessionProvider });
    expect(result.current.status).toBe('signedOut');
    const http = jest.mocked(configureHttpClient).mock.calls[0][0];
    const realtime = jest.mocked(configureRealtime).mock.calls[0][0];
    expect(http.getToken()).toBeNull();
    expect(realtime.getToken()).toBeNull();
    await act(async () => result.current.signIn('alice', 'password-test'));
    expect(login).toHaveBeenCalledWith('alice', 'password-test');
    expect(result.current.user).toEqual(user);
    expect(result.current.status).toBe('signedIn');
    expect(http.getToken()).toBe('token-test');
    expect(realtime.getToken()).toBe('token-test');
    await act(async () => realtime.onUnauthorized());
    expect(result.current.status).toBe('signedOut');
    expect(result.current.user).toBeNull();
    expect(realtime.getToken()).toBeNull();
    expect(disconnectRealtime).toHaveBeenCalledTimes(1);
  });

  it('ne crée pas de session lorsque la connexion échoue', async () => {
    const error = new ApiError('unauthorized', 'x');
    jest.mocked(login).mockRejectedValueOnce(error);
    const { result } = await renderHook(useSession, { wrapper: SessionProvider });
    await act(async () => { await expect(result.current.signIn('alice', 'bad')).rejects.toBe(error); });
    expect(result.current.status).toBe('signedOut');
    expect(result.current.user).toBeNull();
  });

  it('signale explicitement un usage hors du fournisseur', async () => {
    await expect(renderHook(useSession)).rejects.toThrow('useSession doit être utilisé dans un SessionProvider');
  });
});
