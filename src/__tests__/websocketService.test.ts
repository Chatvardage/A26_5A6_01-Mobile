import { createRealtimeService, type RealtimeService } from '@/services/websocketService';
import { AppState, type AppStateStatus } from 'react-native';
import type { Socket } from 'socket.io-client';

const mockIo = jest.fn();
jest.mock('socket.io-client', () => ({ io: (...args: unknown[]) => mockIo(...args) }));

let configureRealtime: RealtimeService['configureRealtime'];
let disconnectRealtime: RealtimeService['disconnectRealtime'];
let getRealtimeState: RealtimeService['getRealtimeState'];
let joinRoom: RealtimeService['joinRoom'];
let leaveRoom: RealtimeService['leaveRoom'];
let onConnectionState: RealtimeService['onConnectionState'];
let onReady: RealtimeService['onReady'];
let subscribe: RealtimeService['subscribe'];

type Listener = (...args: unknown[]) => void;
const listeners = new Map<string, Listener[]>();
const mockSocket: {
  auth: Socket['auth'];
  connected: boolean;
  on: jest.Mock;
  off: jest.Mock;
  emit: jest.Mock;
  disconnect: jest.Mock;
  connect: jest.Mock;
  removeAllListeners: jest.Mock;
} = {
  auth: { token: 'test-token' },
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
  ({ configureRealtime, disconnectRealtime, getRealtimeState, joinRoom, leaveRoom, onConnectionState, onReady, subscribe } = createRealtimeService());
  listeners.clear();
  mockSocket.auth = { token: 'test-token' };
  mockSocket.connected = false;
  mockIo.mockReset().mockReturnValue(mockSocket);
  mockSocket.on.mockClear();
  mockSocket.off.mockClear();
  mockSocket.emit.mockReset().mockImplementation((event: string, _payload: unknown, ack?: (response: unknown) => void) => {
    ack?.(event === 'room-message.join' ? { joined: true } : { left: true });
  });
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
  jest.useRealTimers();
});

describe('websocketService', () => {
  it.each(['connecting', 'ready', 'disconnected'] as const)('ferme un socket %s reconfiguré sans jeton et notifie la session', (state) => {
    const ready = jest.fn();
    onReady(ready);
    if (state === 'ready') trigger('connexion.prete');
    if (state === 'disconnected') trigger('disconnect');
    const changed = jest.fn();
    onConnectionState(changed);
    changed.mockClear();
    ready.mockClear();
    const onUnauthorized = jest.fn(() => {
      expect(getRealtimeState()).toBe('disconnected');
      expect(listeners.size).toBe(0);
    });
    configureRealtime({ getToken: () => null, onUnauthorized });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(mockSocket.disconnect).toHaveBeenCalledTimes(1);
    expect(mockSocket.connect).not.toHaveBeenCalled();
    expect(AppState.addEventListener).toHaveLastReturnedWith(expect.objectContaining({ remove: expect.any(Function) }));
    const subscription = jest.mocked(AppState.addEventListener).mock.results.at(-1)!.value;
    expect(subscription.remove).toHaveBeenCalledTimes(1);
    expect(changed.mock.calls).toEqual(state === 'disconnected' ? [] : [['disconnected']]);
    expect(() => subscribe('private-message.created', jest.fn())).toThrow(expect.objectContaining({ kind: 'unauthorized' }));

    configureRealtime({ getToken: () => 'new-session-token', onUnauthorized: jest.fn() });
    onReady(jest.fn());
    trigger('connexion.prete');
    expect(changed.mock.calls).toEqual(state === 'disconnected' ? [] : [['disconnected']]);
    expect(ready).not.toHaveBeenCalled();
  });

  it('rejette les attentes de salon si le jeton disparaît avant connexion.prete', async () => {
    const pending = joinRoom('room-id');
    const rejection = expect(pending).rejects.toMatchObject({ kind: 'unauthorized' });
    const onUnauthorized = jest.fn();
    configureRealtime({ getToken: () => null, onUnauthorized });
    await rejection;
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(mockSocket.emit).not.toHaveBeenCalled();
  });

  it('ne dépend pas du format de socket.auth pour fermer un socket sans jeton', () => {
    onReady(jest.fn());
    mockSocket.auth = jest.fn();
    configureRealtime({ getToken: () => 'test-token', onUnauthorized: jest.fn() });
    expect(mockSocket.disconnect).not.toHaveBeenCalled();
    const onUnauthorized = jest.fn();
    configureRealtime({ getToken: () => null, onUnauthorized });
    expect(mockSocket.disconnect).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('ne perd pas une transition déclenchée pendant la notification initiale', () => {
    const states: string[] = [];
    const unsubscribe = onConnectionState((next) => {
      states.push(next);
      if (next === 'disconnected') onReady(jest.fn());
    });
    expect(states).toEqual(['disconnected', 'connecting']);
    trigger('connexion.prete');
    expect(states).toEqual(['disconnected', 'connecting', 'ready']);
    unsubscribe();
  });

  it.each(['disconnected', 'connecting', 'ready'] as const)('notifie immédiatement l’état %s et permet le désabonnement', (expected) => {
    if (expected !== 'disconnected') onReady(jest.fn());
    if (expected === 'ready') trigger('connexion.prete');
    const changed = jest.fn();
    const unsubscribe = onConnectionState(changed);
    expect(changed.mock.calls).toEqual([[expected]]);
    unsubscribe();
    trigger('disconnect');
    expect(changed.mock.calls).toEqual([[expected]]);
  });

  it('ne conserve pas un observateur dont la notification initiale lève', () => {
    const failure = new Error('Observateur défaillant');
    const changed = jest.fn(() => { throw failure; });
    expect(() => onConnectionState(changed)).toThrow(failure);
    onReady(jest.fn());
    trigger('connexion.prete');
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('isole les états, les salons et les attentes de deux instances', async () => {
    onReady(jest.fn());
    trigger('connexion.prete');
    await joinRoom('first-room');
    const second = createRealtimeService();
    expect(second.getRealtimeState()).toBe('disconnected');
    expect(() => second.onReady(jest.fn())).toThrow(expect.objectContaining({ kind: 'unauthorized' }));

    const secondListeners = new Map<string, Listener>();
    const secondSocket = {
      ...mockSocket,
      on: jest.fn((event: string, handler: Listener) => { secondListeners.set(event, handler); }),
      removeAllListeners: jest.fn(() => secondListeners.clear()),
      disconnect: jest.fn(),
      emit: jest.fn(),
    };
    mockIo.mockReturnValueOnce(secondSocket);
    second.configureRealtime({ getToken: () => 'second-token', onUnauthorized: jest.fn() });
    const pending = second.joinRoom('second-room');
    const assertion = expect(pending).rejects.toMatchObject({ kind: 'unauthorized' });
    second.disconnectRealtime();
    await assertion;
    expect(secondSocket.emit).not.toHaveBeenCalled();
    expect(secondSocket.disconnect).toHaveBeenCalledTimes(1);
    expect(getRealtimeState()).toBe('ready');
    mockSocket.emit.mockClear();
    await joinRoom('first-room');
    expect(mockSocket.emit).not.toHaveBeenCalled();
    trigger('disconnect');
    trigger('connexion.prete');
    expect(mockSocket.emit).toHaveBeenCalledWith('room-message.join', { roomId: 'first-room' }, expect.any(Function));
    expect(mockSocket.emit).not.toHaveBeenCalledWith('room-message.join', { roomId: 'second-room' }, expect.any(Function));
  });

  it('confirme que le vrai client Socket.IO émet disconnect avant le retour et ne l’émet pas deux fois', () => {
    const { Manager, Socket } = jest.requireActual<typeof import('socket.io-client')>('socket.io-client');
    const manager = new Manager({ autoConnect: false });
    jest.spyOn(manager, '_packet').mockImplementation(() => undefined);
    const current = new Socket(manager, '/messages');
    const order: string[] = [];
    current.on('disconnect', (reason) => order.push(reason));
    current.connected = true;
    current.disconnect();
    order.push('retour');
    current.disconnect();
    expect(order).toEqual(['io client disconnect', 'retour']);
  });

  it('ne masque pas une coupure ultérieure si le renouvellement ne produit aucun événement disconnect', () => {
    onReady(jest.fn());
    const changed = jest.fn();
    onConnectionState(changed);
    mockSocket.disconnect.mockImplementationOnce(() => {
      mockSocket.connected = false;
    });
    configureRealtime({ getToken: () => 'renewed-token', onUnauthorized: jest.fn() });
    expect(mockSocket.connect).toHaveBeenCalledTimes(1);
    trigger('disconnect', 'transport close');
    expect(changed.mock.calls).toEqual([['connecting'], ['disconnected']]);
  });

  it('renouvelle le handshake sans perdre les abonnements ni émettre avant connexion.prete', async () => {
    const handler = jest.fn();
    const ready = jest.fn();
    const changed = jest.fn();
    onConnectionState(changed);
    subscribe('private-message.created', handler);
    onReady(ready);
    trigger('connexion.prete');
    await joinRoom('room-id');
    mockSocket.emit.mockClear();
    changed.mockClear();

    configureRealtime({ getToken: () => 'renewed-token', onUnauthorized: jest.fn() });

    expect(mockSocket.auth).toEqual({ token: 'renewed-token' });
    expect(mockSocket.disconnect).toHaveBeenCalledTimes(1);
    expect(mockSocket.connect).toHaveBeenCalledTimes(1);
    expect(mockIo).toHaveBeenCalledTimes(1);
    expect(mockSocket.emit).not.toHaveBeenCalled();
    expect(getRealtimeState()).not.toBe('ready');
    trigger('connect');
    expect(changed.mock.calls).toEqual([['connecting']]);
    trigger('connexion.prete');
    expect(changed.mock.calls).toEqual([['connecting'], ['ready']]);
    expect(ready).toHaveBeenCalledTimes(2);
    expect(mockSocket.emit).toHaveBeenCalledWith('room-message.join', { roomId: 'room-id' }, expect.any(Function));
    trigger('private-message.created', { id: 'message' });
    expect(handler).toHaveBeenCalledWith({ id: 'message' });
  });

  it('ne reconnecte pas un socket dont le jeton est inchangé', () => {
    subscribe('private-message.created', jest.fn());
    configureRealtime({ getToken: () => 'test-token', onUnauthorized: jest.fn() });
    expect(mockSocket.disconnect).not.toHaveBeenCalled();
    expect(mockSocket.connect).not.toHaveBeenCalled();
  });

  it('notifie la fermeture une seule fois puis oublie les observateurs de la session précédente', () => {
    const changed = jest.fn();
    const ready = jest.fn();
    onConnectionState(changed);
    onReady(ready);
    trigger('connexion.prete');
    changed.mockClear();

    disconnectRealtime();
    expect(changed.mock.calls).toEqual([['disconnected']]);
    changed.mockClear();
    ready.mockClear();
    configureRealtime({ getToken: () => 'new-session-token', onUnauthorized: jest.fn() });
    onReady(jest.fn());
    trigger('connexion.prete');
    expect(changed).not.toHaveBeenCalled();
    expect(ready).not.toHaveBeenCalled();
  });

  it('ne conserve aucun observateur prêt après un échec de création du socket', () => {
    disconnectRealtime();
    const unconfigured = jest.fn();
    expect(() => onReady(unconfigured)).toThrow(expect.objectContaining({ kind: 'unauthorized' }));
    configureRealtime({ getToken: () => null, onUnauthorized: jest.fn() });
    const missingToken = jest.fn();
    expect(() => onReady(missingToken)).toThrow(expect.objectContaining({ kind: 'unauthorized' }));

    configureRealtime({ getToken: () => 'test-token', onUnauthorized: jest.fn() });
    const ready = jest.fn();
    onReady(ready);
    trigger('connexion.prete');
    expect(ready).toHaveBeenCalledTimes(1);
    expect(unconfigured).not.toHaveBeenCalled();
    expect(missingToken).not.toHaveBeenCalled();
  });

  it('notifie tous les observateurs prêts même si le premier ferme la session', () => {
    onReady(disconnectRealtime);
    const ready = jest.fn();
    onReady(ready);
    trigger('connexion.prete');
    expect(ready).toHaveBeenCalledTimes(1);
    expect(getRealtimeState()).toBe('disconnected');
    expect(mockSocket.emit).not.toHaveBeenCalled();
  });

  it('publie une vraie coupure après le renouvellement du jeton', () => {
    onReady(jest.fn());
    trigger('connexion.prete');
    configureRealtime({ getToken: () => 'renewed-token', onUnauthorized: jest.fn() });
    const changed = jest.fn();
    onConnectionState(changed);
    trigger('disconnect');
    expect(changed.mock.calls).toEqual([['connecting'], ['disconnected']]);
  });

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

  it('publie les états de connexion et permet de désabonner les notifications', () => {
    const changed = jest.fn();
    const unsubscribeState = onConnectionState(changed);
    const ready = jest.fn();
    const unsubscribeReady = onReady(ready);
    expect(changed).toHaveBeenLastCalledWith('connecting');
    trigger('connect');
    trigger('connect_error');
    trigger('connexion.prete');
    expect(changed).toHaveBeenLastCalledWith('ready');
    unsubscribeReady();
    unsubscribeState();
    changed.mockClear();
    trigger('disconnect');
    trigger('connexion.prete');
    expect(changed).not.toHaveBeenCalled();
    expect(ready).toHaveBeenCalledTimes(1);
  });

  it('refuse un service non configuré ou une session sans jeton', () => {
    disconnectRealtime();
    expect(() => subscribe('event', jest.fn())).toThrow(expect.objectContaining({ kind: 'unauthorized' }));
    configureRealtime({ getToken: () => null, onUnauthorized: jest.fn() });
    expect(() => subscribe('event', jest.fn())).toThrow(expect.objectContaining({ kind: 'unauthorized' }));
    expect(mockIo).not.toHaveBeenCalled();
  });

  it('rejette un refus de salon sans masquer son erreur', async () => {
    mockSocket.emit.mockImplementationOnce((_event: string, _payload: unknown, ack: (response: unknown) => void) => ack({ joined: false }));
    const joining = joinRoom('denied');
    const assertion = expect(joining).rejects.toMatchObject({ kind: 'forbidden' });
    trigger('connexion.prete');
    await assertion;
  });

  it('déduplique les demandes simultanées et ne rejoint pas deux fois un salon déjà rejoint', async () => {
    subscribe('event', jest.fn());
    trigger('connexion.prete');
    let acknowledge!: (response: unknown) => void;
    mockSocket.emit.mockImplementationOnce((_event: string, _payload: unknown, ack: (response: unknown) => void) => { acknowledge = ack; });
    const first = joinRoom('room');
    const second = joinRoom('room');
    expect(mockSocket.emit).toHaveBeenCalledTimes(1);
    acknowledge({ joined: true });
    await Promise.all([first, second]);
    await joinRoom('room');
    expect(mockSocket.emit).toHaveBeenCalledTimes(1);
  });

  it('rejette l’accusé absent après le délai et ignore un accusé tardif', async () => {
    jest.useFakeTimers();
    subscribe('event', jest.fn());
    trigger('connexion.prete');
    let acknowledge!: (response: unknown) => void;
    mockSocket.emit.mockImplementationOnce((_event: string, _payload: unknown, ack: (response: unknown) => void) => { acknowledge = ack; });
    const pending = joinRoom('timeout');
    const assertion = expect(pending).rejects.toMatchObject({ kind: 'timeout' });
    await jest.advanceTimersByTimeAsync(5_000);
    await assertion;
    acknowledge({ joined: true });
    expect(jest.getTimerCount()).toBe(0);
  });

  it('expire les demandes avant connexion.prete, y compris plusieurs demandes du même salon', async () => {
    jest.useFakeTimers();
    const first = joinRoom('room');
    const second = joinRoom('room');
    const firstAssertion = expect(first).rejects.toMatchObject({ kind: 'timeout' });
    const secondAssertion = expect(second).rejects.toMatchObject({ kind: 'timeout' });
    await jest.advanceTimersByTimeAsync(5_000);
    await Promise.all([firstAssertion, secondAssertion]);
    expect(mockSocket.emit).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('annule l’attente si l’écran quitte le salon avant la connexion et ferme les autres attentes à signOut', async () => {
    const joining = joinRoom('cancelled');
    const assertion = expect(joining).rejects.toMatchObject({ kind: 'timeout' });
    await leaveRoom('cancelled');
    await assertion;
    const remaining = joinRoom('remaining');
    const remainingAssertion = expect(remaining).rejects.toMatchObject({ kind: 'unauthorized' });
    disconnectRealtime();
    await remainingAssertion;
  });

  it('attend une adhésion en cours avant de quitter le salon', async () => {
    subscribe('event', jest.fn());
    trigger('connexion.prete');
    let acknowledge!: (response: unknown) => void;
    mockSocket.emit.mockImplementationOnce((_event: string, _payload: unknown, ack: (response: unknown) => void) => { acknowledge = ack; });
    const joined = joinRoom('room');
    const leaving = leaveRoom('room');
    expect(mockSocket.emit).toHaveBeenCalledTimes(1);
    acknowledge({ joined: true });
    await Promise.all([joined, leaving]);
    expect(mockSocket.emit).toHaveBeenLastCalledWith('room-message.leave', { roomId: 'room' }, expect.any(Function));
  });

  it('annule une ancienne sortie si le salon est rouvert avant la fin de son adhésion', async () => {
    subscribe('event', jest.fn());
    trigger('connexion.prete');
    let acknowledge!: (response: unknown) => void;
    mockSocket.emit.mockImplementationOnce((_event, _payload, ack) => { acknowledge = ack; });
    const first = joinRoom('room');
    const leaving = leaveRoom('room');
    const reopened = joinRoom('room');
    acknowledge({ joined: true });
    await Promise.all([first, leaving, reopened]);
    expect(mockSocket.emit).toHaveBeenCalledTimes(1);
    expect(mockSocket.emit).not.toHaveBeenCalledWith('room-message.leave', expect.anything(), expect.any(Function));
    await joinRoom('room');
    expect(mockSocket.emit).toHaveBeenCalledTimes(1);
  });

  it('ne supprime pas la nouvelle adhésion lorsque l’accusé de sortie arrive tardivement', async () => {
    subscribe('event', jest.fn());
    trigger('connexion.prete');
    await joinRoom('room');
    let acknowledgeLeave!: (response: unknown) => void;
    mockSocket.emit.mockImplementationOnce((_event, _payload, ack) => { acknowledgeLeave = ack; });
    const leaving = leaveRoom('room');
    await joinRoom('room');
    expect(mockSocket.emit.mock.calls.map(([event]) => event)).toEqual([
      'room-message.join', 'room-message.leave', 'room-message.join',
    ]);
    acknowledgeLeave({ left: true });
    await leaving;
    await joinRoom('room');
    expect(mockSocket.emit).toHaveBeenCalledTimes(3);
  });

  it('n’accepte pas un succès d’adhésion de l’ancienne connexion après reconnexion', async () => {
    subscribe('event', jest.fn());
    trigger('connexion.prete');
    const acknowledgements: ((response: unknown) => void)[] = [];
    mockSocket.emit.mockImplementation((_event, _payload, ack) => { acknowledgements.push(ack); });
    const old = joinRoom('room');
    trigger('disconnect');
    trigger('connexion.prete');
    const current = joinRoom('room');
    acknowledgements[0]({ joined: true });
    await old;
    const duplicate = joinRoom('room');
    expect(mockSocket.emit).toHaveBeenCalledTimes(2);
    acknowledgements[1]({ joined: true });
    await Promise.all([current, duplicate]);
    await joinRoom('room');
    expect(mockSocket.emit).toHaveBeenCalledTimes(2);
  });

  it('ne mémorise pas un salon si sa demande échoue avant création du socket', async () => {
    disconnectRealtime();
    await expect(joinRoom('unauthorized-room')).rejects.toMatchObject({ kind: 'unauthorized' });
    configureRealtime({ getToken: () => 'test-token', onUnauthorized: jest.fn() });
    onReady(jest.fn());
    trigger('connexion.prete');
    expect(mockSocket.emit).not.toHaveBeenCalled();
  });

  it('rejette les attentes révoquées et ignore les notifications de révocation invalides', async () => {
    const joining = joinRoom('revoked');
    const assertion = expect(joining).rejects.toMatchObject({ kind: 'forbidden' });
    trigger('room-message.revoked', null);
    trigger('room-message.revoked', {});
    trigger('room-message.revoked', { roomId: 123 });
    trigger('room-message.revoked', { roomId: 'revoked' });
    await assertion;
    trigger('connexion.prete');
    expect(mockSocket.emit).not.toHaveBeenCalled();
  });

  it('ne reconnecte pas une connexion encore active ni au passage en arrière-plan', () => {
    subscribe('event', jest.fn());
    mockSocket.connected = true;
    appStateListener?.('active');
    appStateListener?.('background');
    expect(mockSocket.connect).not.toHaveBeenCalled();
  });

  it.each(['disconnect', 'revoked', 'signOut'] as const)('ignore un accusé tardif après %s et n’émet pas leave sur un salon perdu', async (outcome) => {
    subscribe('event', jest.fn());
    trigger('connexion.prete');
    let acknowledge!: (response: unknown) => void;
    mockSocket.emit.mockImplementationOnce((_event: string, _payload: unknown, ack: (response: unknown) => void) => { acknowledge = ack; });
    const joining = joinRoom('room');
    const leaving = leaveRoom('room');
    if (outcome === 'disconnect') trigger('disconnect');
    else if (outcome === 'revoked') trigger('room-message.revoked', { roomId: 'room' });
    else disconnectRealtime();
    acknowledge({ joined: true });
    await Promise.all([joining, leaving]);
    expect(mockSocket.emit).not.toHaveBeenCalledWith('room-message.leave', { roomId: 'room' }, expect.any(Function));
  });

  it('ignore un échec tardif après déconnexion et permet le nouvel abonnement', async () => {
    subscribe('event', jest.fn());
    trigger('connexion.prete');
    let acknowledge!: (response: unknown) => void;
    mockSocket.emit.mockImplementationOnce((_event: string, _payload: unknown, ack: (response: unknown) => void) => { acknowledge = ack; });
    const old = joinRoom('room');
    const assertion = expect(old).rejects.toMatchObject({ kind: 'forbidden' });
    trigger('disconnect');
    trigger('connexion.prete');
    acknowledge({ joined: false });
    await assertion;
    await joinRoom('room');
    expect(mockSocket.emit).toHaveBeenCalledTimes(2);
  });

  it.each(['disconnect', 'signOut'] as const)('n’émet pas de join si un observateur interrompt la connexion prête (%s)', async (outcome) => {
    jest.useFakeTimers();
    const unsubscribe = onReady(() => {
      if (outcome === 'disconnect') trigger('disconnect');
      else disconnectRealtime();
    });
    const joining = joinRoom('pending-room');
    const assertion = expect(joining).rejects.toMatchObject({ kind: outcome === 'disconnect' ? 'timeout' : 'unauthorized' });
    trigger('connexion.prete');
    unsubscribe();
    await jest.advanceTimersByTimeAsync(5000);
    await assertion;
    expect(mockSocket.emit).not.toHaveBeenCalled();
    expect(getRealtimeState()).toBe('disconnected');
  });
});

describe('websocketService : présence et profil', () => {
  type Ack = (error: Error | null, response?: unknown) => void;
  const presenceEmit = jest.fn();
  let service: RealtimeService;
  beforeEach(() => {
    disconnectRealtime();
    service = createRealtimeService();
    Object.assign(mockSocket, { timeout: jest.fn(() => ({ emit: presenceEmit })) });
    presenceEmit.mockReset();
    service.configureRealtime({ getToken: () => 'test-token', onUnauthorized: jest.fn() });
    // Le socket est créé au premier abonnement.
    service.onReady(jest.fn());
  });
  afterEach(() => service.disconnectRealtime());

  it('refuse le suivi de présence et ignore les publications avant connexion.prete', async () => {
    await expect(service.followPresence(['a'])).rejects.toMatchObject({ kind: 'network' });
    service.publishPresence('en-ligne');
    service.publishProfile();
    expect(mockSocket.emit).not.toHaveBeenCalled();
    expect(presenceEmit).not.toHaveBeenCalled();
  });

  it('suit la présence sans doublon et publie présence et profil une fois prêt', async () => {
    trigger('connexion.prete');
    presenceEmit.mockImplementation((_event: string, _payload: unknown, ack: Ack) => ack(null, { enLigne: ['a'] }));
    await expect(service.followPresence(['a', 'b', 'a'])).resolves.toEqual(['a']);
    expect(presenceEmit).toHaveBeenCalledWith('presence.suivre', { ids: ['a', 'b'] }, expect.any(Function));
    service.publishPresence('hors-ligne');
    service.publishProfile();
    expect(mockSocket.emit).toHaveBeenCalledWith('presence.update', { statut: 'hors-ligne' });
    expect(mockSocket.emit).toHaveBeenCalledWith('profil.update');
  });

  it.each([
    ['une erreur d’accusé', new Error('timeout'), undefined, { message: 'timeout' }],
    ['une réponse sans liste', null, {}, { kind: 'invalid_response' }],
    ['une liste invalide', null, { enLigne: ['a', 1] }, { kind: 'invalid_response' }],
  ])('rejette %s', async (_label, error, response, expected) => {
    trigger('connexion.prete');
    presenceEmit.mockImplementation((_event: string, _payload: unknown, ack: Ack) => ack(error, response));
    await expect(service.followPresence(['a'])).rejects.toMatchObject(expected);
  });
});
