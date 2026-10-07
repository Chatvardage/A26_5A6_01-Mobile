import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback } from 'react';
import { FlatList, StyleSheet } from 'react-native';

import { ConversationItem } from '@/components/ConversationItem';
import { NewDirectMessageButton } from '@/components/NewDirectMessageButton';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { ThemedView } from '@/components/themed-view';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { useDirectMessages } from '@/hooks/useDirectMessages';
import { Routes, type MainTabParamList, type RootStackParamList } from '@/navigation/routes';
import { useSession } from '@/session/SessionContext';
import type { ConversationSummary } from '@/types/conversation';

// Écran d'onglet dont la route « Conversation » vit dans la pile parente : navigate() y remonte seul, typé.
type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'DirectMessages'>,
  NativeStackScreenProps<RootStackParamList>
>;

export function DirectMessagesScreen({ navigation }: Props) {
  const { user } = useSession();
  const { state, refreshing, retry, refresh } = useDirectMessages();
  useRefreshOnFocus(refresh);
  const refreshProps = { refreshing, onRefresh: refresh };

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
          <LoadingState label="Chargement des messages privés…" />
        ) : state.status === 'error' ? (
          <ErrorState message={state.message} onRetry={retry} refresh={refreshProps} />
        ) : (
          <EmptyState title="Aucun message privé" hint="Touchez la carte + pour écrire à quelqu'un." refresh={refreshProps} />
        )}
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.fill}>
      <FlatList
        data={state.data}
        ListHeaderComponent={newMessageButton}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => <ConversationItem conversation={item} currentUserId={user?.id} onPress={open} />}
        ItemSeparatorComponent={() => <ThemedView type="backgroundSelected" style={styles.separator} />}
        refreshing={refreshing}
        onRefresh={refresh}
        contentContainerStyle={styles.list}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { flexGrow: 1 },
  separator: { height: StyleSheet.hairlineWidth },
});
