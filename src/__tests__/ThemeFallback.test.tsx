import { renderHook } from '@testing-library/react-native';
import * as colorScheme from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { Colors } from '@/constants/theme';
it('uses light colors when the device does not specify a scheme', async () => {
  const spy = jest.spyOn(colorScheme, 'useColorScheme').mockReturnValue('unspecified');
  const { result } = await renderHook(() => useTheme());
  expect(result.current).toBe(Colors.light);
  spy.mockRestore();
});
