import type { PropsWithChildren } from 'react';
import { View } from 'react-native';
import { ThemedText } from './themed-text';
import { useTheme } from '@/hooks/use-theme';
export function SectionCard({ title, children }: PropsWithChildren<{ title?: string }>) {
  const theme = useTheme();
  return <View style={{ backgroundColor: theme.card, borderRadius: 20, padding: 18, gap: 14, borderWidth: 1, borderColor: theme.textSecondary + '30' }}>
    {title ? <ThemedText style={{ fontSize: 20, fontWeight: '700' }}>{title}</ThemedText> : null}
    {children}
  </View>;
}
