import { useCallback } from 'react';

import { fetchServerChannels } from '@/services/serversService';
import type { UnreadSource } from '@/services/unreadSource';

import { useLoadable } from './useLoadable';

export function useServerChannels(serverId: string, unread?: UnreadSource) {
  const load = useCallback(() => fetchServerChannels(serverId, unread), [serverId, unread]);
  return useLoadable(load, (server) => server.channels.length === 0);
}
