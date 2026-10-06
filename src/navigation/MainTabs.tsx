import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SymbolView } from 'expo-symbols';

import { NewDirectMessageButton } from '@/components/NewDirectMessageButton';
import { DirectMessagesScreen } from '@/screens/DirectMessagesScreen';
import { PreferencesScreen } from '@/screens/PreferencesScreen';
import { SearchScreen } from '@/screens/SearchScreen';
import { ServersScreen } from '@/screens/ServersScreen';

import { Routes, type MainTabParamList } from './routes';

const Tab = createBottomTabNavigator<MainTabParamList>();

const ICONS = {
  DirectMessages: 'bubble.left',
  Servers: 'server.rack',
  Search: 'magnifyingglass',
  Preferences: 'gearshape',
} as const;

export function MainTabs() {
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
      <Tab.Screen
        name={Routes.DirectMessages}
        component={DirectMessagesScreen}
        options={{ title: 'Messages privés', headerRight: NewDirectMessageButton }}
      />
      <Tab.Screen name={Routes.Servers} component={ServersScreen} options={{ title: 'Serveurs' }} />
      <Tab.Screen name={Routes.Search} component={SearchScreen} options={{ title: 'Recherche' }} />
      <Tab.Screen name={Routes.Preferences} component={PreferencesScreen} options={{ title: 'Préférences' }} />
    </Tab.Navigator>
  );
}
