import { useEffect } from 'react';

import { getLaunchTap, onNotificationOpened, type Tap } from '@/adapters/notifications.adapter';

let lastHandledTap: string | null = null;

/**
 * Toucher d'une notification : transmet l'identifiant de conversation à `open` (qui le valide avant
 * de naviguer), ou appelle `openInvitations` pour une invitation à un serveur. Couvre l'application déjà ouverte et le lancement à froid ; une même notification
 * n'est traitée qu'une fois.
 */
export function useNotificationNavigation(open: (conversationId: string) => void, openInvitations?: () => void) {
  useEffect(() => {
    let cancelled = false;
    const handle = (tap: Tap) => {
      if (cancelled || tap.id === lastHandledTap) return;
      lastHandledTap = tap.id;
      if ('invitations' in tap) openInvitations?.();
      else open(tap.conversationId);
    };
    const off = onNotificationOpened(handle);
    void getLaunchTap().then((tap) => (tap ? handle(tap) : undefined));
    return () => {
      cancelled = true;
      off();
    };
  }, [open, openInvitations]);
}

export function resetNotificationNavigationForTests() {
  lastHandledTap = null;
}
