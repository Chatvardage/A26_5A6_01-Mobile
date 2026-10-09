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

/** Toutes les phrases paramétrées, avec leur chemin (`section.clé`). */
function templates(strings: object, prefix = ''): [string, (...args: unknown[]) => unknown][] {
  return Object.entries(strings).flatMap(([key, value]) =>
    typeof value === 'function' ? [[`${prefix}${key}`, value]] : value && typeof value === 'object' ? templates(value, `${prefix}${key}.`) : [],
  );
}

it.each([['en', en], ['fr', fr]] as const)('chaque phrase paramétrée (%s) reprend ses valeurs, au singulier comme au pluriel', (_locale, strings) => {
  for (const [path, template] of templates(strings)) {
    for (const value of [1, 2]) {
      const text = template(`«${value}»`, `«${value}»`);
      expect([path, typeof text]).toEqual([path, 'string']);
      expect([path, (text as string).includes(`«${value}»`)]).toEqual([path, true]);
      expect([path, String(template(value, value)).includes(String(value))]).toEqual([path, true]);
    }
  }
});

it('accorde les invitations et nomme les cibles des confirmations', () => {
  expect(en.control.pendingInvitations(1)).toBe('1 pending invitation');
  expect(en.control.pendingInvitations(2)).toBe('2 pending invitations');
  expect(fr.control.pendingInvitations(1)).toBe('1 invitation en attente');
  expect(fr.control.pendingInvitations(2)).toBe('2 invitations en attente');
  expect(en.control.transferConfirmTitle('Ana', 'Ben')).toBe('Kick Ana and make Ben the owner?');
  expect(en.control.deleteRoomTitle('général')).toBe('Delete the channel #général?');
});
