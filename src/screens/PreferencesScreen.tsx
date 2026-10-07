import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useNotificationPermission } from '@/hooks/useNotificationPermission';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/session/SessionContext';
import { useTranslation } from '@/i18n';

export function PreferencesScreen() {
  const theme = useTheme();
  const { strings } = useTranslation();
  const { user, signOut } = useSession();
  const { permission, request, openSettings } = useNotificationPermission();

  // `undetermined` : on peut encore demander ; `denied` : seul le système peut rouvrir la question.
  const action =
    permission === 'undetermined'
      ? { label: strings.notifications.enable, run: () => void request() }
      : permission === 'denied'
        ? { label: strings.notifications.openSettings, run: () => void openSettings() }
        : null;

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: theme.background }]} edges={['left', 'right']}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {strings.preferences.connectedAs}
      </ThemedText>
      <ThemedText type="subtitle">{user?.pseudo ?? '—'}</ThemedText>

      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.section}>
        {strings.notifications.title}
      </ThemedText>
      {permission ? (
        <ThemedText testID="notification-permission">{strings.notifications[permission]}</ThemedText>
      ) : null}
      {action ? (
        <Pressable
          onPress={action.run}
          accessibilityRole="button"
          style={({ pressed }) => [styles.secondary, { borderColor: theme.tint, opacity: pressed ? 0.6 : 1 }]}
        >
          <ThemedText type="smallBold" style={{ color: theme.tint }}>
            {action.label}
          </ThemedText>
        </Pressable>
      ) : null}
      <ThemedText type="small" themeColor="textSecondary">
        {strings.notifications.badgeNote}
      </ThemedText>

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
  fill: { flex: 1, padding: Spacing.three, gap: Spacing.two },
  section: { marginTop: Spacing.four },
  secondary: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 8, paddingHorizontal: Spacing.four, paddingVertical: Spacing.two },
  button: { marginTop: Spacing.four, alignSelf: 'flex-start', borderWidth: 1, borderRadius: 8, paddingHorizontal: Spacing.four, paddingVertical: Spacing.two },
});
