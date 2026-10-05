import { useHeaderHeight } from '@react-navigation/elements';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo } from 'react';
import { FlatList, KeyboardAvoidingView, StyleSheet } from 'react-native';

import { MessageBubble } from '@/components/MessageBubble';
import { MessageComposer } from '@/components/MessageComposer';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { ThemedView } from '@/components/themed-view';
import { useConversationHistory } from '@/hooks/useConversationHistory';
import { parseConversationParams, type RootStackParamList } from '@/navigation/routes';
import { useSession } from '@/session/SessionContext';
import { useTranslation } from '@/i18n';

type Props = NativeStackScreenProps<RootStackParamList, 'Conversation'>;

export function ConversationScreen({ route }: Props) {
  const { strings } = useTranslation();
  // Paramètres validés avant tout chargement : un identifiant invalide n'appelle jamais l'API.
  const params = useMemo(() => parseConversationParams(route.params), [route.params]);
  if (!params) return <ErrorState message={strings.states.conversationNotFound} />;
  return <ValidConversation conversationId={params.conversationId} />;
}

function ValidConversation({ conversationId }: { conversationId: string }) {
  const { strings } = useTranslation();
  const headerHeight = useHeaderHeight();
  const { user } = useSession();
  const { state, retry } = useConversationHistory(conversationId);
  const isRoom = conversationId.startsWith('room:');

  let body;
  if (state.status === 'loading') body = <LoadingState label={strings.states.loadingMessages} />;
  else if (state.status === 'error') body = <ErrorState message={state.message} onRetry={retry} />;
  else if (state.status === 'empty') body = <EmptyState title={strings.states.noMessages} hint={strings.states.firstMessage} />;
  else {
    body = (
      <FlatList
        // Liste inversée : le plus récent est en bas et le clavier ne le masque pas.
        inverted
        data={state.data}
        keyExtractor={(m) => m.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        renderItem={({ item }) => <MessageBubble message={item} mine={item.senderId === user?.id} showAuthor={isRoom} />}
        contentContainerStyle={styles.list}
      />
    );
  }

  return (
    <KeyboardAvoidingView style={styles.fill} behavior="padding" keyboardVerticalOffset={headerHeight}>
      <ThemedView style={styles.fill}>{body}</ThemedView>
      <MessageComposer />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { paddingVertical: 8 },
});
