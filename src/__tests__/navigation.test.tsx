import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { MainTabs } from '@/navigation/MainTabs';
import { RootNavigator } from '@/navigation/RootNavigator';
import { Colors } from '@/constants/theme';
import { useSession } from '@/session/SessionContext';

const mockRealtime = {
  getRealtimeState: () => 'ready' as const,
  onConnectionState: () => () => undefined,
  onReady: () => () => undefined,
  subscribe: () => () => undefined,
  joinRoom: async () => undefined,
  leaveRoom: async () => undefined,
};
jest.mock('@/session/SessionContext', () => ({ useSession: jest.fn() }));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
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
  screenOptions: (props: { route: { name: 'Rooms' | 'DirectMessages' | 'Servers' | 'Search' | 'Preferences' } }) => {
    tabBarIcon: (props: { color: string; size: number }) => ReactNode;
  };
};
const mockStackScreens: ScreenProps[] = [];
const mockStackMount = jest.fn();
const mockTabScreens: ScreenProps[] = [];
let mockTabProps: TabProps;
let mockTheme: { colors: Record<string, string> };

jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children }: { children: ReactNode }) => {
      const React = jest.requireActual<typeof import('react')>('react');
      React.useEffect(() => { mockStackMount(); }, []);
      return children;
    },
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
  SymbolView: ({ name, tintColor, size }: { name: { ios: string; android: string; web: string }; tintColor: string; size: number }) => {
    const { View } = jest.requireActual('react-native');
    return <View testID={`icon-${name.ios}`} style={{ color: tintColor, width: size }} />;
  },
}));

beforeEach(() => {
  mockStackScreens.length = 0;
  mockStackMount.mockClear();
  mockTabScreens.length = 0;
  (useSession as jest.Mock).mockReturnValue({ status: 'signedOut' });
  jest.mocked(useColorScheme).mockReturnValue('light');
});

describe('RootNavigator', () => {
  it('remonte les écrans lors du changement de compte, mais pas au renouvellement du même compte', async () => {
    jest.mocked(useSession).mockReturnValue({ status: 'signedIn', user: { id: 'alice' }, realtime: mockRealtime } as unknown as ReturnType<typeof useSession>);
    const { rerender } = await render(<RootNavigator />);
    expect(mockStackMount).toHaveBeenCalledTimes(1);
    await rerender(<RootNavigator />);
    expect(mockStackMount).toHaveBeenCalledTimes(1);
    jest.mocked(useSession).mockReturnValue({ status: 'signedIn', user: { id: 'bob' }, realtime: mockRealtime } as unknown as ReturnType<typeof useSession>);
    await rerender(<RootNavigator />);
    expect(mockStackMount).toHaveBeenCalledTimes(2);
  });
  it('n’enregistre que les routes d’authentification sans session et utilise le thème clair', async () => {
    await render(<RootNavigator />);
    expect(mockStackScreens.map((route) => route.name)).toEqual(['Login', 'Register']);
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
    (useSession as jest.Mock).mockReturnValue({ status: 'signedIn', realtime: mockRealtime });
    jest.mocked(useColorScheme).mockReturnValue('dark');
    await render(<RootNavigator />);
    expect(mockStackScreens.map((route) => route.name)).toEqual(['Main', 'DiscoverServers', 'ManageServer', 'EditRoom', 'ServerMembers', 'Server', 'Conversation', 'ConversationSearch', 'ServerSearch', 'NewDirectMessage']);
    expect(mockTheme.colors.background).toBe(Colors.dark.background);
    expect(mockTheme.colors.primary).toBe(Colors.dark.tint);
    expect(mockStackScreens[3].options).toEqual({ title: 'Modifier le salon' });
    expect(mockStackScreens[8].options).toEqual({ title: 'Recherche' });
    expect(mockStackScreens[9].options).toEqual({ title: 'Nouveau message' });
    const discover = mockStackScreens[1].options as unknown as (props: { route: { params?: { mode?: string } } }) => { title: string };
    expect(discover({ route: { params: { mode: 'create' } } }).title).toBe('Créer un serveur');
    expect(discover({ route: {} }).title).toBe('Découvrir des serveurs');
    for (const route of mockStackScreens.slice(5, 7)) {
      if (typeof route.options !== 'function') throw new Error('Options dynamiques attendues');
      expect(route.options({ route: {} }).title).toBe(route.name === 'Server' ? 'Serveur' : 'Conversation');
      expect(route.options({ route: { params: { title: 'Titre transmis' } } }).title).toBe('Titre transmis');
    }
  });
});

it('configure les cinq onglets, leurs titres et leurs icônes', async () => {
  const view = await render(<MainTabs />);
  expect(mockTabProps.initialRouteName).toBe('Rooms');
  expect(mockTabProps.backBehavior).toBe('firstRoute');
  expect(mockTabScreens.map((route) => route.name)).toEqual(['Rooms', 'DirectMessages', 'Servers', 'Search', 'Preferences']);
  expect(mockTabScreens.map((route) => route.options)).toEqual([
    { title: 'Accueil', tabBarLabel: 'Accueil' }, { title: 'Messages privés', tabBarLabel: 'Messages' }, { title: 'Serveurs' }, { title: 'Recherche' }, { title: 'Paramètres' },
  ]);
  const icons = [
    ['Rooms', 'house'], ['DirectMessages', 'bubble.left'], ['Servers', 'server.rack'], ['Search', 'magnifyingglass'], ['Preferences', 'gearshape'],
  ] as const;
  for (const [name, icon] of icons) {
    const options = mockTabProps.screenOptions({ route: { name } });
    await view.rerender(<>{options.tabBarIcon({ color: '#123456', size: 24 })}</>);
    expect(screen.getByTestId(`icon-${icon}`)).toHaveStyle({ color: '#123456', width: 24 });
  }
});
