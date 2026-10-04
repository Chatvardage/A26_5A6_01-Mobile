import { fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { SessionProvider, useSession } from '@/session/SessionContext';
import { configureHttpClient } from '@/services/httpClient';
import { configureRealtime, disconnectRealtime } from '@/services/websocketService';

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
});
