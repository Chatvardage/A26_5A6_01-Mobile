import NetInfo from '@react-native-community/netinfo';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';

import { isOnline, subscribeToNetwork } from '@/adapters/network.adapter';
import {
  configureNotifications,
  getLaunchTap,
  getPermission,
  onNotificationOpened,
  openSystemSettings,
  requestPermission,
  resetNotificationsModuleForTests,
  setAppBadge,
  showMessageNotification,
} from '@/adapters/notifications.adapter';

const N = jest.mocked(Notifications);
const setPlatform = (os: string) => Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });

beforeEach(() => {
  jest.clearAllMocks();
  resetNotificationsModuleForTests();
});
afterEach(() => {
  setPlatform('ios');
  jest.restoreAllMocks();
});

describe('réseau', () => {
  it('considère hors ligne seulement un état explicitement faux', () => {
    expect(isOnline({ isConnected: true, isInternetReachable: true })).toBe(true);
    expect(isOnline({ isConnected: null, isInternetReachable: null })).toBe(true);
    expect(isOnline({ isConnected: false, isInternetReachable: null })).toBe(false);
    expect(isOnline({ isConnected: true, isInternetReachable: false })).toBe(false);
  });

  it('transmet les changements et se désabonne', () => {
    const unsubscribe = jest.fn();
    let emit: (state: { isConnected: boolean | null; isInternetReachable: boolean | null }) => void = () => undefined;
    jest.mocked(NetInfo.addEventListener).mockImplementation(((listener: typeof emit) => {
      emit = listener;
      return unsubscribe;
    }) as unknown as typeof NetInfo.addEventListener);
    const listener = jest.fn();
    const off = subscribeToNetwork(listener);
    emit({ isConnected: false, isInternetReachable: false });
    emit({ isConnected: true, isInternetReachable: true });
    expect(listener.mock.calls).toEqual([[false], [true]]);
    off();
    expect(unsubscribe).toHaveBeenCalled();
  });
});

describe('notifications', () => {
  it('configure le gestionnaire et le canal Android', async () => {
    setPlatform('android');
    await configureNotifications();
    expect(N.setNotificationHandler).toHaveBeenCalled();
    const handler = N.setNotificationHandler.mock.calls[0][0]!;
    await expect(handler.handleNotification({} as never)).resolves.toMatchObject({ shouldShowBanner: true, shouldSetBadge: false });
    expect(N.setNotificationChannelAsync).toHaveBeenCalledWith('messages', expect.objectContaining({ name: 'Messages' }));
  });

  it("n'a pas de canal sur iOS, ne fait rien sur le web et avale une panne du module", async () => {
    await configureNotifications();
    expect(N.setNotificationChannelAsync).not.toHaveBeenCalled();
    N.setNotificationHandler.mockClear();
    setPlatform('web');
    resetNotificationsModuleForTests();
    await configureNotifications();
    expect(N.setNotificationHandler).not.toHaveBeenCalled();
    setPlatform('ios');
    resetNotificationsModuleForTests();
    N.setNotificationHandler.mockImplementationOnce(() => {
      throw new Error('module absent');
    });
    await expect(configureNotifications()).resolves.toBeUndefined();
  });

  it("ne charge pas expo-notifications dans Expo Go sur Android : tout est indisponible", async () => {
    setPlatform('android');
    jest.replaceProperty(Constants, 'executionEnvironment', 'storeClient' as never);
    await configureNotifications();
    expect(N.setNotificationHandler).not.toHaveBeenCalled();
    expect(await getPermission()).toBe('unavailable');
    expect(await requestPermission()).toBe('unavailable');
    expect(await showMessageNotification({ conversationId: 'dm:a', title: 't', body: 'b' })).toBe(false);
    expect(onNotificationOpened(jest.fn())()).toBeUndefined();
    expect(await getLaunchTap()).toBeNull();
    await expect(setAppBadge(1)).resolves.toBeUndefined();
    expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("reste indisponible si le module ne peut pas être chargé", async () => {
    resetNotificationsModuleForTests(() => {
      throw new Error('module natif absent');
    });
    expect(await getPermission()).toBe('unavailable');
    expect(await getPermission()).toBe('unavailable');
  });

  it.each([
    [{ granted: true, status: 'granted' }, 'granted'],
    [{ granted: false, status: 'undetermined' }, 'undetermined'],
    [{ granted: false, status: 'denied' }, 'denied'],
  ])('traduit la permission %p en %s', async (raw, expected) => {
    N.getPermissionsAsync.mockResolvedValueOnce(raw as never);
    expect(await getPermission()).toBe(expected);
    N.requestPermissionsAsync.mockResolvedValueOnce(raw as never);
    expect(await requestPermission()).toBe(expected);
  });

  it('signale la permission indisponible sur le web ou en cas de panne', async () => {
    N.getPermissionsAsync.mockRejectedValueOnce(new Error('x'));
    expect(await getPermission()).toBe('unavailable');
    N.requestPermissionsAsync.mockRejectedValueOnce(new Error('x'));
    expect(await requestPermission()).toBe('unavailable');
    setPlatform('web');
    resetNotificationsModuleForTests();
    expect(await getPermission()).toBe('unavailable');
    expect(await requestPermission()).toBe('unavailable');
  });

  it('ouvre les réglages du système, même en cas d\'échec', async () => {
    const open = jest.spyOn(Linking, 'openSettings').mockResolvedValueOnce();
    await openSystemSettings();
    expect(open).toHaveBeenCalled();
    open.mockRejectedValueOnce(new Error('x'));
    await expect(openSystemSettings()).resolves.toBeUndefined();
  });

  it("présente une notification locale avec le seul identifiant de conversation", async () => {
    expect(await showMessageNotification({ conversationId: 'dm:a', title: 'oli', body: 'Nouveau message' })).toBe(true);
    expect(N.scheduleNotificationAsync).toHaveBeenCalledWith({
      content: { title: 'oli', body: 'Nouveau message', data: { conversationId: 'dm:a' } },
      trigger: null,
    });
    setPlatform('android');
    await showMessageNotification({ conversationId: 'dm:a', title: 'oli', body: 'x' });
    expect(N.scheduleNotificationAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({ trigger: { channelId: 'messages' } }),
    );
    N.scheduleNotificationAsync.mockRejectedValueOnce(new Error('x'));
    expect(await showMessageNotification({ conversationId: 'dm:a', title: 't', body: 'b' })).toBe(false);
  });

  const response = (data: unknown, action = 'expo.modules.notifications.actions.DEFAULT') =>
    ({ actionIdentifier: action, notification: { request: { identifier: 'n1', content: { data } } } }) as never;

  it('transmet le toucher d\'une notification et se désabonne', () => {
    const remove = jest.fn();
    let listener: (r: never) => void = () => undefined;
    N.addNotificationResponseReceivedListener.mockImplementationOnce(((l: typeof listener) => {
      listener = l;
      return { remove };
    }) as never);
    const handler = jest.fn();
    const off = onNotificationOpened(handler);
    listener(response({ conversationId: 'dm:a' }));
    listener(response({ conversationId: 3 }));
    listener(response(undefined));
    listener(response({ conversationId: 'dm:a' }, 'autre'));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ id: 'n1', conversationId: 'dm:a' });
    off();
    expect(remove).toHaveBeenCalled();
  });

  it("survit à un module indisponible lors de l'abonnement", () => {
    N.addNotificationResponseReceivedListener.mockImplementationOnce(() => {
      throw new Error('x');
    });
    expect(() => onNotificationOpened(jest.fn())()).not.toThrow();
  });

  it('lit la notification qui a lancé l\'application', async () => {
    expect(await getLaunchTap()).toBeNull();
    N.getLastNotificationResponse.mockReturnValueOnce(response({ conversationId: 'room:b' }));
    expect(await getLaunchTap()).toEqual({ id: 'n1', conversationId: 'room:b' });
    N.getLastNotificationResponse.mockImplementationOnce(() => {
      throw new Error('x');
    });
    expect(await getLaunchTap()).toBeNull();
  });

  it("met à jour le badge de l'icône sans jamais échouer", async () => {
    await setAppBadge(3);
    expect(N.setBadgeCountAsync).toHaveBeenCalledWith(3);
    N.setBadgeCountAsync.mockRejectedValueOnce(new Error('x'));
    await expect(setAppBadge(0)).resolves.toBeUndefined();
  });
});
