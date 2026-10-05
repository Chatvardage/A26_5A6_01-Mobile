import { createBottomTabNavigator, type BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet } from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { DirectMessagesScreen } from '@/screens/DirectMessagesScreen';
import { PreferencesScreen } from '@/screens/PreferencesScreen';
import { SearchScreen } from '@/screens/SearchScreen';
import { ServersScreen } from '@/screens/ServersScreen';

import { Routes, type MainTabParamList } from './routes';
import { useTranslation } from '@/i18n';

const Tab = createBottomTabNavigator<MainTabParamList>();

const ICONS = {
  DirectMessages: 'bubble.left',
  Servers: 'server.rack',
  Search: 'magnifyingglass',
  Preferences: 'gearshape',
} as const;

function DiscordTabButton({
  accessibilityState,
  style,
  children,
  selectedColor,
  unselectedColor,
  borderColor,
  ref: _ref,
  ...props
}: BottomTabBarButtonProps & { selectedColor: string; unselectedColor: string; borderColor: string }) {
  return (
    <Pressable
      {...props}
      accessibilityState={accessibilityState}
      style={[
        style,
        styles.tabButton,
        {
          backgroundColor: accessibilityState?.selected ? selectedColor : unselectedColor,
          borderColor: accessibilityState?.selected ? selectedColor : borderColor,
        },
      ]}
    >
      {children}
    </Pressable>
  );
}

export function MainTabs() {
  const { strings } = useTranslation();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = Colors[scheme];
  return (
    <Tab.Navigator
      initialRouteName={Routes.DirectMessages}
      // Retour Android : depuis les autres onglets on revient d'abord aux Messages privés, puis l'app se ferme.
      backBehavior="firstRoute"
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.panel },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '800' },
        tabBarStyle: [
          styles.tabBar,
          {
            backgroundColor: colors.panelAlt,
            borderColor: colors.backgroundSelected,
          },
        ],
        tabBarItemStyle: [
          styles.tabBarItem,
          route.name === Routes.Search && {
            borderLeftWidth: StyleSheet.hairlineWidth,
            borderLeftColor: colors.backgroundSelected,
          },
        ],
        tabBarButton: (props) => (
          <DiscordTabButton
            {...props}
            selectedColor={colors.accent}
            unselectedColor={colors.panel}
            borderColor={colors.backgroundSelected}
          />
        ),
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarLabelPosition: 'below-icon',
        tabBarIconStyle: styles.tabBarIcon,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarIcon: ({ color, size }) => (
          <SymbolView name={ICONS[route.name]} tintColor={color} size={size} fallback={null} />
        ),
      })}
    >
      <Tab.Screen name={Routes.DirectMessages} component={DirectMessagesScreen} options={{ title: strings.navigation.directMessages }} />
      <Tab.Screen name={Routes.Servers} component={ServersScreen} options={{ title: strings.navigation.servers }} />
      <Tab.Screen name={Routes.Search} component={SearchScreen} options={{ title: strings.navigation.search }} />
      <Tab.Screen name={Routes.Preferences} component={PreferencesScreen} options={{ title: strings.navigation.preferences }} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    height: 78,
    marginHorizontal: 12,
    marginBottom: 10,
    padding: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 24,
    elevation: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
  },
  tabBarItem: {
    flex: 1,
    height: '100%',
    alignSelf: 'stretch',
    marginHorizontal: 2,
    marginVertical: 0,
    padding: 0,
    borderRadius: 18,
    overflow: 'hidden',
  },
  tabButton: {
    flex: 1,
    height: '100%',
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 0,
  },
  tabBarIcon: {
    marginTop: 0,
    marginBottom: 0,
  },
  tabBarLabel: {
    alignSelf: 'stretch',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
    lineHeight: 14,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
});
