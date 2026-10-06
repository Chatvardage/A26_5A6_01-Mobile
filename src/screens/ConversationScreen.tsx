import { useHeaderHeight } from '@react-navigation/elements';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Pressable, StyleSheet, View } from 'react-native';

import { MessageBubble } from '@/components/MessageBubble';
import { MessageInput } from '@/components/MessageInput';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useMessages } from '@/hooks/useMessages';
import { parseConversationParams, type RootStackParamList } from '@/navigation/routes';
import { useSession } from '@/session/SessionContext';
import type { ChatMessage } from '@/types/conversation';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Conversation'>;

export function ConversationScreen({ route }: Props) {
  // Paramètres validés avant tout chargement : un identifiant invalide n'appelle jamais l'API.
  const params = useMemo(() => parseConversationParams(route.params), [route.params]);
  if (!params) return <ErrorState message="Cette conversation est introuvable." />;
  return <ValidConversation key={params.conversationId} conversationId={params.conversationId} />;
}

function ValidConversation({ conversationId }: { conversationId: string }) {
  const headerHeight = useHeaderHeight();
  const { user } = useSession();
  const theme = useTheme();
  const { messages, status, errorMessage, accessError, loadingOlder, olderError, connection, retry, loadOlder, send, edit } =
    useMessages(conversationId, user?.id ?? '');
  const isRoom = conversationId.startsWith('room:');
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);

  let body;
  if (status === 'loading') body = <LoadingState label="Chargement des messages…" />;
  else if (status === 'error' && messages.length === 0) {
    body = <ErrorState message={errorMessage ?? 'Une erreur est survenue.'} onRetry={retry} />;
  } else if (messages.length === 0) body = <EmptyState title="Aucun message" hint="Soyez le premier à écrire." />;
  else {
    body = (
      <FlatList
        // Liste inversée : le plus récent est en bas et le clavier ne le masque pas.
        inverted
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        testID="messages-list"
        data={messages}
        keyExtractor={(m) => m.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onEndReached={() => void loadOlder()}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loadingOlder || olderError ? (
            <View style={styles.pagination}>
              {loadingOlder ? <ActivityIndicator color={theme.tint} /> : null}
              {olderError ? (
                <>
                  <ThemedText type="small" themeColor="danger">
                    {olderError}
                  </ThemedText>
                  <Pressable onPress={() => void loadOlder()} accessibilityRole="button">
                    <ThemedText type="smallBold" style={{ color: theme.tint }}>
                      Réessayer
                    </ThemedText>
                  </Pressable>
                </>
              ) : null}
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <MessageBubble
            message={item}
            mine={item.senderId === user?.id}
            showAuthor={isRoom}
            onLongPress={item.senderId === user?.id ? () => setEditingMessage(item) : undefined}
          />
        )}
        contentContainerStyle={styles.list}
      />
    );
  }

  return (
    <KeyboardAvoidingView style={styles.fill} behavior="padding" keyboardVerticalOffset={headerHeight}>
      <ThemedView style={styles.fill}>
        {connection !== 'ready' ? (
          <View style={[styles.connectionBanner, { backgroundColor: theme.backgroundSelected }]}>
            <ThemedText type="small" themeColor="textSecondary">
              {connection === 'connecting' ? 'Connexion au service de messages…' : 'Hors connexion — reconnexion en cours'}
            </ThemedText>
          </View>
        ) : null}
        {accessError && status !== 'error' && accessError !== errorMessage ? (
          <ThemedText type="small" themeColor="danger" accessibilityRole="alert" style={styles.liveError}>
            {accessError}
          </ThemedText>
        ) : null}
        {errorMessage && status === 'ready' ? (
          <ThemedText type="small" themeColor="danger" accessibilityRole="alert" style={styles.liveError}>
            {errorMessage}
          </ThemedText>
        ) : null}
        {body}
      </ThemedView>
      <MessageInput
        conversationId={conversationId}
        onSend={send}
        editingMessage={editingMessage}
        onEdit={edit}
        onCancelEdit={() => setEditingMessage(null)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { paddingVertical: 8 },
  connectionBanner: { alignItems: 'center', paddingVertical: Spacing.one },
  liveError: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  pagination: { minHeight: 44, alignItems: 'center', justifyContent: 'center', gap: Spacing.one },
});
