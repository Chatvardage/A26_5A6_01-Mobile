import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ChatMessage } from '@/types/conversation';
import { formatMessageTime } from '@/utils/formatTime';

export function MessageBubble({
  message,
  mine,
  showAuthor,
  onLongPress,
}: {
  message: ChatMessage;
  mine: boolean;
  showAuthor: boolean;
  onLongPress?: () => void;
}) {
  const theme = useTheme();
  const edited = new Date(message.updatedAt).getTime() !== new Date(message.createdAt).getTime();
  const pressable = mine && onLongPress !== undefined;
  // La largeur maximale s'applique à l'enfant direct de la ligne : un pourcentage sur la bulle
  // placée dans le Pressable serait relatif à la largeur de son propre contenu, ce qui la rétrécit
  // à chaque mise en page et force la coupure des mots au milieu.
  const bubble = (
    <View
      testID="message-bubble"
      style={[styles.bubble, !pressable && styles.limited, { backgroundColor: mine ? theme.tint : theme.backgroundElement }]}
    >
      {showAuthor && !mine ? (
        <ThemedText type="smallBold" themeColor="textSecondary">
          {message.senderName ?? 'Utilisateur inconnu'}
        </ThemedText>
      ) : null}
      <ThemedText style={mine ? styles.mineText : undefined}>{message.content}</ThemedText>
      <ThemedText
        type="small"
        accessibilityLabel={`${formatMessageTime(message.createdAt)}${edited ? ', modifié' : ''}`}
        style={[styles.meta, mine ? styles.mineText : { color: theme.textSecondary }]}
      >
        {formatMessageTime(message.createdAt)}
        {edited ? ' · modifié' : ''}
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
