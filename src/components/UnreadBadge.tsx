import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

export function unreadLabel(count: number): string {
  return count > 99 ? '99+' : String(count);
}

/** Pastille de messages non lus ; ne rend rien quand le compteur est nul. */
export function UnreadBadge({ count }: { count: number }) {
  const theme = useTheme();
  if (count <= 0) return null;
  return (
    <View style={[styles.badge, { backgroundColor: theme.tint }]} testID="unread-badge">
      <ThemedText type="smallBold" style={styles.text}>
        {unreadLabel(count)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  text: { color: '#ffffff', fontSize: 12, lineHeight: 16 },
});
