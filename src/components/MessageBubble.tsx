import { Pressable, StyleSheet, View } from 'react-native';

import { UserAvatar } from './UserAvatar';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ChatMessage } from '@/types/conversation';
import { formatMessageTime } from '@/utils/formatTime';
import { displayMessage } from '@/utils/systemMessages';
import { useTranslation } from '@/i18n';

export function MessageBubble({
  message,
  mine,
  showAuthor,
  onLongPress,
  moderated = false,
  highlighted = false,
  avatar,
  online,
  receipt,
  readerCount,
  onAvatarPress,
}: {
  message: ChatMessage;
  avatar?: string | null;
  online?: boolean;
  receipt?: 'sent' | 'delivered' | 'read';
  readerCount?: number;
  mine: boolean;
  showAuthor: boolean;
  onLongPress?: () => void;
  /** Message d'un autre membre que l'utilisateur peut supprimer en tant que modérateur (appui long permis). */
  moderated?: boolean;
  /** Message atteint depuis la recherche : entouré quelques secondes, comme `.message-cible` sur le Web. */
  highlighted?: boolean;
  /** Appui sur la photo de l'auteur : ouvre sa fiche de profil. */
  onAvatarPress?: () => void;
}) {
  const theme = useTheme();
  const { strings } = useTranslation();
  const content = displayMessage(message, strings);
  const author = message.senderId === 'system' ? strings.conversation.system : message.senderName ?? strings.conversation.unknownUser;
  const edited = new Date(message.updatedAt).getTime() !== new Date(message.createdAt).getTime();
  const pressable = (mine || moderated) && onLongPress !== undefined;
  // La largeur maximale s'applique à l'enfant direct de la ligne : un pourcentage sur la bulle
  // placée dans le Pressable serait relatif à la largeur de son propre contenu, ce qui la rétrécit
  // à chaque mise en page et force la coupure des mots au milieu.
  const bubble = (
    <View
      testID="message-bubble"
      accessibilityState={highlighted ? { selected: true } : undefined}
      style={[
        styles.bubble,
        { backgroundColor: mine ? theme.tint : theme.backgroundElement },
      ]}
    >
      {showAuthor && !mine ? (
        <ThemedText type="smallBold" themeColor="textSecondary">
          {author}
        </ThemedText>
      ) : null}
      <ThemedText style={mine ? styles.mineText : undefined}>{content}</ThemedText>
      {/* Le contour ne participe pas à la mise en page : révéler ou retirer le surlignage ne déplace rien. */}
      {highlighted ? <View testID="message-highlight" pointerEvents="none" style={[StyleSheet.absoluteFill, styles.highlight, { borderColor: theme.accent }]} /> : null}
    </View>
  );
  return (
    <View testID="message-row" style={[styles.row, mine ? styles.rowMine : styles.rowOther]}>
      {!mine ? (onAvatarPress ? (
        <Pressable accessibilityRole="button" accessibilityLabel={strings.profileCard.view(author)} hitSlop={6} onPress={onAvatarPress}>
          <UserAvatar avatar={avatar} online={online} name={author} />
        </Pressable>
      ) : <UserAvatar avatar={avatar} online={online} name={author} />) : null}
      <View testID="message-content" style={styles.limited}>
      {pressable ? (
        <Pressable
          onLongPress={onLongPress}
          accessibilityRole="button"
          accessibilityLabel={content}
          accessibilityHint={mine ? strings.conversation.actions.hint : strings.conversation.actions.moderationHint}
        >
          {bubble}
        </Pressable>
      ) : (
        bubble
      )}
      <View style={{ paddingTop: 4, gap: 3 }}>
      <ThemedText
        type="small"
        accessibilityLabel={`${formatMessageTime(message.createdAt)}${edited ? `, ${strings.conversation.edited}` : ''}`}
        style={[styles.meta, { color: theme.textSecondary, alignSelf: mine ? 'flex-end' : 'flex-start' }]}
      >
        {formatMessageTime(message.createdAt)}
        {edited ? ` · ${strings.conversation.edited}` : ''}
      </ThemedText>
      {receipt ? <ThemedText accessibilityLabel={strings.control[receipt]} type="small" style={[styles.meta, { color: theme.textSecondary }, receipt === 'read' ? { color: theme.accent, fontWeight: '700' } : undefined]}>{receipt === 'sent' ? '\u2713' : '\u2713\u2713'}</ThemedText> : null}
      {readerCount !== undefined ? <ThemedText type="small" style={[styles.meta, { color: theme.textSecondary }]}>{strings.control.seenBy(readerCount)}</ThemedText> : null}
      </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one, flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  rowMine: { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start' },
  bubble: { borderRadius: 14, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  highlight: { borderRadius: 14, borderWidth: 2 },
  limited: { maxWidth: '80%', flexShrink: 1 },
  mineText: { color: '#ffffff' },
  meta: { alignSelf: 'flex-end', fontSize: 11, lineHeight: 14 },
});
