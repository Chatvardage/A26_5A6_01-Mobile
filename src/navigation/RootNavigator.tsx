import { DarkTheme, DefaultTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { ConversationScreen } from '@/screens/ConversationScreen';
import { NewDirectMessageScreen } from '@/screens/NewDirectMessageScreen';
import { ServerScreen } from '@/screens/ServerScreen';
import { LoginScreen } from '@/screens/LoginScreen';
import { RegisterScreen } from '@/screens/RegisterScreen';
import { ThemedText } from '@/components/themed-text';
import { useSession } from '@/session/SessionContext';
import { useTranslation } from '@/i18n';

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
  const { status, user, error, signOut, restoreSession } = useSession();
  const { strings } = useTranslation();
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
              <ThemedText>{strings.navigation.retry}</ThemedText>
            </Pressable>
          </>
        ) : (
          <ActivityIndicator
            accessibilityLabel={strings.accessibility.restoreSession}
            size="large"
            color={theme.colors.primary}
          />
        )}
      </View>
    );
  }

  return (
    <NavigationContainer theme={theme}>
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        {error ? (
          <SafeAreaView edges={['top', 'left', 'right']} style={{ backgroundColor: theme.colors.card }}>
            <View style={{ paddingHorizontal: 20, paddingVertical: 12, gap: 8 }}>
              <ThemedText accessibilityRole="alert" accessibilityLiveRegion="polite">
                {error}
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                style={{ minHeight: 44, justifyContent: 'center' }}
                onPress={() => {
                  void signOut();
                }}
              >
                <ThemedText themeColor="tint" type="smallBold">
                  {strings.navigation.retryCleanup}
                </ThemedText>
              </Pressable>
            </View>
          </SafeAreaView>
        ) : null}
        <Stack.Navigator key={`${status}:${user?.id ?? ''}`}>
          {status === 'signedIn' ? (
            <>
              <Stack.Screen name={Routes.Main} component={MainTabs} options={{ headerShown: false }} />
              <Stack.Screen
                name={Routes.Server}
                component={ServerScreen}
                options={({ route }) => ({
                  title: route.params?.title ?? strings.navigation.server,
                })}
              />
              <Stack.Screen
                name={Routes.Conversation}
                component={ConversationScreen}
                options={({ route }) => ({
                  title: route.params?.title ?? strings.navigation.conversation,
                })}
              />
              <Stack.Screen
                name={Routes.NewDirectMessage}
                component={NewDirectMessageScreen}
                options={{ title: 'Nouveau message', presentation: 'modal' }}
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
      </View>
    </NavigationContainer>
  );
}
