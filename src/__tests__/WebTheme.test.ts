import { BottomTabInset, Fonts } from '@/constants/theme';
jest.mock('react-native', () => ({
  Platform: { select: (values: Record<string, unknown>) => values.web ?? values.default },
}));
it('uses web fonts and no native tab inset on the web', () => {
  expect(BottomTabInset).toBe(0);
  expect(Fonts.mono).toBe('var(--font-mono)');
});
