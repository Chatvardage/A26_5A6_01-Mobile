import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/session/SessionContext';

export function PreferencesScreen() {
  const theme = useTheme();
  const { user, signOut } = useSession();

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: theme.background }]} edges={['left', 'right']}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        Connecté en tant que
      </ThemedText>
      <ThemedText type="subtitle">{user?.pseudo ?? '—'}</ThemedText>
      <Pressable
        onPress={signOut}
        accessibilityRole="button"
        style={({ pressed }) => [styles.button, { borderColor: theme.danger, opacity: pressed ? 0.6 : 1 }]}
      >
        <ThemedText type="smallBold" style={{ color: theme.danger }}>
          Se déconnecter
        </ThemedText>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, padding: Spacing.three, gap: Spacing.two },
  button: { marginTop: Spacing.four, alignSelf: 'flex-start', borderWidth: 1, borderRadius: 8, paddingHorizontal: Spacing.four, paddingVertical: Spacing.two },
});
