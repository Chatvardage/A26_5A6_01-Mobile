import type { ComponentProps } from 'react';
import { SymbolView } from 'expo-symbols';
import { Pressable } from 'react-native';
import { ThemedText } from './themed-text';
import { useTheme } from '@/hooks/use-theme';
export function ActionButton({ label, onPress, disabled = false, danger = false, compact = false, icon }: { label: string; onPress: () => void; disabled?: boolean; danger?: boolean; compact?: boolean; icon?: ComponentProps<typeof SymbolView>['name'] }) {
  const theme = useTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ minHeight: 46, padding: compact ? 10 : 12, flexDirection: 'row', alignItems: 'center', gap: 8, ...(compact ? { flex: 1 } : {}), borderRadius: 10, borderWidth: 1, borderColor: danger ? theme.danger : theme.primary, backgroundColor: danger ? theme.backgroundSelected : theme.primary, opacity: disabled ? 0.4 : pressed ? 0.6 : 1, justifyContent: 'center' })}>{icon ? <SymbolView name={icon} size={20} tintColor={danger ? theme.danger : theme.onPrimary} /> : null}<ThemedText type="smallBold" style={{ color: danger ? theme.danger : theme.onPrimary }}>{label}</ThemedText></Pressable>;
}
