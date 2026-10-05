import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { MainTabs } from '@/navigation/MainTabs';
import { RootNavigator } from '@/navigation/RootNavigator';
import { Colors } from '@/constants/theme';
import { useSession } from '@/session/SessionContext';

jest.mock('@/session/SessionContext', () => ({ useSession: jest.fn() }));
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({ __esModule: true, default: jest.fn(() => 'light') }));
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    NavigationContainer: ({ children, theme }: { children: ReactNode; theme: { colors: Record<string, string> } }) => {
      mockTheme = theme;
      return children;
    },
  };
});

type ScreenProps = {
  name: string;
  component: unknown;
  options: { headerShown?: boolean; title?: string } | ((props: { route: { params?: { title?: string } } }) => { title: string });
};
type TabProps = {
  initialRouteName: string;
  backBehavior: string;
  screenOptions: (props: { route: { name: 'DirectMessages' | 'Servers' | 'Search' | 'Preferences' } }) => {
    tabBarIcon: (props: { color: string; size: number }) => ReactNode;
  };
};
const mockStackScreens: ScreenProps[] = [];
const mockTabScreens: ScreenProps[] = [];
let mockTabProps: TabProps;
let mockTheme: { colors: Record<string, string> };

jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children }: { children: ReactNode }) => children,
    Screen: (props: ScreenProps) => {
      mockStackScreens.push(props);
      return null;
    },
  }),
}));
jest.mock('@react-navigation/bottom-tabs', () => ({
  createBottomTabNavigator: () => ({
    Navigator: ({ children, ...props }: TabProps & { children: ReactNode }) => {
      mockTabProps = props;
      return children;
    },
    Screen: (props: ScreenProps) => {
      mockTabScreens.push(props);
      return null;
    },
  }),
}));
jest.mock('expo-symbols', () => ({
  SymbolView: ({ name, tintColor, size }: { name: string; tintColor: string; size: number }) => {
    const { View } = jest.requireActual('react-native');
    return <View testID={`icon-${name}`} style={{ color: tintColor, width: size }} />;
  },
}));

beforeEach(() => {
  mockStackScreens.length = 0;
  mockTabScreens.length = 0;
  (useSession as jest.Mock).mockReturnValue({ status: 'signedOut' });
  jest.mocked(useColorScheme).mockReturnValue('light');
});

describe('RootNavigator', () => {
  it('n’enregistre que Login sans session et utilise le thème clair', async () => {
    await render(<RootNavigator />);
    expect(mockStackScreens.map((route) => route.name)).toEqual(['Login']);
    expect(mockStackScreens[0].options).toEqual({ headerShown: false });
    expect(mockTheme.colors.background).toBe(Colors.light.background);
  });

  it('attend la restauration de session sans monter les routes', async () => {
    (useSession as jest.Mock).mockReturnValue({ status: 'loading' });
    await render(<RootNavigator />);
    expect(mockStackScreens).toEqual([]);
    expect(screen.root).toHaveStyle({ backgroundColor: Colors.light.background });
  });

  it('enregistre les routes privées et leurs titres, avec le thème sombre', async () => {
    (useSession as jest.Mock).mockReturnValue({ status: 'signedIn' });
    jest.mocked(useColorScheme).mockReturnValue('dark');
    await render(<RootNavigator />);
    expect(mockStackScreens.map((route) => route.name)).toEqual(['Main', 'Server', 'Conversation']);
    expect(mockTheme.colors.background).toBe(Colors.dark.background);
    expect(mockTheme.colors.primary).toBe(Colors.dark.tint);
    for (const route of mockStackScreens.slice(1)) {
      if (typeof route.options !== 'function') throw new Error('Options dynamiques attendues');
      expect(route.options({ route: {} }).title).toBe(route.name === 'Server' ? 'Serveur' : 'Conversation');
      expect(route.options({ route: { params: { title: 'Titre transmis' } } }).title).toBe('Titre transmis');
    }
  });
});

it('configure les quatre onglets, leurs titres et leurs icônes', async () => {
  const view = await render(<MainTabs />);
  expect(mockTabProps.initialRouteName).toBe('DirectMessages');
  expect(mockTabProps.backBehavior).toBe('firstRoute');
  expect(mockTabScreens.map((route) => route.name)).toEqual(['DirectMessages', 'Servers', 'Search', 'Preferences']);
  expect(mockTabScreens.map((route) => route.options)).toEqual([
    { title: 'Messages privés' }, { title: 'Serveurs' }, { title: 'Recherche' }, { title: 'Préférences' },
  ]);
  const icons = [
    ['DirectMessages', 'bubble.left'], ['Servers', 'server.rack'], ['Search', 'magnifyingglass'], ['Preferences', 'gearshape'],
  ] as const;
  for (const [name, icon] of icons) {
    const options = mockTabProps.screenOptions({ route: { name } });
    await view.rerender(<>{options.tabBarIcon({ color: '#123456', size: 24 })}</>);
    expect(screen.getByTestId(`icon-${icon}`)).toHaveStyle({ color: '#123456', width: 24 });
  }
});
