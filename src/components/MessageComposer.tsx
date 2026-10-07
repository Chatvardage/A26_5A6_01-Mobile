import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useDraft } from '@/hooks/useDraft';
import { useTheme } from '@/hooks/use-theme';
import { useTranslation } from '@/i18n';

type Props = {
  /** Le brouillon est conservé par conversation : monter ce composant avec `key={conversationId}`. */
  conversationId: string;
  /**
   * Absent tant que l'envoi réel n'est pas branché : le champ reste utilisable, le bouton désactivé.
   * Un envoi qui échoue (rejet) laisse le texte dans le champ et dans le brouillon sur l'appareil.
   */
  onSend?: (text: string) => Promise<void> | void;
};

export function MessageComposer({ conversationId, onSend }: Props) {
  const theme = useTheme();
  const { strings } = useTranslation();
  const insets = useSafeAreaInsets();
  const { text, setText, clear } = useDraft(conversationId);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const latest = useRef(text);
  useEffect(() => {
    latest.current = text;
  });
  const canSend = Boolean(onSend) && text.trim().length > 0 && !sending;

  const send = async () => {
    const sent = text;
    setSending(true);
    setFailed(false);
    try {
      await onSend?.(sent.trim());
      // Texte modifié pendant l'envoi : on ne l'efface pas.
      if (latest.current === sent) clear();
    } catch {
      setFailed(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: theme.background, borderTopColor: theme.backgroundSelected, paddingBottom: Spacing.two + insets.bottom },
      ]}
    >
      <View style={styles.field}>
        {failed ? (
          <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
            {strings.composer.notSent}
          </ThemedText>
        ) : null}
        <TextInput
          value={text}
          onChangeText={(value) => {
            setFailed(false);
            setText(value);
          }}
          placeholder={onSend ? strings.composer.writeMessage : strings.composer.unavailable}
          placeholderTextColor={theme.textSecondary}
          multiline
          maxLength={4000}
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          accessibilityLabel={strings.accessibility.message}
        />
      </View>
      <Pressable
        disabled={!canSend}
        onPress={() => void send()}
        accessibilityRole="button"
        accessibilityLabel={strings.accessibility.send}
        style={({ pressed }) => [styles.send, { backgroundColor: theme.tint, opacity: !canSend ? 0.4 : pressed ? 0.7 : 1 }]}
      >
        <ThemedText type="smallBold" style={styles.sendText}>
          {strings.accessibility.send}
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
  field: { flex: 1, gap: Spacing.one },
  input: { maxHeight: 120, borderRadius: 18, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontSize: 16 },
  send: { borderRadius: 18, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2 },
  sendText: { color: '#ffffff' },
});
