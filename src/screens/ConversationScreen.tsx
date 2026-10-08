import { useHeaderHeight } from '@react-navigation/elements';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Pressable, StyleSheet, View } from 'react-native';

import { useAppDialog } from '@/components/AppDialog';
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
import { useReadReceipts } from '@/hooks/useReadReceipts';
import { hasRead } from '@/services/receipts.service';
import { usePublicProfiles } from '@/hooks/usePublicProfiles';
import { useCanWrite } from '@/hooks/useCanWrite';
import { shouldFollowMessages } from '@/utils/conversationScroll';
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
  // L'ancre initiale appartient à cette ouverture. Les résultats suivants passent par jumpTo,
  // sans réinitialiser l'historique en concurrence avec le saut vers le message.
  const [initialMessageId] = useState(messageId);
  const { hasNewer, loadingNewer, loadNewer, jumping, messages, status, errorMessage, accessError, loadingOlder, olderError, connection, retry, loadOlder, jumpTo, send, edit, remove } =
    useMessages(conversationId, user?.id ?? '', initialMessageId);
  const readers = useReadReceipts(conversationId);
  const profiles = usePublicProfiles(messages.map(message => message.senderId));
  const isRoom = conversationId.startsWith('room:');
  const canModerate = useCanModerate(conversationId);
  const canWrite = useCanWrite(conversationId);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const hasInlineError = status === 'error' && messages.length > 0;
  const displayedError = hasInlineError ? errorMessage ?? strings.errors.generic : errorMessage;
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const followLatest = useRef(!messageId);
  const [following, setFollowing] = useState(!messageId);
  const viewportHeight = useRef(0);
  const lastOwnId = messages.find(message => message.senderId === user?.id)?.id;
  const [scrollRequest, setScrollRequest] = useState(0);
  const latestId = messages[0]?.id;
  useEffect(() => {
    if (!latestId || !followLatest.current) return;
    let secondFrame: number | undefined;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => { if (followLatest.current) listRef.current?.scrollToOffset({ offset: 0, animated: true }); });
    });
    return () => { cancelAnimationFrame(firstFrame); if (secondFrame !== undefined) cancelAnimationFrame(secondFrame); };
  }, [latestId, scrollRequest]);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);
  const [messageNotFound, setMessageNotFound] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const ready = status === 'ready';

  // Message demandé par la recherche : on charge sa page directement, puis on y défile.
  useEffect(() => {
    if (!messageId || !ready) return;
    let cancelled = false;
    followLatest.current = false;
    // Nouvelle cible de navigation : conserver sa position de lecture.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFollowing(false);
    // Nouvelle demande : l'avis précédent ne vaut plus.
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
    listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: false });
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
  // donc confirmée. Annuler à gauche, puis Modifier et Supprimer (le plus à droite).
  const { show: showDialog, dialog } = useAppDialog();
  const openActions = useCallback(
    (message: ChatMessage, moderation: boolean) => {
      const actions = strings.conversation.actions;
      const cancel = { label: actions.cancel, kind: 'cancel' as const };
      const confirm = () =>
        showDialog({
          title: actions.confirmTitle,
          message: moderation ? actions.confirmBodyModeration : actions.confirmBody,
          quote: message.content,
          actions: [cancel, { label: actions.delete, kind: 'danger', onPress: () => void deleteMessage(message) }],
        });
      showDialog({
        title: moderation ? actions.moderationTitle : actions.title,
        message: moderation ? actions.moderationBody : actions.body,
        quote: message.content,
        actions: [
          cancel,
          ...(moderation ? [] : [{ label: actions.edit, onPress: () => setEditingMessage(message) }]),
          { label: actions.delete, kind: 'danger' as const, onPress: confirm },
        ],
      });
    },
    [strings, deleteMessage, showDialog],
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
      () => listRef.current?.scrollToIndex({ index: info.index, viewPosition: 0.5, animated: false }),
      100,
    );
  }, []);

  let body;
  if (status === 'loading' || jumping) body = <LoadingState label={strings.states.loadingMessages} />;
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
        maintainVisibleContentPosition={following ? undefined : { minIndexForVisible: 0 }}
        onLayout={event => { viewportHeight.current = event.nativeEvent.layout.height; }}
        onScroll={event => { const next = !hasNewer && shouldFollowMessages(event.nativeEvent.contentOffset.y, event.nativeEvent.layoutMeasurement?.height ?? viewportHeight.current); followLatest.current = next; setFollowing(next); }}
        scrollEventThrottle={16}
        onContentSizeChange={() => { if (followLatest.current && !scrollTarget ) listRef.current?.scrollToOffset({ offset: 0, animated: true }); }}
        testID="messages-list"
        data={messages}
        keyExtractor={(m) => m.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onScrollToIndexFailed={onScrollToIndexFailed}
        onEndReached={() => { if (!scrollTarget && !jumping) void loadOlder(); }}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={hasNewer ? <View style={styles.pagination}>
          {loadingNewer ? <ActivityIndicator color={theme.tint} /> : <Pressable accessibilityRole="button" accessibilityLabel={strings.composer.loadNewer} onPress={() => void loadNewer()}><ThemedText style={{color:theme.tint}}>{strings.composer.loadNewer}</ThemedText></Pressable>}
        </View> : null}
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
                    accessibilityLabel={strings.composer.retryHistory}
                  >
                    <ThemedText type="smallBold" style={{ color: theme.tint }}>
                      {strings.navigation.retry}
                    </ThemedText>
                  </Pressable>
                </>
              ) : null}
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <MessageBubble
            message={{ ...item, senderName: profiles[item.senderId]?.alias || item.senderName }}
            avatar={profiles[item.senderId]?.avatar}
            online={profiles[item.senderId]?.online}
            mine={item.senderId === user?.id}
            receipt={!isRoom && item.id === lastOwnId ? (readers.some(reader => hasRead(reader, item)) ? 'read' : item.deliveredAt ? 'delivered' : 'sent') : undefined}
            readerCount={isRoom && item.id === lastOwnId ? readers.filter(reader => reader.userId !== item.senderId && hasRead(reader, item)).length : undefined}
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
        {canWrite ? <MessageInput
          draftStore={drafts}
          conversationId={conversationId}
          onSend={async text => {
              await send(text);
              followLatest.current = true;
              setFollowing(true);
              setScrollRequest(value => value + 1);
            }}
          editingMessage={editingMessage}
          onEdit={edit}
          onCancelEdit={() => setEditingMessage(null)}
        /> : <ThemedText style={{ padding: 16 }}>{strings.control.readOnly}</ThemedText>}
      </ContentFrame>
      {dialog}
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
