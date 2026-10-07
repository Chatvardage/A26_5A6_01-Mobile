import { useHeaderHeight } from '@react-navigation/elements';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, StyleSheet } from 'react-native';

import { MessageBubble } from '@/components/MessageBubble';
import { MessageComposer } from '@/components/MessageComposer';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useConversationHistory } from '@/hooks/useConversationHistory';
import { parseConversationParams, type RootStackParamList } from '@/navigation/routes';
import { useSession } from '@/session/SessionContext';
import type { ChatMessage } from '@/types/conversation';
import { useTranslation } from '@/i18n';

type Props = NativeStackScreenProps<RootStackParamList, 'Conversation'>;

/** Durée de la mise en évidence d'un message atteint depuis la recherche (3 s comme sur le Web). */
export const HIGHLIGHT_MS = 3000;

export function ConversationScreen({ route }: Props) {
  const { strings } = useTranslation();
  // Paramètres validés avant tout chargement : un identifiant invalide n'appelle jamais l'API.
  const params = useMemo(() => parseConversationParams(route.params), [route.params]);
  if (!params) return <ErrorState message={strings.states.conversationNotFound} />;
  return (
    <ValidConversation
      conversationId={params.conversationId}
      messageId={params.messageId}
      focusToken={params.focusToken}
    />
  );
}

type ValidProps = { conversationId: string; messageId?: string; focusToken?: number };

function ValidConversation({ conversationId, messageId, focusToken }: ValidProps) {
  const { strings } = useTranslation();
  const headerHeight = useHeaderHeight();
  const { user } = useSession();
  const { state, retry, jumpTo } = useConversationHistory(conversationId);
  const isRoom = conversationId.startsWith('room:');
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const ready = state.status === 'ready';
  const messages = state.status === 'ready' ? state.data : null;

  // Message demandé par la recherche : on charge les pages plus anciennes jusqu'à lui, puis on y défile.
  useEffect(() => {
    if (!messageId || !ready) return;
    let cancelled = false;
    // Nouvelle demande : l'avis et la mise en évidence précédents ne valent plus.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNotice(null);
    void jumpTo(messageId).then((found) => {
      if (cancelled) return;
      if (found) {
        setHighlightedId(messageId);
        setScrollTarget(messageId);
      } else {
        setNotice(strings.search.messageNotFound);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [messageId, focusToken, ready, jumpTo, strings]);

  // Défilement une fois le message présent dans la liste (les pages anciennes viennent d'être ajoutées).
  useEffect(() => {
    if (!scrollTarget || !messages) return;
    const index = messages.findIndex((m) => m.id === scrollTarget);
    if (index === -1) return;
    listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setScrollTarget(null);
  }, [scrollTarget, messages]);

  useEffect(() => {
    if (!highlightedId) return;
    const timer = setTimeout(() => setHighlightedId(null), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [highlightedId, focusToken]);

  // Hauteurs variables : si l'index n'est pas encore mesuré, on s'en approche puis on réessaie.
  const onScrollToIndexFailed = useCallback((info: { index: number; averageItemLength: number }) => {
    listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
    setTimeout(() => listRef.current?.scrollToIndex({ index: info.index, viewPosition: 0.5, animated: true }), 100);
  }, []);

  let body;
  if (state.status === 'loading') body = <LoadingState label={strings.states.loadingMessages} />;
  else if (state.status === 'error') body = <ErrorState message={state.message} onRetry={retry} />;
  else if (state.status === 'empty') body = <EmptyState title={strings.states.noMessages} hint={strings.states.firstMessage} />;
  else {
    body = (
      <FlatList
        ref={listRef}
        // Liste inversée : le plus récent est en bas et le clavier ne le masque pas.
        inverted
        data={state.data}
        keyExtractor={(m) => m.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onScrollToIndexFailed={onScrollToIndexFailed}
        renderItem={({ item }) => (
          <MessageBubble
            message={item}
            mine={item.senderId === user?.id}
            showAuthor={isRoom}
            highlighted={item.id === highlightedId}
          />
        )}
        contentContainerStyle={styles.list}
      />
    );
  }

  return (
    <KeyboardAvoidingView style={styles.fill} behavior="padding" keyboardVerticalOffset={headerHeight}>
      {notice ? (
        <ThemedText type="small" themeColor="danger" accessibilityRole="alert" style={styles.notice}>
          {notice}
        </ThemedText>
      ) : null}
      <ThemedView style={styles.fill}>{body}</ThemedView>
      <MessageComposer key={conversationId} conversationId={conversationId} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { paddingVertical: 8 },
  notice: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
});
