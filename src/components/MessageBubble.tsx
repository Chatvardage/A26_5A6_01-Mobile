import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ChatMessage } from '@/types/conversation';
import { formatMessageTime } from '@/utils/formatTime';
import { useTranslation } from '@/i18n';

export function MessageBubble({
  message,
  mine,
  showAuthor,
  onLongPress,
  moderated = false,
  highlighted = false,
}: {
  message: ChatMessage;
  mine: boolean;
  showAuthor: boolean;
  onLongPress?: () => void;
  /** Message d'un autre membre que l'utilisateur peut supprimer en tant que modérateur (appui long permis). */
  moderated?: boolean;
  /** Message atteint depuis la recherche : entouré quelques secondes, comme `.message-cible` sur le Web. */
  highlighted?: boolean;
}) {
  const theme = useTheme();
  const { strings } = useTranslation();
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
        !pressable && styles.limited,
        { backgroundColor: mine ? theme.tint : theme.backgroundElement },
        highlighted && { borderWidth: 2, borderColor: theme.accent },
      ]}
    >
      {showAuthor && !mine ? (
        <ThemedText type="smallBold" themeColor="textSecondary">
          {message.senderName ?? strings.conversation.unknownUser}
        </ThemedText>
      ) : null}
      <ThemedText style={mine ? styles.mineText : undefined}>{message.content}</ThemedText>
      <ThemedText
        type="small"
        accessibilityLabel={`${formatMessageTime(message.createdAt)}${edited ? `, ${strings.conversation.edited}` : ''}`}
        style={[styles.meta, mine ? styles.mineText : { color: theme.textSecondary }]}
      >
        {formatMessageTime(message.createdAt)}
        {edited ? ` · ${strings.conversation.edited}` : ''}
      </ThemedText>
    </View>
  );
  return (
    <View style={[styles.row, mine ? styles.rowMine : styles.rowOther]}>
      {pressable ? (
        <Pressable
          onLongPress={onLongPress}
          accessibilityRole="button"
          accessibilityLabel={message.content}
          accessibilityHint={mine ? strings.conversation.actions.hint : strings.conversation.actions.moderationHint}
          style={styles.limited}
        >
          {bubble}
        </Pressable>
      ) : (
        bubble
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one, flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start' },
  bubble: { borderRadius: 14, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  limited: { maxWidth: '80%', flexShrink: 1 },
  mineText: { color: '#ffffff' },
  meta: { alignSelf: 'flex-end', fontSize: 11, lineHeight: 14 },
});
