import Constants, { ExecutionEnvironment } from 'expo-constants';
import type * as NotificationsModule from 'expo-notifications';
import { Linking, Platform } from 'react-native';

type Notifications = typeof NotificationsModule;

/**
 * Seul module qui connaît expo-notifications : permissions, notification locale et toucher.
 * `unavailable` : la plateforme (web) ou le module natif ne permet pas de notifier.
 * Le contenu d'un message privé ne passe jamais par ici : seul l'identifiant de conversation
 * voyage dans la notification.
 */
export type NotificationPermission = 'granted' | 'denied' | 'undetermined' | 'unavailable';

const CHANNEL_ID = 'messages';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const defaultLoader = () => require('expo-notifications') as Notifications;

function toPermission(N: Notifications, result: NotificationsModule.NotificationPermissionsStatus): NotificationPermission {
  if (result.granted) return 'granted';
  return result.status === N.PermissionStatus.UNDETERMINED ? 'undetermined' : 'denied';
}

type Tap = { id: string; conversationId: string };

function toTap(N: Notifications, response: NotificationsModule.NotificationResponse | null | undefined): Tap | null {
  if (!response || response.actionIdentifier !== N.DEFAULT_ACTION_IDENTIFIER) return null;
  const conversationId = (response.notification.request.content.data as { conversationId?: unknown } | undefined)
    ?.conversationId;
  if (typeof conversationId !== 'string') return null;
  return { id: response.notification.request.identifier, conversationId };
}

export function openSystemSettings(): Promise<void> {
  return Linking.openSettings().catch(() => undefined);
}

/**
 * Crée l'adaptateur autour d'une fonction de chargement du module `expo-notifications`. Le module n'est chargé
 * qu'à la première utilisation, jamais dans Expo Go sur Android (SDK 53+) où son simple import lève une erreur
 * (le push y a été retiré) : les notifications sont alors `unavailable`. Une development build est nécessaire
 * pour les tester sur Android. La fonction de chargement est un paramètre pour pouvoir simuler un module absent.
 */
export function createNotificationsAdapter(loadModule: () => Notifications = defaultLoader) {
  let cached: Notifications | null | undefined;

  function notifications(): Notifications | null {
    if (cached !== undefined) return cached;
    const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
    if (Platform.OS === 'web' || (Platform.OS === 'android' && inExpoGo)) return (cached = null);
    try {
      cached = loadModule();
    } catch {
      cached = null;
    }
    return cached;
  }

  /** À appeler une fois au démarrage : affichage en premier plan et canal Android. */
  async function configureNotifications(): Promise<void> {
    const N = notifications();
    if (!N) return;
    try {
      N.setNotificationHandler({
        handleNotification: async () => ({
          shouldPlaySound: false,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
      if (Platform.OS === 'android') {
        await N.setNotificationChannelAsync(CHANNEL_ID, { name: 'Messages', importance: N.AndroidImportance.HIGH });
      }
    } catch {
      // Module indisponible : getPermission() le signalera.
    }
  }

  async function getPermission(): Promise<NotificationPermission> {
    const N = notifications();
    if (!N) return 'unavailable';
    try {
      return toPermission(N, await N.getPermissionsAsync());
    } catch {
      return 'unavailable';
    }
  }

  async function requestPermission(): Promise<NotificationPermission> {
    const N = notifications();
    if (!N) return 'unavailable';
    try {
      return toPermission(N, await N.requestPermissionsAsync());
    } catch {
      return 'unavailable';
    }
  }

  /** Notification locale immédiate. Retourne `false` si elle n'a pas pu être présentée. */
  async function showMessageNotification(input: {
    conversationId: string;
    title: string;
    body: string;
  }): Promise<boolean> {
    const N = notifications();
    if (!N) return false;
    try {
      await N.scheduleNotificationAsync({
        content: { title: input.title, body: input.body, data: { conversationId: input.conversationId } },
        trigger: Platform.OS === 'android' ? { channelId: CHANNEL_ID } : null,
      });
      return true;
    } catch {
      return false;
    }
  }

  /** Toucher d'une notification pendant que l'application tourne ; retourne le désabonnement. */
  function onNotificationOpened(handler: (tap: Tap) => void): () => void {
    const N = notifications();
    if (!N) return () => undefined;
    try {
      const subscription = N.addNotificationResponseReceivedListener((response) => {
        const tap = toTap(N, response);
        if (tap) handler(tap);
      });
      return () => subscription.remove();
    } catch {
      return () => undefined;
    }
  }

  /** Notification qui a lancé l'application à froid, s'il y en a une. */
  async function getLaunchTap(): Promise<Tap | null> {
    const N = notifications();
    if (!N) return null;
    try {
      return toTap(N, await N.getLastNotificationResponse());
    } catch {
      return null;
    }
  }

  /** Badge de l'icône : un échec (permission refusée, lanceur incompatible) n'a aucune importance. */
  async function setAppBadge(count: number): Promise<void> {
    const N = notifications();
    if (!N) return;
    try {
      await N.setBadgeCountAsync(count);
    } catch {
      // Le badge dans l'application reste la référence.
    }
  }

  return { configureNotifications, getPermission, requestPermission, showMessageNotification, onNotificationOpened, getLaunchTap, setAppBadge };
}

// Instance de l'application : le module est chargé au premier appel.
export const {
  configureNotifications,
  getPermission,
  requestPermission,
  showMessageNotification,
  onNotificationOpened,
  getLaunchTap,
  setAppBadge,
} = createNotificationsAdapter();
