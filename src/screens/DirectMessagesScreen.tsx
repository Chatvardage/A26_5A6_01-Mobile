import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback } from 'react';
import { FlatList, StyleSheet } from 'react-native';

import { ContentFrame } from '@/components/ContentFrame';
import { ConversationItem } from '@/components/ConversationItem';
import { NewDirectMessageButton } from '@/components/NewDirectMessageButton';
import { EmptyState, ErrorState, LoadingState, RefreshErrorBanner } from '@/components/StateViews';
import { ThemedView } from '@/components/themed-view';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
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

export function DirectMessagesScreen({ navigation }: Props) {
  const { user } = useSession();
  const { strings } = useTranslation();
  const { state, refreshing, refreshError, retry, refresh } = useDirectMessages();
  useRefreshOnFocus(refresh);
  const refreshProps = { refreshing, onRefresh: refresh };
  const conversations = useLiveConversations(state.status === 'ready' ? state.data : NONE);

  const open = useCallback(
    (conversation: ConversationSummary) =>
      navigation.navigate(Routes.Conversation, { conversationId: conversation.id, title: conversation.title }),
    [navigation],
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
        <FlatList
          data={conversations}
          ListHeaderComponent={newMessageButton}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => <ConversationItem conversation={item} currentUserId={user?.id} onPress={open} />}
          ItemSeparatorComponent={() => <ThemedView type="backgroundSelected" style={styles.separator} />}
          refreshing={refreshing}
          onRefresh={refresh}
          contentContainerStyle={styles.list}
        />
      </ContentFrame>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { flexGrow: 1 },
  separator: { height: StyleSheet.hairlineWidth },
});
