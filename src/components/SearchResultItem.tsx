import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTranslation } from '@/i18n';
import { SYSTEM_AUTHOR, type SearchResult } from '@/services/searchService';
import { formatMessageTime } from '@/utils/formatTime';
import { displayMessage } from '@/utils/systemMessages';
import { displayName } from '@/utils/displayNames';
import { splitHighlight } from '@/partage/highlight';

type Props = {
  result: SearchResult;
  /**
   * `grouped` (recherche globale, sous l'en-tête « Messages privés » ou du serveur) : l'interlocuteur ou le
   * salon, puis l'auteur. `scoped` (une seule conversation) : l'auteur seulement, le lieu est déjà connu.
   */
  variant: 'grouped' | 'scoped';
  /** Texte recherché : ses occurrences sont surlignées dans l'extrait, comme sur le Web. */
  term?: string;
  onPress: (result: SearchResult) => void;
};

export function SearchResultItem({ result, variant, term = '', onPress }: Props) {
  const theme = useTheme();
  const { strings } = useTranslation();
  const sender =
    result.senderName ??
    (result.senderId === SYSTEM_AUTHOR ? strings.conversation.system : strings.conversation.unknownUser);
  const place =
    (result.conversationTitle ? (result.kind === 'room' ? displayName(result.conversationTitle, strings) : result.conversationTitle) : undefined) ?? (result.kind === 'room' ? strings.search.channel : strings.search.privateMessage);

  return (
    <Pressable
      onPress={() => onPress(result)}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? theme.backgroundSelected : theme.background }]}
    >
      <View style={styles.header}>
        <ThemedText type="smallBold" numberOfLines={1} style={styles.title}>
          {variant === 'grouped' ? place : sender}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {formatMessageTime(result.createdAt)}
        </ThemedText>
      </View>
      {variant === 'grouped' ? (
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {sender}
        </ThemedText>
      ) : null}
      <ThemedText numberOfLines={3}>
        {splitHighlight(displayMessage(result, strings), term).map((segment, index) =>
          segment.match ? (
            <ThemedText key={index} style={[styles.mark, { backgroundColor: theme.accent, color: theme.background }]}>
              {segment.text}
            </ThemedText>
          ) : (
            segment.text
          ),
        )}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2, gap: Spacing.one, minHeight: 44 },
  header: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  title: { flex: 1 },
  mark: { fontWeight: '700' },
});
