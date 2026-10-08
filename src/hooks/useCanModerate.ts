import { useCallback } from 'react';

import { fetchCanModerate } from '@/services/serversService';

import { useLoadable } from './useLoadable';
import { useRefreshOnServerChange } from './useRefreshOnServerChange';

/**
 * Vrai quand l'utilisateur peut supprimer les messages des autres dans cette conversation (modérateur,
 * propriétaire ou administrateur d'un salon). Faux pour un message privé, pendant le chargement et en cas
 * d'échec : la modération n'est alors simplement pas proposée (l'API refuserait de toute façon). Le rôle est
 * relu quand Room-Service signale un changement de serveur (nomination, retrait, expulsion).
 */
export function useCanModerate(conversationId: string): boolean {
  const load = useCallback(() => fetchCanModerate(conversationId), [conversationId]);
  const { state, refresh } = useLoadable(load, () => false);
  useRefreshOnServerChange(refresh);
  return state.status === 'ready' && state.data;
}
