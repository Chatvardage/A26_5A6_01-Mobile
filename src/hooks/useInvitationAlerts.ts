import { useEffect, useRef } from 'react';

import { getPermission, showInvitationNotification } from '@/adapters/notifications.adapter';
import { useProfile } from '@/profile/ProfileContext';
import { useTranslation } from '@/i18n';
import { getInvitations } from '@/services/rooms.service';
import { useSession } from '@/session/SessionContext';

/** Invitation reçue par `userId` dans un `serveur.change` ; l'identifiant du serveur, sinon `null`. */
export function parseInvitation(raw: unknown, userId: string): string | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const event = raw as Record<string, unknown>;
  if (event.raison !== 'invitation' || event.cibleId !== userId || typeof event.serveurId !== 'string') return null;
  return event.serveurId;
}

/**
 * Invitation à un serveur reçue en temps réel (Room-Service → `serveur.change`, raison `invitation`, visant
 * l'utilisateur) : notification locale avec le nom du serveur, en mode « Notifications système » et si la
 * permission est accordée, comme pour les messages. La liste des invitations se met à jour d'elle-même
 * (`useRefreshOnServerChange`).
 */
export function useInvitationAlerts(userId: string) {
  const { subscribe } = useSession().realtime;
  const { strings } = useTranslation();
  const mode = useProfile().profile?.modeNotification;
  const granted = useRef(false);

  useEffect(() => {
    if (mode !== 'systeme') return undefined;
    let alive = true;
    const notify = async (serverId: string) => {
      if (!granted.current) {
        granted.current = (await getPermission()) === 'granted';
        if (!granted.current) return;
      }
      // Le nom vient de mes invitations : l'invité n'est pas membre et ne peut pas lire le serveur.
      const invitation = (await getInvitations().catch(() => [])).find(item => item.serveur.id === serverId);
      if (!alive) return;
      await showInvitationNotification({
        title: strings.notifications.newInvitation,
        body: invitation ? strings.notifications.invitedTo(invitation.serveur.nom) : strings.notifications.invitedToServer,
      });
    };
    try {
      const off = subscribe('serveur.change', (raw) => {
        const serverId = parseInvitation(raw, userId);
        if (serverId) void notify(serverId);
      });
      return () => {
        alive = false;
        off();
      };
    } catch {
      return undefined;
    }
  }, [userId, strings, subscribe, mode]);
}
