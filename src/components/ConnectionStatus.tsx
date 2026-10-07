import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useConnection } from '@/hooks/useConnection';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTranslation } from '@/i18n';

/** Bandeau visible seulement quand la connexion est perdue ou en cours de rétablissement. */
// Couleurs d'état du client Web (--offline, --reconnecting) pour chaque thème.
const STATE_COLORS = {
  dark: { offline: '#ef4444', reconnecting: '#eab308', onReconnecting: '#0a2a25' },
  light: { offline: '#dc2626', reconnecting: '#ca8a04', onReconnecting: '#ffffff' },
} as const;

export function ConnectionStatus() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = STATE_COLORS[scheme];
  const { strings } = useTranslation();
  const { status } = useConnection();
  const insets = useSafeAreaInsets();
  if (status === 'online') return null;

  const offline = status === 'offline';
  return (
    <View
      testID="connection-status"
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.bar, { paddingTop: insets.top + Spacing.one + 2, backgroundColor: offline ? colors.offline : colors.reconnecting }]}
    >
      <ThemedText type="small" style={{ color: offline ? '#ffffff' : colors.onReconnecting }}>
        {offline ? strings.connection.offline : strings.connection.reconnecting}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.one + 2, alignItems: 'center' },
});
