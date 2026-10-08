import { render, renderHook, screen } from '@testing-library/react-native';
import { useColorScheme as nativeScheme } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({ __esModule: true, default: jest.fn() }));

it.each(['light', 'dark', 'unspecified'] as const)('sélectionne la palette %s', async (scheme) => {
  jest.mocked(nativeScheme).mockReturnValue(scheme);
  const { result } = await renderHook(() => ({ scheme: useColorScheme(), theme: useTheme() }));
  expect(result.current.scheme).toBe(scheme);
  expect(result.current.theme).toEqual(Colors[scheme === 'unspecified' ? 'light' : scheme]);
});

it('rend tous les styles de texte et respecte les couleurs et styles fournis', async () => {
  jest.mocked(nativeScheme).mockReturnValue('dark');
  const types = ['default', 'title', 'small', 'smallBold', 'subtitle', 'link', 'linkPrimary', 'code'] as const;
  await render(
    <ThemedView testID="view" type="backgroundElement" style={{ padding: 7 }}>
      {types.map((type) => <ThemedText key={type} type={type} themeColor="textSecondary">{type}</ThemedText>)}
    </ThemedView>,
  );
  expect(screen.getByTestId('view')).toHaveStyle({ backgroundColor: Colors.dark.backgroundElement, padding: 7 });
  for (const type of types) expect(screen.getByText(type)).toBeTruthy();
  expect(screen.getByText('small')).toHaveStyle({ color: Colors.dark.textSecondary });
  expect(screen.getByText('title')).toHaveStyle({ fontSize: 48 });
});

it('utilise zéro comme marge d’onglets sur une plateforme sans marge native', () => {
  jest.isolateModules(() => {
    const { Platform } = jest.requireActual<typeof import('react-native')>('react-native');
    const select = jest.spyOn(Platform, 'select').mockReturnValue(undefined);
    try {
      const theme = jest.requireActual<typeof import('@/constants/theme')>('@/constants/theme');
      expect(theme.BottomTabInset).toBe(0);
    } finally {
      select.mockRestore();
    }
  });
});
