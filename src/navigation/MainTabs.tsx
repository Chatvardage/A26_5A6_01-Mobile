import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SymbolView } from 'expo-symbols';

import { ConversationsScreen } from '@/screens/ConversationsScreen';
import { PreferencesScreen } from '@/screens/PreferencesScreen';
import { SearchScreen } from '@/screens/SearchScreen';

import { Routes, type MainTabParamList } from './routes';

const Tab = createBottomTabNavigator<MainTabParamList>();

const ICONS = {
  Conversations: 'bubble.left.and.bubble.right',
  Search: 'magnifyingglass',
  Preferences: 'gearshape',
} as const;

export function MainTabs() {
  return (
    <Tab.Navigator
      initialRouteName={Routes.Conversations}
      // Retour Android : depuis Recherche/Préférences on revient d'abord aux Conversations, puis l'app se ferme.
      backBehavior="firstRoute"
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => (
          <SymbolView name={ICONS[route.name]} tintColor={color} size={size} fallback={null} />
        ),
      })}
    >
      <Tab.Screen name={Routes.Conversations} component={ConversationsScreen} options={{ title: 'Conversations' }} />
      <Tab.Screen name={Routes.Search} component={SearchScreen} options={{ title: 'Recherche' }} />
      <Tab.Screen name={Routes.Preferences} component={PreferencesScreen} options={{ title: 'Préférences' }} />
    </Tab.Navigator>
  );
}
