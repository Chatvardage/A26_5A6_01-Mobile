import { BottomTabInset, Fonts } from '@/constants/theme';
// This platform-only test has no native runtime: avoid Expo's lazy fetch getter during teardown.
Object.defineProperty(global, 'fetch', { value: jest.fn(), writable: true, configurable: true });
jest.mock('react-native', () => ({
  Platform: { select: (values: Record<string, unknown>) => values.web ?? values.default },
}));
it('uses web fonts and no native tab inset on the web', () => {
  expect(BottomTabInset).toBe(0);
  expect(Fonts.mono).toBe('var(--font-mono)');
});
