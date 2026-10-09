import type { Translations } from '@/i18n';
/** Traduction locale des noms standards; les noms personnalises restent intacts. */
export function displayName(name: string, strings: Translations): string {
  const prefix = name.startsWith('#') ? '#' : '';
  const value = prefix ? name.slice(1) : name;
  const normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (normalized === 'annonces' || normalized === 'announcements') return prefix + strings.control.announcements;
  if (normalized === 'general') return prefix + strings.control.general;
  if (normalized === 'chatvardage') return strings.brand;
  return name;
}
