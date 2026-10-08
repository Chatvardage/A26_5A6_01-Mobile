import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTranslation } from '@/i18n';

export type RefreshProps = { refreshing: boolean; onRefresh: () => void };

/** Zone centrée ; avec `refresh`, elle devient défilable pour permettre de tirer pour rafraîchir. */
function Centered({ children, refresh, ...rest }: { children: ReactNode; refresh?: RefreshProps; accessibilityRole?: 'alert' }) {
  if (!refresh) {
    return (
      <ThemedView style={styles.center} {...rest}>
        {children}
      </ThemedView>
    );
  }
  return (
    <ScrollView
      testID="refreshable-state"
      contentContainerStyle={styles.center}
      refreshControl={<RefreshControl refreshing={refresh.refreshing} onRefresh={refresh.onRefresh} />}
      {...rest}
    >
      {children}
    </ScrollView>
  );
}

/** Échec d'un rafraîchissement : la liste reste affichée dessous, avec la raison et une action Réessayer. */
export function RefreshErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  const theme = useTheme();
  const { strings } = useTranslation();
  return (
    <ThemedView
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.banner, { backgroundColor: theme.backgroundElement }]}
    >
      <ThemedText type="small" themeColor="danger" style={styles.bannerText}>
        {message}
      </ThemedText>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel={strings.navigation.retry}
        hitSlop={8}
        style={styles.bannerButton}
      >
        <ThemedText type="smallBold" style={{ color: theme.tint }}>
          {strings.navigation.retry}
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

export function LoadingState({ label }: { label?: string }) {
  const theme = useTheme();
  const { strings } = useTranslation();
  const displayLabel = label ?? strings.states.loading;
  return (
    <ThemedView style={styles.center} accessibilityRole="progressbar" accessibilityLabel={displayLabel}>
      <ActivityIndicator size="large" color={theme.tint} />
      <ThemedText type="small" themeColor="textSecondary">
        {displayLabel}
      </ThemedText>
    </ThemedView>
  );
}

export function EmptyState({ title, hint, refresh }: { title: string; hint?: string; refresh?: RefreshProps }) {
  return (
    <Centered refresh={refresh}>
      <ThemedText type="smallBold">{title}</ThemedText>
      {hint ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
          {hint}
        </ThemedText>
      ) : null}
    </Centered>
  );
}

export function ErrorState({ message, onRetry, refresh }: { message: string; onRetry?: () => void; refresh?: RefreshProps }) {
  const theme = useTheme();
  const { strings } = useTranslation();
  return (
    <Centered refresh={refresh} accessibilityRole="alert">
      <ThemedText type="smallBold" style={{ color: theme.danger }}>
        {strings.states.error}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
        {message}
      </ThemedText>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          style={({ pressed }) => [styles.button, { backgroundColor: theme.tint, opacity: pressed ? 0.7 : 1 }]}
        >
          <ThemedText type="smallBold" style={styles.buttonText}>
            {strings.navigation.retry}
          </ThemedText>
        </Pressable>
      ) : null}
    </Centered>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.four },
  centerText: { textAlign: 'center' },
  button: { marginTop: Spacing.two, paddingHorizontal: Spacing.four, paddingVertical: Spacing.two, borderRadius: 8 },
  buttonText: { color: '#ffffff' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  bannerText: { flex: 1 },
  bannerButton: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
});
