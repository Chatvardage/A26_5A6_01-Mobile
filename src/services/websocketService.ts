import { AppState, type AppStateStatus } from 'react-native';
import { io, type Socket } from 'socket.io-client';

import { API_URL } from '@/config/env';

import { ApiError } from './ApiError';

export type RealtimeState = 'connecting' | 'ready' | 'disconnected';
type TokenProvider = () => string | null;
type RealtimeOptions = { getToken: TokenProvider; onUnauthorized: () => void };
type MessageHandler = (payload: unknown) => void;
type ReadyHandler = () => void;
type StateHandler = (state: RealtimeState) => void;
type RoomWaiter = { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };

const ACK_TIMEOUT_MS = 5_000;

export type RealtimeService = ReturnType<typeof createRealtimeService>;

export function createRealtimeService() {
  let options: RealtimeOptions | null = null;
  let socket: Socket | null = null;
  let state: RealtimeState = 'disconnected';
  let refreshingToken = false;
  let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
  const rooms = new Set<string>();
  const joinedRooms = new Set<string>();
  const roomEpochs = new Map<string, number>();
  const joiningRooms = new Map<string, Promise<void>>();
  const roomWaiters = new Map<string, RoomWaiter[]>();
  const readyHandlers = new Set<ReadyHandler>();
  const stateHandlers = new Set<StateHandler>();

  function setState(next: RealtimeState) {
    if (state === next) return;
    state = next;
    for (const handler of [...stateHandlers]) handler(next);
  }

  function requireSocket(): Socket {
    if (socket) return socket;
    if (!options) throw new ApiError('unauthorized', 'Service temps réel non configuré');
    const token = options.getToken();
    if (!token) throw new ApiError('unauthorized', 'Session absente');

    setState('connecting');
    const current = io(`${API_URL}/messages`, {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket'],
    });
    socket = current;

    current.on('connect', () => setState('connecting'));
    current.on('disconnect', () => {
      joinedRooms.clear();
      joiningRooms.clear();
      if (!refreshingToken) setState('disconnected');
    });
    current.on('connect_error', () => setState('connecting'));
    current.on('connexion.prete', () => {
      setState('ready');
      for (const handler of [...readyHandlers]) handler();
      if (socket !== current || state !== 'ready') return;
      for (const roomId of rooms) {
        void startJoin(roomId, current);
      }
    });
    current.on('room-message.revoked', (payload: unknown) => {
      if (typeof payload === 'object' && payload !== null && 'roomId' in payload) {
        const roomId = (payload as { roomId?: unknown }).roomId;
        if (typeof roomId === 'string') {
          roomEpochs.set(roomId, (roomEpochs.get(roomId) ?? 0) + 1);
          rooms.delete(roomId);
          joinedRooms.delete(roomId);
          joiningRooms.delete(roomId);
          settleRoomWaiters(roomId, new ApiError('forbidden', 'Accès au salon révoqué'));
        }
      }
    });
    current.on('session.revoquee', () => {
      setState('disconnected');
      current.disconnect();
      options?.onUnauthorized();
    });

    appStateSubscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active' && socket === current && !current.connected) current.connect();
    });
    return current;
  }

  function emitRoomEvent(roomId: string, event: 'room-message.join' | 'room-message.leave'): Promise<void> {
    const current = requireSocket();
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => finish(new ApiError('timeout', 'Accusé de réception Socket.IO expiré')), ACK_TIMEOUT_MS);
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve();
      };
      current.emit(event, { roomId }, (response: unknown) => {
        const acknowledged =
          typeof response === 'object' && response !== null && 'joined' in response && (response as { joined: unknown }).joined === true;
        if (event === 'room-message.join' && !acknowledged) {
          finish(new ApiError('forbidden', 'Accès au salon refusé'));
        } else {
          finish();
        }
      });
    });
  }

  function startJoin(roomId: string, owner: Socket): Promise<void> {
    if (joinedRooms.has(roomId)) return Promise.resolve();
    const existing = joiningRooms.get(roomId);
    if (existing) return existing;

    const roomEpoch = roomEpochs.get(roomId) ?? 0;
    const pending = emitRoomEvent(roomId, 'room-message.join').then(() => {
      if (socket === owner && state === 'ready' && joiningRooms.get(roomId) === pending &&
          (roomEpochs.get(roomId) ?? 0) === roomEpoch) joinedRooms.add(roomId);
    });
    joiningRooms.set(roomId, pending);
    pending.then(
      () => {
        if (joiningRooms.get(roomId) !== pending) return;
        joiningRooms.delete(roomId);
        settleRoomWaiters(roomId);
      },
      (error: Error) => {
        if (joiningRooms.get(roomId) !== pending) return;
        joiningRooms.delete(roomId);
        settleRoomWaiters(roomId, error);
      },
    );
    return pending;
  }

  function settleRoomWaiters(roomId: string, error?: Error) {
    for (const waiter of roomWaiters.get(roomId) ?? []) {
      clearTimeout(waiter.timer);
      if (error) waiter.reject(error);
      else waiter.resolve();
    }
    roomWaiters.delete(roomId);
  }

  function configureRealtime(configuration: RealtimeOptions) {
    options = configuration;
    if (socket && typeof socket.auth === 'object') {
      const token = configuration.getToken();
      if (token && socket.auth.token !== token) {
        socket.auth = { token };
        joinedRooms.clear();
        joiningRooms.clear();
        setState('connecting');
        refreshingToken = true;
        try {
          // Socket.IO émet « disconnect » synchroniquement, uniquement si le socket est connecté.
          socket.disconnect();
          socket.connect();
        } finally {
          refreshingToken = false;
        }
      }
    }
  }

  function getRealtimeState(): RealtimeState {
    return state;
  }

  function onConnectionState(handler: StateHandler): () => void {
    stateHandlers.add(handler);
    try {
      handler(state);
    } catch (error) {
      stateHandlers.delete(handler);
      throw error;
    }
    return () => stateHandlers.delete(handler);
  }

  /** Appelé à chaque connexion protocolaire prête, y compris après une reconnexion. */
  function onReady(handler: ReadyHandler): () => void {
    requireSocket();
    readyHandlers.add(handler);
    return () => readyHandlers.delete(handler);
  }

  function subscribe(event: string, handler: MessageHandler): () => void {
    const current = requireSocket();
    current.on(event, handler);
    return () => current.off(event, handler);
  }

  async function joinRoom(roomId: string): Promise<void> {
    const current = requireSocket();
    rooms.add(roomId);
    if (state === 'ready') return startJoin(roomId, current);
    return new Promise((resolve, reject) => {
      const waiters = roomWaiters.get(roomId) ?? [];
      const timer = setTimeout(() => {
        waiters.splice(waiters.findIndex((waiter) => waiter.timer === timer), 1);
        if (!waiters.length) roomWaiters.delete(roomId);
        reject(new ApiError('timeout', 'Connexion temps réel non prête'));
      }, ACK_TIMEOUT_MS);
      waiters.push({ resolve, reject, timer });
      roomWaiters.set(roomId, waiters);
    });
  }

  async function leaveRoom(roomId: string): Promise<void> {
    rooms.delete(roomId);
    const pending = joiningRooms.get(roomId);
    if (!pending && !joinedRooms.has(roomId)) {
      settleRoomWaiters(roomId, new ApiError('timeout', 'Abonnement au salon annulé'));
      return;
    }
    if (pending) await pending;
    if (rooms.has(roomId)) return;
    if (state !== 'ready' || !joinedRooms.has(roomId)) return;
    joinedRooms.delete(roomId);
    await emitRoomEvent(roomId, 'room-message.leave');
  }

  function disconnectRealtime() {
    appStateSubscription?.remove();
    appStateSubscription = null;
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
    }
    socket = null;
    rooms.clear();
    joinedRooms.clear();
    roomEpochs.clear();
    joiningRooms.clear();
    for (const roomId of roomWaiters.keys()) {
      settleRoomWaiters(roomId, new ApiError('unauthorized', 'Connexion temps réel fermée'));
    }
    roomWaiters.clear();
    readyHandlers.clear();
    setState('disconnected');
    stateHandlers.clear();
    options = null;
  }

  return {
    configureRealtime,
    getRealtimeState,
    onConnectionState,
    onReady,
    subscribe,
    joinRoom,
    leaveRoom,
    disconnectRealtime,
  };
}
