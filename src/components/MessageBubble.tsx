import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ChatMessage } from '@/types/conversation';
import { formatMessageTime } from '@/utils/formatTime';
import { useTranslation } from '@/i18n';

export function MessageBubble({ message, mine, showAuthor }: { message: ChatMessage; mine: boolean; showAuthor: boolean }) {
  const theme = useTheme();
  const { strings } = useTranslation();
  const edited = message.updatedAt !== message.createdAt;
  return (
    <View style={[styles.row, mine ? styles.rowMine : styles.rowOther]}>
      <View style={[styles.bubble, { backgroundColor: mine ? theme.primary : theme.bubble }]}>
        {showAuthor && !mine ? (
          <ThemedText type="smallBold" themeColor="textSecondary">
            {message.senderName ?? strings.conversation.unknownUser}
          </ThemedText>
        ) : null}
        <ThemedText style={mine ? styles.mineText : undefined}>{message.content}</ThemedText>
        <ThemedText type="small" style={[styles.meta, mine ? styles.mineText : { color: theme.textSecondary }]}>
          {formatMessageTime(message.createdAt)}
          {edited ? ` · ${strings.conversation.edited}` : ''}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one, flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '80%', borderRadius: 18, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  mineText: { color: '#ffffff' },
  meta: { alignSelf: 'flex-end', fontSize: 11, lineHeight: 14 },
});
