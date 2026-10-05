jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'fr' }],
  useLocales: () => [{ languageCode: 'fr' }],
}));
