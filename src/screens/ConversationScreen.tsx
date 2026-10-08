import { useHeaderHeight } from '@react-navigation/elements';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Pressable, StyleSheet, View } from 'react-native';

import { ContentFrame } from '@/components/ContentFrame';
import { MessageBubble } from '@/components/MessageBubble';
import { MessageInput } from '@/components/MessageInput';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useCanModerate } from '@/hooks/useCanModerate';
import { useMessages } from '@/hooks/useMessages';
import { parseConversationParams, type RootStackParamList } from '@/navigation/routes';
import { userMessage } from '@/services/ApiError';
import { useSession } from '@/session/SessionContext';
import type { ChatMessage } from '@/types/conversation';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTranslation } from '@/i18n';

type Props = NativeStackScreenProps<RootStackParamList, 'Conversation'>;

export function ConversationScreen({ route }: Props) {
  const { strings } = useTranslation();
  // Paramètres validés avant tout chargement : un identifiant invalide n'appelle jamais l'API.
  const params = useMemo(() => parseConversationParams(route.params), [route.params]);
  if (!params) return <ErrorState message={strings.states.conversationNotFound} />;
  return (
    <ValidConversation
      key={params.conversationId}
      conversationId={params.conversationId}
      messageId={params.messageId}
      focusToken={params.focusToken}
    />
  );
}

type ValidProps = { conversationId: string; messageId?: string; focusToken?: number };

/** Durée de la mise en évidence d'un message atteint depuis la recherche (3 s comme sur le Web). */
export const HIGHLIGHT_MS = 3000;

function ValidConversation({ conversationId, messageId, focusToken }: ValidProps) {
  const { strings } = useTranslation();
  const headerHeight = useHeaderHeight();
  const { user, drafts } = useSession();
  const theme = useTheme();
  const { messages, status, errorMessage, accessError, loadingOlder, olderError, connection, retry, loadOlder, jumpTo, send, edit, remove } =
    useMessages(conversationId, user?.id ?? '');
  const isRoom = conversationId.startsWith('room:');
  const canModerate = useCanModerate(conversationId);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const hasInlineError = status === 'error' && messages.length > 0;
  const displayedError = hasInlineError ? errorMessage ?? strings.errors.generic : errorMessage;
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);
  const [messageNotFound, setMessageNotFound] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const ready = status === 'ready';

  // Message demandé par la recherche : on charge les pages plus anciennes jusqu'à lui, puis on y défile.
  useEffect(() => {
    if (!messageId || !ready) return;
    let cancelled = false;
    // Nouvelle demande : l'avis précédent ne vaut plus.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessageNotFound(false);
    void jumpTo(messageId).then((found) => {
      if (cancelled) return;
      if (found) {
        setHighlightedId(messageId);
        setScrollTarget(messageId);
      } else {
        setMessageNotFound(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [messageId, focusToken, ready, jumpTo]);

  // Défilement une fois le message présent dans la liste (les pages anciennes viennent d'être ajoutées).
  useEffect(() => {
    if (!scrollTarget) return;
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

  const deleteMessage = useCallback(
    async (message: ChatMessage) => {
      setActionError(null);
      try {
        await remove(message.id);
        // Le message supprimé ne peut plus être en cours de modification.
        setEditingMessage((current) => (current?.id === message.id ? null : current));
      } catch (error) {
        setActionError(userMessage(error));
      }
    },
    [remove],
  );

  // Appui long : sur un de ses messages, modifier ou supprimer ; sur celui d'un autre, supprimer seulement et
  // uniquement pour un modérateur (la modification reste réservée à l'auteur). La suppression est définitive,
  // donc confirmée.
  const openActions = useCallback(
    (message: ChatMessage, moderation: boolean) => {
      const actions = strings.conversation.actions;
      const confirm = {
        text: actions.delete,
        style: 'destructive' as const,
        onPress: () =>
          Alert.alert(actions.confirmTitle, moderation ? actions.confirmBodyModeration : actions.confirmBody, [
            { text: actions.cancel, style: 'cancel' },
            { text: actions.delete, style: 'destructive', onPress: () => void deleteMessage(message) },
          ]),
      };
      Alert.alert(moderation ? actions.moderationTitle : actions.title, undefined, [
        ...(moderation ? [] : [{ text: actions.edit, onPress: () => setEditingMessage(message) }]),
        confirm,
        { text: actions.cancel, style: 'cancel' },
      ]);
    },
    [strings, deleteMessage],
  );

  // Hauteurs variables : si l'index n'est pas encore mesuré, on s'en approche puis on réessaie. Le délai est
  // annulé au démontage (ou remplacé par une nouvelle tentative) pour ne jamais agir sur un écran fermé.
  const scrollRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (scrollRetryTimer.current) clearTimeout(scrollRetryTimer.current);
    },
    [],
  );
  const onScrollToIndexFailed = useCallback((info: { index: number; averageItemLength: number }) => {
    listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
    if (scrollRetryTimer.current) clearTimeout(scrollRetryTimer.current);
    scrollRetryTimer.current = setTimeout(
      () => listRef.current?.scrollToIndex({ index: info.index, viewPosition: 0.5, animated: true }),
      100,
    );
  }, []);

  let body;
  if (status === 'loading') body = <LoadingState label={strings.states.loadingMessages} />;
  else if (status === 'error' && messages.length === 0) {
    body = <ErrorState message={errorMessage ?? strings.errors.generic} onRetry={retry} />;
  } else if (messages.length === 0) {
    body = <EmptyState title={strings.states.noMessages} hint={strings.states.firstMessage} />;
  }
  else {
    body = (
      <FlatList
        ref={listRef}
        // Liste inversée : le plus récent est en bas et le clavier ne le masque pas.
        inverted
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        testID="messages-list"
        data={messages}
        keyExtractor={(m) => m.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onScrollToIndexFailed={onScrollToIndexFailed}
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
                  <Pressable
                    onPress={() => void loadOlder()}
                    accessibilityRole="button"
                    accessibilityLabel="Réessayer le chargement des messages précédents"
                  >
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
            highlighted={item.id === highlightedId}
            moderated={item.senderId !== user?.id && canModerate}
            onLongPress={
              item.senderId === user?.id
                ? () => openActions(item, false)
                : canModerate
                  ? () => openActions(item, true)
                  : undefined
            }
          />
        )}
        contentContainerStyle={styles.list}
      />
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.fill, { backgroundColor: theme.background }]}
      behavior="padding"
      keyboardVerticalOffset={headerHeight}
    >
      <ContentFrame>
        <ThemedView style={styles.fill}>
          {connection !== 'ready' ? (
            <View style={[styles.connectionBanner, { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText type="small" themeColor="textSecondary">
                {connection === 'connecting' ? strings.connection.reconnecting : strings.connection.offline}
              </ThemedText>
            </View>
          ) : null}
          {accessError && (status !== 'error' || hasInlineError) && accessError !== displayedError ? (
            <ThemedText type="small" themeColor="danger" accessibilityRole="alert" style={styles.liveError}>
              {accessError}
            </ThemedText>
          ) : null}
          {displayedError && (status === 'ready' || hasInlineError) ? (
            <ThemedText type="small" themeColor="danger" accessibilityRole="alert" style={styles.liveError}>
              {displayedError}
            </ThemedText>
          ) : null}
          {actionError ? (
            <ThemedText type="small" themeColor="danger" accessibilityRole="alert" style={styles.liveError}>
              {actionError}
            </ThemedText>
          ) : null}
          {messageNotFound ? (
            <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite" style={styles.liveError}>
              {strings.search.messageNotFound}
            </ThemedText>
          ) : null}
          {body}
        </ThemedView>
        <MessageInput
          draftStore={drafts}
          conversationId={conversationId}
          onSend={send}
          editingMessage={editingMessage}
          onEdit={edit}
          onCancelEdit={() => setEditingMessage(null)}
        />
      </ContentFrame>
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
