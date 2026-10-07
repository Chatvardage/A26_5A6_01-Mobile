import { useCallback } from 'react';

import { fetchDirectMessages } from '@/services/directMessagesService';
import { apiUnreadSource } from '@/services/unreadService';
import type { UnreadSource } from '@/services/unreadSource';

import { useLoadable } from './useLoadable';

export function useDirectMessages(unread: UnreadSource = apiUnreadSource) {
  const load = useCallback(() => fetchDirectMessages(unread), [unread]);
  return useLoadable(load, (list) => list.length === 0);
}
