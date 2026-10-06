import { DarkTheme, DefaultTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useMemo } from 'react';
import { ActivityIndicator, useColorScheme, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { ConversationScreen } from '@/screens/ConversationScreen';
import { NewDirectMessageScreen } from '@/screens/NewDirectMessageScreen';
import { ServerScreen } from '@/screens/ServerScreen';
import { LoginScreen } from '@/screens/LoginScreen';
import { useSession } from '@/session/SessionContext';

import { MainTabs } from './MainTabs';
import { Routes, type RootStackParamList } from './routes';

const Stack = createNativeStackNavigator<RootStackParamList>();

function useNavigationTheme(): Theme {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return useMemo(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    const c = Colors[scheme];
    return {
      ...base,
      colors: { ...base.colors, primary: c.tint, background: c.background, card: c.background, text: c.text },
    };
  }, [scheme]);
}

export function RootNavigator() {
  const { status } = useSession();
  const theme = useNavigationTheme();

  // Provisoire : jamais atteint tant que SessionContext ne charge pas la session depuis SecureStore.
  // À conserver pour la restauration de session au démarrage.
  if (status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={theme}>
      <Stack.Navigator>
        {status === 'signedIn' ? (
          <>
            <Stack.Screen name={Routes.Main} component={MainTabs} options={{ headerShown: false }} />
            <Stack.Screen
              name={Routes.Server}
              component={ServerScreen}
              options={({ route }) => ({ title: route.params?.title ?? 'Serveur' })}
            />
            <Stack.Screen
              name={Routes.Conversation}
              component={ConversationScreen}
              options={({ route }) => ({ title: route.params?.title ?? 'Conversation' })}
            />
            <Stack.Screen
              name={Routes.NewDirectMessage}
              component={NewDirectMessageScreen}
              options={{ title: 'Nouveau message', presentation: 'modal' }}
            />
          </>
        ) : (
          <Stack.Screen name={Routes.Login} component={LoginScreen} options={{ headerShown: false }} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
