import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ReceivedInvitation } from '@/hooks/useInvitationAlerts';
import { useTranslation } from '@/i18n';

/** Bandeau « Nouvelle invitation » : le toucher ouvre les invitations, la croix le ferme. */
export function InvitationBanner({ invitation, onOpen, onClose }: { invitation: ReceivedInvitation; onOpen: () => void; onClose: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { strings } = useTranslation();
  const text = invitation.name ? strings.notifications.invitedTo(invitation.name) : strings.notifications.invitedToServer;
  return (
    <View
      testID="invitation-banner"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.bar, { paddingTop: insets.top + Spacing.two, paddingLeft: insets.left + Spacing.three, paddingRight: insets.right + Spacing.two, backgroundColor: theme.primary }]}
    >
      <Pressable accessibilityRole="button" accessibilityLabel={`${strings.notifications.newInvitation} · ${strings.notifications.viewInvitations}`} onPress={onOpen} style={styles.body}>
        <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>{strings.notifications.newInvitation}</ThemedText>
        <ThemedText type="small" style={{ color: theme.onPrimary }}>{text} {strings.notifications.viewInvitations}</ThemedText>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={strings.notifications.dismiss} onPress={onClose} hitSlop={8} style={styles.close}>
        <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>✕</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingBottom: Spacing.two },
  body: { flex: 1, gap: 2 },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
