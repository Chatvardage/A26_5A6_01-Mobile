import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/session/SessionContext';
import { useTranslation } from '@/i18n';

export function PreferencesScreen() {
  const theme = useTheme();
  const { strings } = useTranslation();
  const { user, signOut } = useSession();

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: theme.background }]} edges={['left', 'right']}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {strings.preferences.connectedAs}
      </ThemedText>
      <ThemedText type="subtitle" style={styles.username}>{user?.pseudo ?? '—'}</ThemedText>
      <Pressable
        onPress={signOut}
        accessibilityRole="button"
        style={({ pressed }) => [styles.button, { borderColor: theme.danger, opacity: pressed ? 0.6 : 1 }]}
      >
        <ThemedText type="smallBold" style={{ color: theme.danger }}>
          {strings.preferences.signOut}
        </ThemedText>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, padding: Spacing.four, gap: Spacing.two },
  username: { marginTop: 2 },
  button: { marginTop: Spacing.four, alignSelf: 'flex-start', borderWidth: 1, borderRadius: 14, paddingHorizontal: Spacing.four, paddingVertical: Spacing.two },
});
