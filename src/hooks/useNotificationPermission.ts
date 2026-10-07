import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import {
  getPermission,
  openSystemSettings,
  requestPermission,
  type NotificationPermission,
} from '@/adapters/notifications.adapter';

/** Permission de notification courante ; relue au retour des réglages du système. */
export function useNotificationPermission() {
  const [permission, setPermission] = useState<NotificationPermission | null>(null);

  useEffect(() => {
    let alive = true;
    const read = () =>
      void getPermission().then((value) => {
        if (alive) setPermission(value);
      });
    read();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') read();
    });
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);

  const request = useCallback(async () => {
    const value = await requestPermission();
    setPermission(value);
    return value;
  }, []);

  return { permission, request, openSettings: openSystemSettings };
}
