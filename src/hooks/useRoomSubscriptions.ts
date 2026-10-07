import { useEffect } from 'react';

import { fetchServers } from '@/services/serversService';
import { joinRoom, onReady, subscribe } from '@/services/websocketService';

const REJOIN_DELAY_MS = 800;

/**
 * Rejoint les salons accessibles pour recevoir leurs nouveaux messages (notification, badge) même
 * quand leur conversation n'est pas ouverte. Les messages privés n'ont pas besoin de cet abonnement.
 * Le service temps réel rejoint de nouveau ces salons après chaque reconnexion ; on rejoint aussi
 * après chaque changement de conversation, car quitter l'écran d'un salon quitte sa room.
 */
export function useRoomSubscriptions(activeConversationId: string | null) {
  useEffect(() => {
    let cancelled = false;
    const join = () => {
      fetchServers()
        .then((servers) => {
          if (cancelled) return;
          for (const channelId of servers.flatMap((server) => server.channelIds)) {
            joinRoom(channelId).catch(() => undefined);
          }
        })
        .catch(() => undefined);
    };

    const timer = setTimeout(join, REJOIN_DELAY_MS);
    let offReady: () => void = () => undefined;
    let offChange: () => void = () => undefined;
    try {
      offReady = onReady(join);
      // Salon créé ou accès modifié : on rejoint les nouveaux salons pour leurs alertes.
      offChange = subscribe('serveur.change', join);
    } catch {
      // Session absente : rien à rejoindre.
    }
    return () => {
      cancelled = true;
      clearTimeout(timer);
      offReady();
      offChange();
    };
  }, [activeConversationId]);
}
