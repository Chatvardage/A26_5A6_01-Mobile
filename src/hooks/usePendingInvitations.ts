import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { useInvitations } from '@/unread/InvitationsContext';

/** Nombre d'invitations en attente pour un écran : relu aussi quand l'écran reprend le focus. */
export function usePendingInvitations(): number {
  const { count, refresh } = useInvitations();
  useRefreshOnFocus(refresh);
  return count;
}
