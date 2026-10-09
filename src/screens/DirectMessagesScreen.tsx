import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useLayoutEffect } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { ContentFrame } from '@/components/ContentFrame';
import { HeaderSearchButton } from '@/components/HeaderSearchButton';
import { ThemedTextInput } from '@/components/ThemedTextInput';
import { ConversationItem } from '@/components/ConversationItem';
import { NewDirectMessageButton } from '@/components/NewDirectMessageButton';
import { EmptyState, ErrorState, LoadingState, RefreshErrorBanner } from '@/components/StateViews';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useListFilter } from '@/hooks/useListFilter';
import { usePagedList } from '@/hooks/usePagedList';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { useRefreshOnProfileChange } from '@/hooks/useRefreshOnProfileChange';
import { useProfileSheet } from '@/components/ProfileSheet';
import { usePublicProfiles } from '@/hooks/usePublicProfiles';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useDirectMessages } from '@/hooks/useDirectMessages';
import { useLiveConversations } from '@/unread/liveUnread';
import { Routes, type MainTabParamList, type RootStackParamList } from '@/navigation/routes';
import { useSession } from '@/session/SessionContext';
import type { ConversationSummary } from '@/types/conversation';
import { useTranslation } from '@/i18n';

// Écran d'onglet dont la route « Conversation » vit dans la pile parente : navigate() y remonte seul, typé.
type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'DirectMessages'>,
  NativeStackScreenProps<RootStackParamList>
>;

const NONE: ConversationSummary[] = [];
const nameOf = (item: ConversationSummary) => item.title;

export function DirectMessagesScreen({ navigation }: Props) {
  const { user } = useSession();
  const { strings } = useTranslation();
  const { state, refreshError, retry, refresh } = useDirectMessages();
  useRefreshOnFocus(refresh);
  useRefreshOnProfileChange(refresh);
  // Spinner seulement quand l'utilisateur tire la liste : les mises à jour en arrière-plan restent invisibles.
  const refreshProps = usePullToRefresh(refresh);
  const conversations = useLiveConversations(state.status === 'ready' ? state.data : NONE);
  // Loupe de l'en-tête : filtre par nom, avant la pagination.
  const search = useListFilter(conversations, nameOf);
  useLayoutEffect(() => {
    navigation.setOptions({ headerRight: () => <HeaderSearchButton label={strings.navigation.searchPrivateMessages} active={search.open} onPress={search.toggle} /> });
  }, [navigation, strings, search.open, search.toggle]);
  // 15 à la fois, les plus actifs en haut (tri du service).
  const page = usePagedList(search.filtered);

  const open = useCallback(
    (conversation: ConversationSummary) =>
      navigation.navigate(Routes.Conversation, { conversationId: conversation.id, title: conversation.title }),
    [navigation],
  );

  // Appui long sur une conversation : fiche de profil de l'autre personne (alias, pseudo, photo).
  // Présence et photo des personnes de la liste, partagées avec la fiche (un seul suivi de présence).
  const profiles = usePublicProfiles(conversations.map(conversation => conversation.id.slice('dm:'.length)));
  const { show: showSheet, sheet: profileSheet } = useProfileSheet({
    profiles,
    onMessage: (userId, name) => navigation.navigate(Routes.Conversation, { conversationId: `dm:${userId}`, title: name }),
  });
  const showProfile = useCallback(
    (conversation: ConversationSummary) => showSheet({ userId: conversation.id.slice('dm:'.length) }),
    [showSheet],
  );

  const newMessageButton = <NewDirectMessageButton onPress={() => navigation.navigate(Routes.NewDirectMessage)} />;

  if (state.status !== 'ready') {
    return (
      <ThemedView style={styles.fill}>
        {newMessageButton}
        {state.status === 'loading' ? (
          <LoadingState label={strings.states.loadingPrivateMessages} />
        ) : state.status === 'error' ? (
          <ErrorState message={state.message} onRetry={retry} refresh={refreshProps} />
        ) : (
          <EmptyState
            title={strings.states.noPrivateMessages}
            hint={strings.states.startConversation}
            refresh={refreshProps}
          />
        )}
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.fill}>
      <ContentFrame>
        {refreshError ? <RefreshErrorBanner message={refreshError} onRetry={refresh} /> : null}
        {search.open ? <View style={styles.search}><ThemedTextInput autoFocus accessibilityLabel={strings.navigation.searchPrivateMessages} placeholder={strings.navigation.searchPrivateMessages} value={search.query} onChangeText={search.setQuery} maxLength={80} autoCorrect={false} autoCapitalize="none" returnKeyType="search" /></View> : null}
        <FlatList
          ListEmptyComponent={search.query.trim() ? <ThemedText themeColor="textSecondary" style={styles.noMatch}>{strings.navigation.noMatch}</ThemedText> : null}
          data={page.visible}
          ListFooterComponent={page.hasMore ? <View style={styles.more}><ActionButton label={strings.navigation.showMore} onPress={page.showMore} /></View> : null}
          ListHeaderComponent={newMessageButton}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => <ConversationItem conversation={item} currentUserId={user?.id} onPress={open} onLongPress={showProfile} />}
          ItemSeparatorComponent={() => <ThemedView type="backgroundSelected" style={styles.separator} />}
          refreshing={refreshProps.refreshing}
          onRefresh={refreshProps.onRefresh}
          contentContainerStyle={styles.list}
        />
      </ContentFrame>
      {profileSheet}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { flexGrow: 1 },
  separator: { height: StyleSheet.hairlineWidth },
  more: { padding: 16 },
  search: { paddingHorizontal: 16, paddingTop: 12 },
  noMatch: { padding: 16, textAlign: 'center' },
});
