import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ConversationSummary } from '@/types/conversation';
import { formatMessageTime } from '@/utils/formatTime';

type Props = {
  conversation: ConversationSummary;
  currentUserId?: string;
  onPress: (conversation: ConversationSummary) => void;
};

export function unreadLabel(count: number): string {
  return count > 99 ? '99+' : String(count);
}

function ConversationItemBase({ conversation, currentUserId, onPress }: Props) {
  const theme = useTheme();
  const { title, subtitle, lastMessage, unreadCount } = conversation;
  const hasUnread = unreadCount > 0;
  const preview = lastMessage
    ? `${lastMessage.senderId === currentUserId ? 'Vous : ' : ''}${lastMessage.content}`
    : 'Aucun message';

  return (
    <Pressable
      onPress={() => onPress(conversation)}
      accessibilityRole="button"
      accessibilityLabel={`${title}${hasUnread ? `, ${unreadCount} non lus` : ''}. ${preview}`}
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
          {hasUnread ? (
            <View style={[styles.badge, { backgroundColor: theme.tint }]} testID="unread-badge">
              <ThemedText type="smallBold" style={styles.badgeText}>
                {unreadLabel(unreadCount)}
              </ThemedText>
            </View>
          ) : null}
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
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#ffffff', fontSize: 12, lineHeight: 16 },
});
