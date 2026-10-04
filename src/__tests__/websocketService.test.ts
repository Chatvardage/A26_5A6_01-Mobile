import {
  configureRealtime,
  disconnectRealtime,
  getRealtimeState,
  joinRoom,
  leaveRoom,
  onReady,
  subscribe,
} from '@/services/websocketService';
import { AppState, type AppStateStatus } from 'react-native';

const mockIo = jest.fn();
jest.mock('socket.io-client', () => ({ io: (...args: unknown[]) => mockIo(...args) }));

type Listener = (...args: unknown[]) => void;
const listeners = new Map<string, Listener[]>();
const mockSocket: {
  connected: boolean;
  on: jest.Mock;
  off: jest.Mock;
  emit: jest.Mock;
  disconnect: jest.Mock;
  connect: jest.Mock;
  removeAllListeners: jest.Mock;
} = {
  connected: false,
  on: jest.fn(),
  off: jest.fn(),
  emit: jest.fn(),
  disconnect: jest.fn(),
  connect: jest.fn(),
  removeAllListeners: jest.fn(),
};

let appStateListener: ((next: AppStateStatus) => void) | null = null;
const trigger = (event: string, payload?: unknown) => {
  for (const handler of listeners.get(event) ?? []) handler(payload);
};

mockSocket.on.mockImplementation((event: string, handler: Listener) => {
  listeners.set(event, [...(listeners.get(event) ?? []), handler]);
  return mockSocket;
});
mockSocket.off.mockImplementation((event: string, handler: Listener) => {
  listeners.set(event, (listeners.get(event) ?? []).filter((registered) => registered !== handler));
  return mockSocket;
});
mockSocket.emit.mockImplementation((event: string, _payload: unknown, ack?: (response: unknown) => void) => {
  if (event === 'room-message.join') ack?.({ joined: true });
  else if (event === 'room-message.leave') ack?.({ left: true });
});
mockSocket.disconnect.mockImplementation(() => {
  mockSocket.connected = false;
  trigger('disconnect');
});
mockSocket.connect.mockImplementation(() => {
  mockSocket.connected = true;
});
mockSocket.removeAllListeners.mockImplementation(() => listeners.clear());

beforeEach(() => {
  listeners.clear();
  mockSocket.connected = false;
  mockIo.mockReset().mockReturnValue(mockSocket);
  mockSocket.on.mockClear();
  mockSocket.off.mockClear();
  mockSocket.emit.mockClear();
  mockSocket.disconnect.mockClear();
  mockSocket.connect.mockClear();
  mockSocket.removeAllListeners.mockClear();
  appStateListener = null;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => {
    appStateListener = handler as (next: AppStateStatus) => void;
    return { remove: jest.fn() } as ReturnType<typeof AppState.addEventListener>;
  });
  configureRealtime({ getToken: () => 'test-token', onUnauthorized: jest.fn() });
});

afterEach(() => {
  disconnectRealtime();
  jest.restoreAllMocks();
});

describe('websocketService', () => {
  it('crée un socket unique sur le namespace /messages avec le jeton en auth', () => {
    const unsubscribe = subscribe('private-message.created', jest.fn());
    expect(mockIo).toHaveBeenCalledTimes(1);
    expect(mockIo).toHaveBeenCalledWith(
      expect.stringMatching(/\/messages$/),
      expect.objectContaining({ path: '/socket.io', auth: { token: 'test-token' }, transports: ['websocket'] }),
    );
    unsubscribe();
  });

  it('attend connexion.prete avant de joindre un salon et attend l’accusé', async () => {
    const joining = joinRoom('room-id');
    expect(mockSocket.emit).not.toHaveBeenCalled();
    trigger('connexion.prete');
    await expect(joining).resolves.toBeUndefined();
    expect(mockSocket.emit).toHaveBeenCalledWith('room-message.join', { roomId: 'room-id' }, expect.any(Function));
    expect(getRealtimeState()).toBe('ready');
  });

  it('notifie chaque connexion prête et rejoint de nouveau les salons après reconnexion', async () => {
    const ready = jest.fn();
    onReady(ready);
    trigger('connexion.prete');
    await joinRoom('room-id');
    mockSocket.emit.mockClear();

    trigger('disconnect');
    trigger('connexion.prete');

    expect(ready).toHaveBeenCalledTimes(2);
    expect(mockSocket.emit).toHaveBeenCalledWith('room-message.join', { roomId: 'room-id' }, expect.any(Function));
  });

  it('oublie un salon révoqué et transmet la révocation de session', () => {
    const onUnauthorized = jest.fn();
    configureRealtime({ getToken: () => 'test-token', onUnauthorized });
    onReady(jest.fn());
    trigger('connexion.prete');
    trigger('room-message.revoked', { roomId: 'room-id' });
    mockSocket.emit.mockClear();
    trigger('connexion.prete');
    expect(mockSocket.emit).not.toHaveBeenCalledWith('room-message.join', { roomId: 'room-id' }, expect.any(Function));

    trigger('session.revoquee');
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(getRealtimeState()).toBe('disconnected');
  });

  it('désabonne les événements et ferme le socket', () => {
    const handler = jest.fn();
    const unsubscribe = subscribe('custom-event', handler);
    trigger('custom-event', {});
    unsubscribe();
    trigger('custom-event', {});
    expect(handler).toHaveBeenCalledTimes(1);

    disconnectRealtime();
    expect(mockSocket.disconnect).toHaveBeenCalledTimes(1);
    expect(getRealtimeState()).toBe('disconnected');
  });

  it('quitte un salon déjà rejoint et reconnecte au retour à active', async () => {
    subscribe('ready-event', jest.fn());
    trigger('connexion.prete');
    await joinRoom('room-id');
    await leaveRoom('room-id');
    expect(mockSocket.emit).toHaveBeenCalledWith('room-message.leave', { roomId: 'room-id' }, expect.any(Function));

    mockSocket.connected = false;
    appStateListener?.('active');
    expect(mockSocket.connect).toHaveBeenCalledTimes(1);
  });
});
