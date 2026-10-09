import type { ComponentProps } from 'react';
import { SymbolView } from 'expo-symbols';
import { Pressable, View } from 'react-native';
import { ThemedText } from './themed-text';
import { unreadLabel } from './UnreadBadge';
import { useTheme } from '@/hooks/use-theme';
/** `badge` : petite pastille de compteur après le libellé (rien si nul). */
export function ActionButton({ label, onPress, disabled = false, danger = false, compact = false, icon, badge = 0 }: { label: string; onPress: () => void; disabled?: boolean; danger?: boolean; compact?: boolean; icon?: ComponentProps<typeof SymbolView>['name']; badge?: number }) {
  const theme = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={badge > 0 ? `${label} (${unreadLabel(badge)})` : undefined} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ minHeight: 46, padding: compact ? 10 : 12, flexDirection: 'row', alignItems: 'center', gap: 8, ...(compact ? { flex: 1 } : {}), borderRadius: 10, borderWidth: 1, borderColor: danger ? theme.danger : theme.primary, backgroundColor: danger ? theme.backgroundSelected : theme.primary, opacity: disabled ? 0.4 : pressed ? 0.6 : 1, justifyContent: 'center' })}>{icon ? <SymbolView name={icon} size={20} tintColor={danger ? theme.danger : theme.onPrimary} /> : null}<ThemedText type="smallBold" style={{ color: danger ? theme.danger : theme.onPrimary }}>{label}</ThemedText>{badge > 0 ? <View testID="action-badge" style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.danger }}><ThemedText type="smallBold" style={{ color: '#ffffff', fontSize: 12, lineHeight: 16 }}>{unreadLabel(badge)}</ThemedText></View> : null}</Pressable>;
}
