import { useCallback, useEffect } from 'react';
import type { NavigationContainerRefWithCurrent } from '@react-navigation/native';

import { configureNotifications, getPermission, requestPermission } from '@/adapters/notifications.adapter';
import { useMessageAlerts } from '@/hooks/useMessageAlerts';
import { useNotificationNavigation } from '@/hooks/useNotificationNavigation';
import { useRoomSubscriptions } from '@/hooks/useRoomSubscriptions';
import { parseConversationParams, Routes, type RootStackParamList } from '@/navigation/routes';

type Props = {
  userId: string;
  activeConversationId: string | null;
  navigationRef: NavigationContainerRefWithCurrent<RootStackParamList>;
};

/**
 * Services d'arrière-plan d'une session ouverte (sans rendu) : permission de notification, abonnement
 * aux salons, alertes de nouveaux messages et ouverture de la bonne conversation au toucher.
 */
export function AppServices({ userId, activeConversationId, navigationRef }: Props) {
  useEffect(() => {
    void configureNotifications().then(async () => {
      // Une seule demande, au premier lancement : un refus n'est pas redemandé automatiquement.
      if ((await getPermission()) === 'undetermined') await requestPermission();
    });
  }, []);

  useMessageAlerts(userId, activeConversationId);
  useRoomSubscriptions(activeConversationId);

  const open = useCallback(
    (conversationId: string) => {
      // Identifiant validé avant de naviguer ; le payload ne contient rien d'autre.
      const params = parseConversationParams({ conversationId });
      if (params && navigationRef.isReady()) navigationRef.navigate(Routes.Conversation, params);
    },
    [navigationRef],
  );
  useNotificationNavigation(open);
  return null;
}
