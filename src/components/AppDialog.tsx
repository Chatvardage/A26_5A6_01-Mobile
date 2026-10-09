import { useCallback, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { ThemedText } from './themed-text';
import { useTheme } from '@/hooks/use-theme';

/** `cancel` se place à gauche; les autres actions à droite, dans l'ordre donné (la plus forte en dernier). */
export type DialogAction = { label: string; onPress?: () => void; kind?: 'cancel' | 'default' | 'danger' };
export type DialogOptions = { title: string; message?: string; quote?: string; actions: DialogAction[] };

/**
 * Dialogue de confirmation au style de l'application (remplace `Alert.alert`, dont l'apparence et l'ordre des
 * boutons dépendent du système). L'écran rend `dialog` et appelle `show`; une action ferme toujours le dialogue
 * avant de s'exécuter, ce qui permet d'enchaîner un second dialogue (choix, puis confirmation).
 */
export function useAppDialog() {
  const [options, setOptions] = useState<DialogOptions | null>(null);
  const show = useCallback((next: DialogOptions) => setOptions(next), []);
  const close = useCallback(() => setOptions(null), []);
  return { show, dialog: options ? <AppDialog options={options} onClose={close} /> : null };
}

function AppDialog({ options, onClose }: { options: DialogOptions; onClose: () => void }) {
  const theme = useTheme();
  const select = (action: DialogAction) => { onClose(); action.onPress?.(); };
  const button = (action: DialogAction) => {
    const filled = action.kind !== 'cancel';
    const color = action.kind === 'danger' ? theme.danger : theme.primary;
    return <Pressable key={action.label} accessibilityRole="button" accessibilityLabel={action.label} onPress={() => select(action)}
      style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 12, flexShrink: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: filled ? color : theme.textSecondary, backgroundColor: filled ? color : 'transparent', opacity: pressed ? 0.6 : 1 })}>
      <ThemedText type="smallBold" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ color: filled ? theme.onPrimary : theme.text }}>{action.label}</ThemedText>
    </Pressable>;
  };
  return <Modal transparent animationType="fade" visible onRequestClose={onClose}>
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16, backgroundColor: '#00000080' }}>
      <View accessibilityViewIsModal testID="app-dialog" style={{ width: '100%', maxWidth: 420, backgroundColor: theme.card, borderRadius: 20, padding: 18, gap: 14, borderWidth: 1, borderColor: theme.textSecondary + '30' }}>
        <ThemedText accessibilityRole="header" style={{ fontSize: 18, fontWeight: '700' }}>{options.title}</ThemedText>
        {options.message ? <ThemedText type="small" themeColor="textSecondary">{options.message}</ThemedText> : null}
        {options.quote ? <ThemedText numberOfLines={3} style={{ padding: 12, borderRadius: 12, backgroundColor: theme.backgroundSelected }}>{options.quote}</ThemedText> : null}
        {/* Une seule ligne, même en français : les boutons rétrécissent plutôt que de passer à la ligne. */}
        <View testID="app-dialog-actions" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
          {options.actions.filter(action => action.kind === 'cancel').map(button)}
          <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }} />
          {options.actions.filter(action => action.kind !== 'cancel').map(button)}
        </View>
      </View>
    </View>
  </Modal>;
}
