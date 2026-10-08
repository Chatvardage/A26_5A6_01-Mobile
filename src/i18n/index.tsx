import { getLocales, useLocales } from 'expo-localization';
import { createContext, useContext, useEffect, useMemo, type PropsWithChildren } from 'react';

import { en } from './en';
import { fr } from './fr';

export type Locale = 'fr' | 'en';
export type Translations = typeof fr | typeof en;

const translations: Record<Locale, Translations> = { fr, en };

export function resolveLocale(languageCode: string | null | undefined): Locale {
  return languageCode?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

let activeLocale: Locale = resolveLocale(getLocales()[0]?.languageCode);

export function getTranslations(): Translations {
  return translations[activeLocale];
}

function setActiveLocale(locale: Locale) {
  activeLocale = locale;
}

type I18nContextValue = {
  locale: Locale;
  strings: Translations;
};

const I18nContext = createContext<I18nContextValue>({
  locale: 'fr',
  strings: fr,
});

export function I18nProvider({ children }: PropsWithChildren) {
  const deviceLocales = useLocales();
  const deviceLocale = resolveLocale(deviceLocales[0]?.languageCode);
  useEffect(() => {
    setActiveLocale(deviceLocale);
  }, [deviceLocale]);
  const value = useMemo(() => ({ locale: deviceLocale, strings: translations[deviceLocale] }), [deviceLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  return useContext(I18nContext);
}

export { en, fr };
