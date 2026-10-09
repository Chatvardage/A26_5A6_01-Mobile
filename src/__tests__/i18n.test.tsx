import { render, screen } from '@testing-library/react-native';
import { useLocales } from 'expo-localization';
import { Text } from 'react-native';
import { en, fr, getTranslations, I18nProvider, resolveLocale, useTranslation } from '@/i18n';

jest.mock('expo-localization', () => ({
  getLocales: () => [],
  useLocales: jest.fn(() => []),
}));

const frenchLocale: ReturnType<typeof useLocales>[number] = {
  languageTag: 'fr-CA',
  languageCode: 'fr',
  languageScriptCode: 'Latn',
  regionCode: 'CA',
  languageRegionCode: 'CA',
  currencyCode: 'CAD',
  currencySymbol: '$',
  languageCurrencyCode: 'CAD',
  languageCurrencySymbol: '$',
  decimalSeparator: ',',
  digitGroupingSeparator: ' ',
  textDirection: 'ltr',
  measurementSystem: 'metric',
  temperatureUnit: 'celsius',
};

function LocaleView() {
  const { locale, strings } = useTranslation();
  return <Text>{`${locale}: ${strings.accessibility.send}`}</Text>;
}

it.each([
  ['fr', 'fr'],
  ['FR-ca', 'fr'],
  ['en', 'en'],
  ['es', 'en'],
  [null, 'en'],
  [undefined, 'en'],
  ['', 'en'],
] as const)('résout la langue %s en %s', (language, expected) => {
  expect(resolveLocale(language)).toBe(expected);
});

it('utilise l’anglais en l’absence de langue système', async () => {
  jest.mocked(useLocales).mockReturnValue([{ ...frenchLocale, languageCode: null }]);
  expect(getTranslations()).toBe(en);
  await render(<I18nProvider><LocaleView /></I18nProvider>);
  expect(screen.getByText('en: Send')).toBeTruthy();
  expect(getTranslations()).toBe(en);
});

it('synchronise les traductions des services avec les changements de langue système', async () => {
  jest.mocked(useLocales).mockReturnValue([
    frenchLocale,
  ]);
  const { rerender } = await render(<I18nProvider><LocaleView /></I18nProvider>);
  expect(screen.getByText('fr: Envoyer')).toBeTruthy();
  expect(getTranslations()).toBe(fr);
  jest.mocked(useLocales).mockReturnValue([
    { ...frenchLocale, languageTag: 'en-CA', languageCode: 'en', decimalSeparator: '.', digitGroupingSeparator: ',' },
  ]);
  await rerender(<I18nProvider><LocaleView /></I18nProvider>);
  expect(screen.getByText('en: Send')).toBeTruthy();
  expect(getTranslations()).toBe(en);
});

it.each([0, 1, 3])('formate les compteurs anglais de conversations et serveurs (%s)', (count) => {
  expect(en.conversation.unread(count)).toBe(`${count} unread`);
  expect(en.server.unread(count)).toBe(`${count} unread`);
});
