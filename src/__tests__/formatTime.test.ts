import { formatMessageTime } from '@/utils/formatTime';

it('affiche l’heure locale du jour avec deux chiffres', () => {
  const now = new Date(2026, 9, 4, 15);
  expect(formatMessageTime(new Date(2026, 9, 4, 9, 5).toISOString(), now)).toBe('09:05');
});

it.each([new Date(2026, 9, 3), new Date(2026, 8, 4), new Date(2025, 9, 4)])('affiche la date des autres jours (%s)', (date) => {
  expect(formatMessageTime(date.toISOString(), new Date(2026, 9, 4))).toBe(
    `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`,
  );
});

it('n’affiche rien pour une date invalide', () => {
  expect(formatMessageTime('pas une date')).toBe('');
});
