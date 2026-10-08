import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  useNavigationContainerRef,
  type Theme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { AppServices } from '@/components/AppServices';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { SearchIcon } from '@/components/SearchIcon';
import { ConversationScreen } from '@/screens/ConversationScreen';
import { ConversationSearchScreen } from '@/screens/ConversationSearchScreen';
import { NewDirectMessageScreen } from '@/screens/NewDirectMessageScreen';
import { ServerScreen } from '@/screens/ServerScreen';
import { LoginScreen } from '@/screens/LoginScreen';
import { RegisterScreen } from '@/screens/RegisterScreen';
import { ThemedText } from '@/components/themed-text';
import { useSession } from '@/session/SessionContext';
import { UnreadProvider } from '@/unread/UnreadContext';
import { useTranslation } from '@/i18n';

import { MainTabs } from './MainTabs';
import { parseConversationParams, Routes, type RootStackParamList } from './routes';

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
        card: c.panel,
        border: scheme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(11, 59, 54, 0.14)',
        text: c.text,
      },
    };
  }, [scheme]);
}

function SignedInShell({ active, children }: { active: boolean; children: ReactNode }) {
  return active ? <UnreadProvider>{children}</UnreadProvider> : <>{children}</>;
}

export function RootNavigator() {
  const { status, error, user, signOut, restoreSession } = useSession();
  const { strings } = useTranslation();
  const theme = useNavigationTheme();
  const navigationRef = useNavigationContainerRef<RootStackParamList>();
  const [navReady, setNavReady] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  // Conversation affichée (ou sa recherche) : sert à ne pas notifier ce qu'on est en train de lire.
  const trackActiveConversation = useCallback(() => {
    const route = navigationRef.getCurrentRoute();
    const onConversation = route?.name === Routes.Conversation || route?.name === Routes.ConversationSearch;
    setActiveConversationId(onConversation ? (parseConversationParams(route.params)?.conversationId ?? null) : null);
  }, [navigationRef]);

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
    <NavigationContainer
      theme={theme}
      ref={navigationRef}
      onReady={() => {
        setNavReady(true);
        trackActiveConversation();
      }}
      onStateChange={trackActiveConversation}
    >
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
        {/* Compteurs de non-lus et services de messagerie : seulement avec une session ouverte. */}
        <SignedInShell active={status === 'signedIn'}>
          {status === 'signedIn' && navReady && user ? (
            <AppServices userId={user.id} activeConversationId={activeConversationId} navigationRef={navigationRef} />
          ) : null}
          {/* L'écran d'une conversation affiche déjà son propre état de connexion. */}
          {status === 'signedIn' && !activeConversationId ? <ConnectionStatus /> : null}
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
                options={({ route, navigation }) => ({
                  title: route.params?.title ?? strings.navigation.conversation,
                  // Recherche limitée à cette conversation (messages privés ou salon), comme sur le Web.
                  headerRight: () => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={strings.accessibility.searchInConversation}
                      hitSlop={8}
                      style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
                      onPress={() => {
                        const params = parseConversationParams(route.params);
                        if (params) navigation.navigate(Routes.ConversationSearch, params);
                      }}
                    >
                      <SearchIcon color={theme.colors.primary} size={22} />
                    </Pressable>
                  ),
                })}
              />
              <Stack.Screen
                name={Routes.ConversationSearch}
                component={ConversationSearchScreen}
                options={{ title: strings.navigation.search }}
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
        </SignedInShell>
      </View>
    </NavigationContainer>
  );
}
