jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'fr' }],
  useLocales: () => [{ languageCode: 'fr' }],
}));

jest.mock('@react-native-community/netinfo', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-community/netinfo/jest/netinfo-mock.js'),
);

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  getPermissionsAsync: jest.fn(async () => ({ granted: false, status: 'undetermined', canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: false, status: 'undetermined', canAskAgain: true })),
  scheduleNotificationAsync: jest.fn(async () => 'notification-id'),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponse: jest.fn(() => null),
  setBadgeCountAsync: jest.fn(async () => true),
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
  AndroidImportance: { HIGH: 4 },
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
}));

jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: null })) }));
jest.mock('expo-image-manipulator', () => ({ ImageManipulator: { manipulate: jest.fn() }, SaveFormat: { JPEG: 'jpeg' } }));
