import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { getPermission, showInvitationNotification } from '@/adapters/notifications.adapter';
import { useProfile } from '@/profile/ProfileContext';
import { useTranslation } from '@/i18n';
import { getInvitations } from '@/services/rooms.service';
import { useSession } from '@/session/SessionContext';

/** Durée d'affichage du bandeau d'invitation dans l'application. */
export const INVITATION_BANNER_MS = 8000;

export type ReceivedInvitation = { serverId: string; name: string | null };

/** Invitation reçue par `userId` dans un `serveur.change` ; l'identifiant du serveur, sinon `null`. */
export function parseInvitation(raw: unknown, userId: string): string | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const event = raw as Record<string, unknown>;
  if (event.raison !== 'invitation' || event.cibleId !== userId || typeof event.serveurId !== 'string') return null;
  return event.serveurId;
}

/**
 * Invitation à un serveur reçue en temps réel (Room-Service → `serveur.change`, raison `invitation`, visant
 * l'utilisateur) :
 * - application au premier plan : bandeau dans l'application (`invitation`), qui fonctionne aussi sur le Web
 *   et dans Expo Go, où les notifications système sont indisponibles ;
 * - en arrière-plan : notification locale, en mode « Notifications système » et si la permission est accordée.
 * Mode « Aucune alerte » : rien. La liste des invitations se met à jour d'elle-même (`useRefreshOnServerChange`).
 */
export function useInvitationAlerts(userId: string) {
  const { subscribe } = useSession().realtime;
  const { strings } = useTranslation();
  const mode = useProfile().profile?.modeNotification;
  const granted = useRef(false);
  const [invitation, setInvitation] = useState<ReceivedInvitation | null>(null);
  const dismiss = useCallback(() => setInvitation(null), []);

  useEffect(() => {
    if (!invitation) return undefined;
    const timer = setTimeout(dismiss, INVITATION_BANNER_MS);
    return () => clearTimeout(timer);
  }, [invitation, dismiss]);

  useEffect(() => {
    if (!mode || mode === 'aucune') return undefined;
    let alive = true;
    const announce = async (serverId: string) => {
      // Le nom vient de mes invitations : l'invité n'est pas membre et ne peut pas lire le serveur.
      const found = (await getInvitations().catch(() => [])).find(item => item.serveur.id === serverId);
      const name = found?.serveur.nom ?? null;
      if (!alive) return;
      if (AppState.currentState === 'active') {
        setInvitation({ serverId, name });
        return;
      }
      if (mode !== 'systeme') return;
      if (!granted.current) {
        granted.current = (await getPermission()) === 'granted';
        if (!granted.current || !alive) return;
      }
      await showInvitationNotification({
        title: strings.notifications.newInvitation,
        body: name ? strings.notifications.invitedTo(name) : strings.notifications.invitedToServer,
      });
    };
    try {
      const off = subscribe('serveur.change', (raw) => {
        const serverId = parseInvitation(raw, userId);
        if (serverId) void announce(serverId);
      });
      return () => {
        alive = false;
        off();
      };
    } catch {
      return undefined;
    }
  }, [userId, strings, subscribe, mode]);

  return { invitation, dismiss };
}
