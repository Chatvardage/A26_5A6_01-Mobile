import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useCallback } from 'react';
import { FlatList, StyleSheet } from 'react-native';

import { ConversationItem } from '@/components/ConversationItem';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { useConversations } from '@/hooks/useConversations';
import type { MainTabParamList } from '@/navigation/routes';
import { Routes } from '@/navigation/routes';
import { useSession } from '@/session/SessionContext';
import type { ConversationSummary } from '@/types/conversation';

type Props = BottomTabScreenProps<MainTabParamList, 'Conversations'>;

export function ConversationsScreen({ navigation }: Props) {
  const theme = useTheme();
  const { user } = useSession();
  const { state, refreshing, retry, refresh } = useConversations();

  const open = useCallback(
    (conversation: ConversationSummary) =>
      navigation.getParent()?.navigate(Routes.Conversation, {
        conversationId: conversation.id,
        title: conversation.title,
      }),
    [navigation],
  );

  if (state.status === 'loading') return <LoadingState label="Chargement des conversations…" />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={retry} />;
  if (state.status === 'empty') {
    return (
      <EmptyState
        title="Aucune conversation"
        hint="Rejoignez un salon ou écrivez à quelqu'un pour commencer à discuter."
      />
    );
  }

  return (
    <ThemedView style={styles.fill}>
      <FlatList
        data={state.conversations}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => <ConversationItem conversation={item} currentUserId={user?.id} onPress={open} />}
        ItemSeparatorComponent={() => <ThemedView type="backgroundSelected" style={styles.separator} />}
        refreshing={refreshing}
        onRefresh={refresh}
        contentContainerStyle={styles.list}
        style={{ backgroundColor: theme.background }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { flexGrow: 1 },
  separator: { height: StyleSheet.hairlineWidth },
});
