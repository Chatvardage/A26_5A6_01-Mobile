import { DarkTheme, DefaultTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, useColorScheme, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { ConversationScreen } from '@/screens/ConversationScreen';
import { ServerScreen } from '@/screens/ServerScreen';
import { LoginScreen } from '@/screens/LoginScreen';
import { RegisterScreen } from '@/screens/RegisterScreen';
import { ThemedText } from '@/components/themed-text';
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
      colors: {
        ...base.colors,
        primary: c.tint,
        background: c.background,
        card: c.background,
        text: c.text,
      },
    };
  }, [scheme]);
}

export function RootNavigator() {
  const { status, error, signOut, restoreSession } = useSession();
  const theme = useNavigationTheme();

  // No authenticated screen is mounted before secure restoration completes.
  if (status === 'loading') {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.background,
        }}
      >
        {error ? (
          <>
            <ThemedText accessibilityRole="alert">{error}</ThemedText>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                void restoreSession();
              }}
            >
              <ThemedText>Réessayer</ThemedText>
            </Pressable>
          </>
        ) : (
          <ActivityIndicator
            accessibilityLabel="Restauration de session"
            size="large"
            color={theme.colors.primary}
          />
        )}
      </View>
    );
  }

  return (
    <NavigationContainer theme={theme}>
      {error ? (
        <View>
          <ThemedText accessibilityRole="alert">{error}</ThemedText>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void signOut();
            }}
          >
            <ThemedText>Réessayer le nettoyage</ThemedText>
          </Pressable>
        </View>
      ) : null}
      <Stack.Navigator key={status}>
        {status === 'signedIn' ? (
          <>
            <Stack.Screen name={Routes.Main} component={MainTabs} options={{ headerShown: false }} />
            <Stack.Screen
              name={Routes.Server}
              component={ServerScreen}
              options={({ route }) => ({
                title: route.params?.title ?? 'Serveur',
              })}
            />
            <Stack.Screen
              name={Routes.Conversation}
              component={ConversationScreen}
              options={({ route }) => ({
                title: route.params?.title ?? 'Conversation',
              })}
            />
          </>
        ) : (
          <>
            <Stack.Screen name={Routes.Login} component={LoginScreen} options={{ headerShown: false }} />
            <Stack.Screen
              name={Routes.Register}
              component={RegisterScreen}
              options={{ headerShown: false }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
