import { act, render, renderHook, screen } from '@testing-library/react-native';

import { subscribeToNetwork } from '@/adapters/network.adapter';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useConnection } from '@/hooks/useConnection';
import type { RealtimeState } from '@/services/websocketService';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@/adapters/network.adapter');
jest.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: jest.fn(() => 'light') }));

let realtime: RealtimeState;
const realtimeListeners = new Set<() => void>();
const mockRealtime = {
  getRealtimeState: () => realtime,
  onConnectionState: (handler: (state: RealtimeState) => void) => {
    const listener = () => handler(realtime);
    realtimeListeners.add(listener);
    return () => realtimeListeners.delete(listener);
  },
};
jest.mock('@/session/SessionContext', () => ({ useSession: () => ({ realtime: mockRealtime }) }));

let setNetwork: (online: boolean) => void;
const setRealtime = (state: RealtimeState) =>
  act(async () => {
    realtime = state;
    realtimeListeners.forEach((l) => l());
  });

beforeEach(() => {
  realtime = 'ready';
  realtimeListeners.clear();
  jest.mocked(subscribeToNetwork).mockImplementation((listener) => {
    setNetwork = listener;
    return () => undefined;
  });
});

describe('useConnection / ConnectionStatus', () => {
  it('suit le réseau et le canal temps réel', async () => {
    const hook = await renderHook(() => useConnection());
    expect(hook.result.current).toEqual({ status: 'online', online: true });
    await setRealtime('connecting');
    expect(hook.result.current.status).toBe('reconnecting');
    await setRealtime('disconnected');
    expect(hook.result.current.status).toBe('reconnecting');
    await act(async () => setNetwork(false));
    expect(hook.result.current).toEqual({ status: 'offline', online: false });
    await act(async () => setNetwork(true));
    await setRealtime('ready');
    expect(hook.result.current.online).toBe(true);
  });

  it("n'affiche rien en ligne, puis le bandeau hors connexion et de reconnexion", async () => {
    await render(<ConnectionStatus />);
    expect(screen.queryByTestId('connection-status')).toBeNull();
    await act(async () => setNetwork(false));
    expect(screen.getByText(/Hors connexion/)).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
    await act(async () => setNetwork(true));
    await setRealtime('connecting');
    expect(screen.getByText('Reconnexion en cours…')).toBeTruthy();
    await setRealtime('ready');
    expect(screen.queryByTestId('connection-status')).toBeNull();
  });

  it("reprend les couleurs d'état du client Web en thème sombre", async () => {
    jest.mocked(useColorScheme).mockReturnValue('dark');
    await render(<ConnectionStatus />);
    await act(async () => setNetwork(false));
    expect(screen.getByTestId('connection-status').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: '#ef4444' })]),
    );
    jest.mocked(useColorScheme).mockReturnValue('light');
  });
});
