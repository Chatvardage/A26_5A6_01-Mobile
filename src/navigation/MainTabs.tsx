import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RoomsScreen } from '@/screens/RoomsScreen';
import { SymbolView } from 'expo-symbols';

import { DirectMessagesScreen } from '@/screens/DirectMessagesScreen';
import { PreferencesScreen } from '@/screens/PreferencesScreen';
import { SearchScreen } from '@/screens/SearchScreen';
import { ServersScreen } from '@/screens/ServersScreen';

import { unreadLabel } from '@/components/UnreadBadge';

import { Routes, type MainTabParamList } from './routes';
import { useTranslation } from '@/i18n';
import { useUnread } from '@/unread/UnreadContext';

const Tab = createBottomTabNavigator<MainTabParamList>();

const ICONS = {
  Rooms: { ios: 'house', android: 'home', web: 'home' },
  DirectMessages: { ios: 'bubble.left', android: 'chat', web: 'chat' },
  Servers: { ios: 'server.rack', android: 'dns', web: 'dns' },
  Search: { ios: 'magnifyingglass', android: 'search', web: 'search' },
  Preferences: { ios: 'gearshape', android: 'settings', web: 'settings' },
} as const;

export function MainTabs() {
  const { strings } = useTranslation();
  const insets = useSafeAreaInsets();
  const { dmTotal, roomTotal } = useUnread();
  return (
    <Tab.Navigator
      tabBar={() => null}
      initialRouteName={Routes.Rooms}
      // Retour Android : depuis les autres onglets on revient d'abord à #annonces, puis l'app se ferme.
      backBehavior="firstRoute"
      screenOptions={({ route }) => ({
        tabBarStyle: { height: 68 + insets.bottom, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 8) },
        tabBarLabelStyle: { fontSize: 11 },
        tabBarHideOnKeyboard: true,
        tabBarIcon: ({ color, size }) => (
          <SymbolView name={ICONS[route.name]} tintColor={color} size={size} fallback={<Text style={{ color, fontSize: size }}>{route.name === "Rooms" ? "⌂" : route.name === "DirectMessages" ? "✉" : route.name === "Servers" ? "#" : route.name === "Search" ? "⌕" : "⚙"}</Text>} />
        ),
      })}
    >
      <Tab.Screen name={Routes.Rooms} component={RoomsScreen} options={{ title: strings.control.home, tabBarLabel: strings.control.home }} />
      <Tab.Screen name={Routes.DirectMessages} component={DirectMessagesScreen} options={{ title: strings.navigation.directMessages, tabBarLabel: strings.navigation.messages, tabBarBadge: dmTotal > 0 ? unreadLabel(dmTotal) : undefined }} />
      <Tab.Screen name={Routes.Servers} component={ServersScreen} options={{ title: strings.navigation.servers, tabBarBadge: roomTotal > 0 ? unreadLabel(roomTotal) : undefined }} />
      <Tab.Screen name={Routes.Search} component={SearchScreen} options={{ title: strings.navigation.search }} />
      <Tab.Screen
        name={Routes.Preferences}
        component={PreferencesScreen}
        options={{ title: strings.navigation.preferences }}
      />
    </Tab.Navigator>
  );
}
