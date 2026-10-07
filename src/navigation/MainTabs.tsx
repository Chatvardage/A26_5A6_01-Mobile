import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
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
  DirectMessages: 'bubble.left',
  Servers: 'server.rack',
  Search: 'magnifyingglass',
  Preferences: 'gearshape',
} as const;

export function MainTabs() {
  const { strings } = useTranslation();
  const { dmTotal, roomTotal } = useUnread();
  return (
    <Tab.Navigator
      initialRouteName={Routes.DirectMessages}
      // Retour Android : depuis les autres onglets on revient d'abord aux Messages privés, puis l'app se ferme.
      backBehavior="firstRoute"
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => (
          <SymbolView name={ICONS[route.name]} tintColor={color} size={size} fallback={null} />
        ),
      })}
    >
      <Tab.Screen name={Routes.DirectMessages} component={DirectMessagesScreen} options={{ title: strings.navigation.directMessages, tabBarBadge: dmTotal > 0 ? unreadLabel(dmTotal) : undefined }} />
      <Tab.Screen name={Routes.Servers} component={ServersScreen} options={{ title: strings.navigation.servers, tabBarBadge: roomTotal > 0 ? unreadLabel(roomTotal) : undefined }} />
      <Tab.Screen name={Routes.Search} component={SearchScreen} options={{ title: strings.navigation.search }} />
      <Tab.Screen name={Routes.Preferences} component={PreferencesScreen} options={{ title: strings.navigation.preferences }} />
    </Tab.Navigator>
  );
}
