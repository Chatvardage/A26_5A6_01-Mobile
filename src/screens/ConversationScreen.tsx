import { useHeaderHeight } from '@react-navigation/elements';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { useMessageScrollTarget } from '@/hooks/useMessageScrollTarget';
import { parseConversationParams, Routes, type RootStackParamList } from '@/navigation/routes';
import { useProfileSheet } from '@/components/ProfileSheet';
import { parseConversationId } from '@/types/conversationId';
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

export function ConversationScreen({ route, navigation }: Props) {
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
      title={params.title}
      navigation={navigation}
    />
  );
}

type ValidProps = { conversationId: string; messageId?: string; focusToken?: number; title?: string; navigation: Props['navigation'] };

/** Durée de la mise en évidence d'un message atteint depuis la recherche (3 s comme sur le Web). */
export const HIGHLIGHT_MS = 3000;

function ValidConversation({ conversationId, messageId, focusToken, title, navigation }: ValidProps) {
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
  const isRoom = conversationId.startsWith('room:');
  // Message privé (identifiant déjà validé) : l'autre personne est suivie même sans message, pour le titre (son alias s'il en a un).
  const partnerId = isRoom ? null : parseConversationId(conversationId)!.targetId;
  const profiles = usePublicProfiles([...messages.map(message => message.senderId), ...(partnerId ? [partnerId] : [])]);
  const partnerAlias = partnerId ? profiles[partnerId]?.alias : null;
  const partnerPseudo = messages.find(message => message.senderId === partnerId)?.senderName;
  const headerTitle = partnerAlias || partnerPseudo || title;
  useLayoutEffect(() => {
    if (partnerId && headerTitle) navigation.setOptions({ title: headerTitle });
  }, [navigation, partnerId, headerTitle]);
  const profileSheet = useProfileSheet({
    profiles,
    currentConversationId: conversationId,
    onMessage: (userId, name) => navigation.push(Routes.Conversation, { conversationId: `dm:${userId}`, title: name }),
  });
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
  const { scrollTarget, prepareScroll, clearScroll, positionScroll, hasPendingScroll, onListLayout, onListContentSizeChange, onViewableItemsChanged, onScrollToIndexFailed } = useMessageScrollTarget(listRef, setHighlightedId);
  const [messageNotFound, setMessageNotFound] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const ready = status === 'ready';
  const [preparedRequest, setPreparedRequest] = useState<{ messageId: string; focusToken?: number } | null>(null);
  // Les nouveaux paramètres arrivent avant les effets. Ce rendu doit déjà afficher le chargement,
  // plutôt que peindre une image de l'ancienne liste puis la masquer au rendu suivant.
  const navigationPending = !!messageId && (preparedRequest === null || preparedRequest.messageId !== messageId || preparedRequest.focusToken !== focusToken);

  // Message demandé par la recherche : on charge sa page directement, puis on y défile.
  useLayoutEffect(() => {
    if (!messageId || !ready) return;
    let cancelled = false;
    followLatest.current = false;
    // Nouvelle cible de navigation : conserver sa position de lecture.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFollowing(false);
    prepareScroll(messageId);
    setPreparedRequest({ messageId, focusToken });
    setHighlightedId(null);
    // Nouvelle demande : l'avis précédent ne vaut plus.
    setMessageNotFound(false);
    void jumpTo(messageId).then((found) => {
      if (cancelled) return;
      if (!found) {
        clearScroll();
        setMessageNotFound(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [messageId, focusToken, ready, jumpTo, prepareScroll, clearScroll]);

  // Attendre aussi la fin du saut : pendant jumping, la liste est démontée et sa référence est vide.
  // Un rendu intermédiaire ne doit donc pas consommer la cible avant de pouvoir défiler.
  useEffect(() => {
    if (!scrollTarget || jumping) return;
    const index = messages.findIndex((m) => m.id === scrollTarget);
    if (index === -1) return;
    positionScroll(index);
  }, [scrollTarget, focusToken, messages, jumping, positionScroll]);

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

  let body;
  if (status === 'loading' || jumping || (ready && navigationPending)) body = <LoadingState label={strings.states.loadingMessages} />;
  else if (status === 'error' && messages.length === 0) {
    body = <ErrorState message={errorMessage ?? strings.errors.generic} onRetry={retry} />;
  } else if (messages.length === 0) {
    body = <EmptyState title={strings.states.noMessages} hint={strings.states.firstMessage} />;
  }
  else {
    body = (
      <View style={styles.fill}>
      <FlatList
        ref={listRef}
        style={scrollTarget ? styles.hiddenList : undefined}
        pointerEvents={scrollTarget ? 'none' : 'auto'}
        accessibilityElementsHidden={!!scrollTarget}
        importantForAccessibility={scrollTarget ? 'no-hide-descendants' : 'auto'}
        // Liste inversée : le plus récent est en bas et le clavier ne le masque pas.
        inverted
        maintainVisibleContentPosition={following || scrollTarget ? undefined : { minIndexForVisible: 0 }}
        onLayout={event => { viewportHeight.current = event.nativeEvent.layout.height; onListLayout(); }}
        onScroll={event => { if (hasPendingScroll()) return; const next = !hasNewer && shouldFollowMessages(event.nativeEvent.contentOffset.y, event.nativeEvent.layoutMeasurement?.height ?? viewportHeight.current); followLatest.current = next; setFollowing(next); }}
        scrollEventThrottle={16}
        onContentSizeChange={() => { onListContentSizeChange(); if (followLatest.current && !hasPendingScroll()) listRef.current?.scrollToOffset({ offset: 0, animated: true }); }}
        onViewableItemsChanged={onViewableItemsChanged}
        testID="messages-list"
        data={messages}
        // Une fenêtre de saut contient au plus 101 messages : la mesurer en une fois évite les
        // ajouts par lots après la révélation. Garder ce nombre stable pendant la lecture.
        initialNumToRender={messageId ? 101 : 10}
        keyExtractor={(m) => m.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onScrollToIndexFailed={onScrollToIndexFailed}
        // Les approximations de placement ne doivent pas déclencher la pagination.
        onEndReached={() => { if (!hasPendingScroll()) void loadOlder(); }}
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
            onAvatarPress={item.senderId === 'system' ? undefined : () => profileSheet.show({ userId: item.senderId, pseudo: item.senderName })}
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
      {scrollTarget ? <View style={StyleSheet.absoluteFill} testID="message-positioning"><LoadingState label={strings.states.loadingMessages} /></View> : null}
      </View>
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
      {profileSheet.sheet}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  hiddenList: { opacity: 0 },
  list: { paddingVertical: 8 },
  connectionBanner: { alignItems: 'center', paddingVertical: Spacing.one },
  liveError: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  pagination: { minHeight: 44, alignItems: 'center', justifyContent: 'center', gap: Spacing.one },
});
