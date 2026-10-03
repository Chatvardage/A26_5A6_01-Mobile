import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  /** Absent tant que l'envoi réel n'est pas branché : le champ reste utilisable, le bouton désactivé. */
  onSend?: (text: string) => void;
};

export function MessageComposer({ onSend }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const canSend = Boolean(onSend) && text.trim().length > 0;

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: theme.background, borderTopColor: theme.backgroundSelected, paddingBottom: Spacing.two + insets.bottom },
      ]}
    >
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={onSend ? 'Écrire un message' : "Envoi bientôt disponible"}
        placeholderTextColor={theme.textSecondary}
        multiline
        maxLength={4000}
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        accessibilityLabel="Message"
      />
      <Pressable
        disabled={!canSend}
        onPress={() => {
          onSend?.(text.trim());
          setText('');
        }}
        accessibilityRole="button"
        accessibilityLabel="Envoyer"
        style={({ pressed }) => [styles.send, { backgroundColor: theme.tint, opacity: !canSend ? 0.4 : pressed ? 0.7 : 1 }]}
      >
        <ThemedText type="smallBold" style={styles.sendText}>
          Envoyer
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, maxHeight: 120, borderRadius: 18, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontSize: 16 },
  send: { borderRadius: 18, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2 },
  sendText: { color: '#ffffff' },
});
