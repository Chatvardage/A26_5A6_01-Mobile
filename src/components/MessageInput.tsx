import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { userMessage } from '@/services/ApiError';
import type { ChatMessage } from '@/types/conversation';

type Props = {
  conversationId: string;
  onSend: (text: string) => Promise<void>;
  editingMessage: Pick<ChatMessage, 'id' | 'content'> | null;
  onEdit: (messageId: string, text: string) => Promise<void>;
  onCancelEdit: () => void;
};

const drafts = new Map<string, string>();

export function MessageInput(props: Props) {
  const editingKey = props.editingMessage ? `edit:${props.editingMessage.id}` : 'compose';
  return <MessageInputState key={`${props.conversationId}:${editingKey}`} {...props} />;
}

function MessageInputState({ conversationId, onSend, editingMessage, onEdit, onCancelEdit }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState(() => editingMessage?.content ?? drafts.get(conversationId) ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textRef = useRef(text);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const changeText = (value: string) => {
    textRef.current = value;
    setText(value);
    if (!editingMessage) drafts.set(conversationId, value);
    setError(null);
  };

  const submit = async () => {
    const submittedText = textRef.current;
    const trimmed = submittedText.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      if (editingMessage) {
        await onEdit(editingMessage.id, trimmed);
        onCancelEdit();
      } else {
        await onSend(trimmed);
        if (textRef.current === submittedText && drafts.get(conversationId) === submittedText) {
          drafts.delete(conversationId);
          if (mounted.current) {
            textRef.current = '';
            setText('');
          }
        }
      }
    } catch (reason) {
      if (mounted.current) setError(typeof reason === 'string' ? reason : userMessage(reason));
    } finally {
      if (mounted.current) setSubmitting(false);
    }
  };

  const canSubmit = text.trim().length > 0 && !submitting;
  const editing = editingMessage !== null;

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: theme.background, borderTopColor: theme.backgroundSelected, paddingBottom: Spacing.two + insets.bottom },
      ]}
    >
      {editing ? (
        <View style={styles.editingLabel}>
          <ThemedText type="smallBold">Modification du message</ThemedText>
          <Pressable
            disabled={submitting}
            onPress={onCancelEdit}
            accessibilityRole="button"
            accessibilityLabel="Annuler la modification"
          >
            <ThemedText type="small" themeColor="textSecondary">
              Annuler
            </ThemedText>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.inputRow}>
        <TextInput
          value={text}
          onChangeText={changeText}
          placeholder={editing ? 'Modifier le message' : 'Écrire un message'}
          placeholderTextColor={theme.textSecondary}
          multiline
          maxLength={4000}
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          accessibilityLabel={editing ? 'Modifier le message' : 'Message'}
        />
        <Pressable
          disabled={!canSubmit}
          onPress={() => void submit()}
          accessibilityRole="button"
          accessibilityLabel={editing ? 'Enregistrer' : 'Envoyer'}
          style={({ pressed }) => [
            styles.send,
            { backgroundColor: theme.tint, opacity: !canSubmit ? 0.4 : pressed ? 0.7 : 1 },
          ]}
        >
          <ThemedText type="smallBold" style={styles.sendText}>
            {editing ? 'Enregistrer' : 'Envoyer'}
          </ThemedText>
        </Pressable>
      </View>
      {error ? (
        <ThemedText type="small" themeColor="danger" accessibilityRole="alert" style={styles.error}>
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  editingLabel: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  input: { flex: 1, maxHeight: 120, borderRadius: 18, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontSize: 16 },
  send: { borderRadius: 18, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2 },
  sendText: { color: '#ffffff' },
  error: { paddingHorizontal: Spacing.one, paddingBottom: Spacing.one },
});
