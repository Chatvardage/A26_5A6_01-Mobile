import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { UnreadBadge } from '@/components/UnreadBadge';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ServerSummary } from '@/types/server';
import { useTranslation } from '@/i18n';

type Props = { server: ServerSummary; onPress: (server: ServerSummary) => void };

function ServerItemBase({ server, onPress }: Props) {
  const theme = useTheme();
  const { strings } = useTranslation();
  const details = `${server.memberCount} ${server.memberCount > 1 ? strings.server.members : strings.server.member} · ${server.channelIds.length} ${server.channelIds.length > 1 ? strings.server.channels : strings.server.channel}`;

  return (
    <Pressable
      onPress={() => onPress(server)}
      accessibilityRole="button"
      accessibilityLabel={`${server.name}, ${details}${server.unreadCount > 0 ? `, ${strings.server.unread(server.unreadCount)}` : ''}`}
      android_ripple={{ color: theme.backgroundSelected }}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.backgroundSelected }]}
    >
      <View style={[styles.avatar, { backgroundColor: theme.accent }]}>
        <ThemedText type="smallBold" style={styles.avatarText}>
          {server.name.slice(0, 1).toUpperCase()}
        </ThemedText>
      </View>
      <View style={styles.main}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {server.name}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {details}
        </ThemedText>
      </View>
      <UnreadBadge count={server.unreadCount} />
    </Pressable>
  );
}

export const ServerItem = memo(ServerItemBase);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: 14 },
  avatar: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#ffffff', fontSize: 18 },
  main: { flex: 1, gap: Spacing.half },
});
