import { resolveLocale } from '@/i18n';
import { en } from '@/i18n/en';
import { fr } from '@/i18n/fr';

it('fournit les accords et phrases paramétrées en anglais et en français', () => {
  expect(en.conversation.unread(1)).toBe('1 unread');
  expect(en.server.unread(3)).toBe('3 unread');
  expect(en.search.scopedPlaceholder('oli')).toBe('Search in oli');
  expect(en.search.results(1)).toBe('1 result');
  expect(en.search.results(2)).toBe('2 results');
  expect(fr.search.scopedPlaceholder('oli')).toBe('Rechercher dans oli');
  expect(fr.search.results(1)).toBe('1 résultat');
  expect(fr.search.results(2)).toBe('2 résultats');
});

it('garde les mêmes clés de notification et de connexion dans les deux langues', () => {
  expect(Object.keys(en.notifications)).toEqual(Object.keys(fr.notifications));
  expect(Object.keys(en.connection)).toEqual(Object.keys(fr.connection));
  expect(Object.keys(en.search)).toEqual(Object.keys(fr.search));
});

it("choisit l'anglais sans code de langue et le français pour fr", () => {
  expect(resolveLocale(undefined)).toBe('en');
  expect(resolveLocale(null)).toBe('en');
  expect(resolveLocale('fr-CA')).toBe('fr');
});
