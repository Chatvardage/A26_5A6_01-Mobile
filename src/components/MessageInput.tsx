import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTranslation } from '@/i18n';
import { useTheme } from '@/hooks/use-theme';
import { userMessage } from '@/services/ApiError';
import type { ChatMessage } from '@/types/conversation';

type Props = {
  conversationId: string;
  draftStore: Map<string, string>;
  onSend: (text: string) => Promise<void>;
  editingMessage: Pick<ChatMessage, 'id' | 'content'> | null;
  onEdit: (messageId: string, text: string) => Promise<void>;
  onCancelEdit: () => void;
};

const MAX_DRAFTS = 100;

function storeDraft(store: Map<string, string>, conversationId: string, value: string) {
  store.delete(conversationId);
  if (!value.trim()) return;
  store.set(conversationId, value);
  for (const oldestId of store.keys()) {
    if (store.size <= MAX_DRAFTS) break;
    store.delete(oldestId);
  }
}

export function MessageInput(props: Props) {
  const editingKey = props.editingMessage ? `edit:${props.editingMessage.id}` : 'compose';
  return <MessageInputState key={`${props.conversationId}:${editingKey}`} {...props} />;
}

function MessageInputState({ conversationId, draftStore, onSend, editingMessage, onEdit, onCancelEdit }: Props) {
  const theme = useTheme();
  const { strings } = useTranslation();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState(() => editingMessage?.content ?? draftStore.get(conversationId) ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const textRef = useRef(text);
  const mounted = useRef(true);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (editingMessage) return;
    const saved = draftStore.get(conversationId);
    if (saved !== undefined) storeDraft(draftStore, conversationId, saved);
  }, [conversationId, draftStore, editingMessage]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const changeText = (value: string) => {
    textRef.current = value;
    setText(value);
    if (!editingMessage) storeDraft(draftStore, conversationId, value);
    setError(null);
  };

  const submit = async () => {
    const submittedText = textRef.current;
    const trimmed = submittedText.trim();
    if (!trimmed || submittingRef.current) return;

    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      if (editingMessage) {
        await onEdit(editingMessage.id, trimmed);
        if (mounted.current) onCancelEdit();
      } else {
        await onSend(trimmed);
        const savedDraft = draftStore.get(conversationId);
        if (textRef.current === submittedText && (savedDraft === undefined || savedDraft === submittedText)) {
          draftStore.delete(conversationId);
          if (mounted.current) {
            textRef.current = '';
            setText('');
          }
        }
      }
    } catch (reason) {
      if (mounted.current) setError(reason);
    } finally {
      submittingRef.current = false;
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
          <ThemedText type="smallBold">{strings.composer.editingMessage}</ThemedText>
          <Pressable
            disabled={submitting}
            onPress={onCancelEdit}
            accessibilityRole="button"
            accessibilityLabel={strings.composer.cancelEdit}
          >
            <ThemedText type="small" themeColor="textSecondary">
              {strings.control.cancel}
            </ThemedText>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.inputRow}>
        <TextInput
          value={text}
          onChangeText={changeText}
          placeholder={editing ? strings.composer.editMessage : strings.composer.writeMessage}
          placeholderTextColor={theme.textSecondary}
          multiline
          maxLength={4000}
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          accessibilityLabel={editing ? strings.composer.editMessage : strings.accessibility.message}
        />
        <Pressable
          disabled={!canSubmit}
          onPress={() => void submit()}
          accessibilityRole="button"
          accessibilityLabel={editing ? strings.control.save : strings.accessibility.send}
          style={({ pressed }) => [
            styles.send,
            { backgroundColor: theme.tint, opacity: !canSubmit ? 0.4 : pressed ? 0.7 : 1 },
          ]}
        >
          <ThemedText type="smallBold" style={styles.sendText}>
            {editing ? strings.control.save : strings.accessibility.send}
          </ThemedText>
        </Pressable>
      </View>
      {error ? (
        <ThemedText type="small" themeColor="danger" accessibilityRole="alert" style={styles.error}>
          {typeof error === 'string' ? error : userMessage(error, strings)}
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
