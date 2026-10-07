import { useCallback } from 'react';

import { fetchServers } from '@/services/serversService';
import { apiUnreadSource } from '@/services/unreadService';
import type { UnreadSource } from '@/services/unreadSource';

import { useLoadable } from './useLoadable';

export function useServers(unread: UnreadSource = apiUnreadSource) {
  const load = useCallback(() => fetchServers(unread), [unread]);
  return useLoadable(load, (list) => list.length === 0);
}
