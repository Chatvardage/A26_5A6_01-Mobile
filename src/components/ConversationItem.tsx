import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { UnreadBadge } from '@/components/UnreadBadge';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ConversationSummary } from '@/types/conversation';
import { formatMessageTime } from '@/utils/formatTime';
import { displayMessage } from '@/utils/systemMessages';
import { displayName } from '@/utils/displayNames';
import { useTranslation } from '@/i18n';

type Props = {
  conversation: ConversationSummary;
  currentUserId?: string;
  onPress: (conversation: ConversationSummary) => void;
};

function ConversationItemBase({ conversation, currentUserId, onPress }: Props) {
  const theme = useTheme();
  const { strings } = useTranslation();
  const { subtitle, lastMessage, unreadCount } = conversation;
  const title = displayName(conversation.title, strings);
  const hasUnread = unreadCount > 0;
  const preview = lastMessage
    ? `${lastMessage.senderId === currentUserId ? `${strings.conversation.you} : ` : ''}${displayMessage(lastMessage, strings)}`
    : strings.conversation.noMessage;

  return (
    <Pressable
      onPress={() => onPress(conversation)}
      accessibilityRole="button"
      accessibilityLabel={`${title}${hasUnread ? `, ${strings.conversation.unread(unreadCount)}` : ''}. ${preview}`}
      android_ripple={{ color: theme.backgroundSelected }}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.backgroundSelected }]}
    >
      <View style={styles.main}>
        <View style={styles.titleLine}>
          <ThemedText type="smallBold" numberOfLines={1} style={styles.title}>
            {title}
          </ThemedText>
          {lastMessage ? (
            <ThemedText type="small" themeColor="textSecondary">
              {formatMessageTime(lastMessage.createdAt)}
            </ThemedText>
          ) : null}
        </View>
        {subtitle ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {subtitle}
          </ThemedText>
        ) : null}
        <View style={styles.previewLine}>
          <ThemedText
            type="small"
            themeColor={hasUnread ? 'text' : 'textSecondary'}
            numberOfLines={1}
            style={[styles.preview, hasUnread && styles.previewUnread]}
          >
            {preview}
          </ThemedText>
          <UnreadBadge count={unreadCount} />
        </View>
      </View>
    </Pressable>
  );
}

export const ConversationItem = memo(ConversationItemBase);

const styles = StyleSheet.create({
  row: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.three },
  main: { gap: Spacing.one },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  title: { flex: 1 },
  previewLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  preview: { flex: 1 },
  previewUnread: { fontWeight: '700' },
});
