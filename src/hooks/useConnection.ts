import { useEffect, useState, useSyncExternalStore } from 'react';

import { subscribeToNetwork } from '@/adapters/network.adapter';
import { useSession } from '@/session/SessionContext';

export type ConnectionStatus = 'online' | 'reconnecting' | 'offline';

/**
 * État de connexion affiché à l'utilisateur : `offline` quand le système n'a plus de réseau,
 * `reconnecting` quand le réseau est là mais le canal temps réel n'est pas encore prêt,
 * `online` quand le canal est prêt.
 */
export function useConnection(): { status: ConnectionStatus; online: boolean } {
  const { getRealtimeState, onConnectionState } = useSession().realtime;
  const [networkOnline, setNetworkOnline] = useState(true);
  const realtime = useSyncExternalStore(onConnectionState, getRealtimeState, getRealtimeState);

  useEffect(() => subscribeToNetwork(setNetworkOnline), []);

  const status: ConnectionStatus = !networkOnline ? 'offline' : realtime === 'ready' ? 'online' : 'reconnecting';
  return { status, online: status === 'online' };
}
