import { useState } from 'react';
import { Pressable, SectionList, StyleSheet, TextInput, View } from 'react-native';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useSearchSummary } from '@/hooks/useSearchSummary';
import { useTheme } from '@/hooks/use-theme';
import { useTranslation } from '@/i18n';
import type { ConversationMatch, ServerMatch } from '@/services/searchSummaryService';

type Props = {
  serverId?: string;
  title?: string;
  initialQuery?: string;
  onOpenConversation: (match: ConversationMatch, query: string) => void;
  onOpenServer?: (match: ServerMatch, query: string) => void;
};
type Row = { id: string; title: string; count: number; open: () => void };
type Category = 'dm' | 'servers' | 'channels';
const PAGE_SIZE = 8;

/** Navigation dans les correspondances : personnes / serveurs, puis salons d'un serveur. */
export function SearchSummaryPanel({ serverId, title, initialQuery, onOpenConversation, onOpenServer }: Props) {
  const theme = useTheme();
  const { strings } = useTranslation();
  const search = useSearchSummary(initialQuery);
  const [expanded, setExpanded] = useState({ term: '', dm: PAGE_SIZE, servers: PAGE_SIZE, channels: PAGE_SIZE });
  const limits = expanded.term === search.term ? expanded : { term: search.term, dm: PAGE_SIZE, servers: PAGE_SIZE, channels: PAGE_SIZE };
  const server = search.data?.servers.find(item => item.serverId === serverId);
  const conversationRows = (items: ConversationMatch[]): Row[] => items.filter(item => item.count > 0).map(item => ({
    id: item.conversationId, title: item.title ?? (item.conversationId.startsWith('dm:') ? strings.search.scopedFallback : strings.search.channels),
    count: item.count, open: () => onOpenConversation(item, search.term),
  }));
  const categories: { key: Category; header: string; rows: Row[] }[] = serverId
    ? [{ key: 'channels', header: server?.title ?? title ?? strings.search.channels, rows: conversationRows(server?.channels ?? []) }]
    : [
        { key: 'dm', header: strings.search.privateMessages, rows: conversationRows(search.data?.directMessages ?? []) },
        { key: 'servers', header: strings.navigation.servers, rows: (search.data?.servers ?? []).filter(item => item.count > 0).map(item => ({
          id: item.serverId, title: item.title ?? strings.navigation.server, count: item.count,
          open: () => onOpenServer?.(item, search.term),
        })) },
      ];
  const sections = categories.filter(category => category.rows.length > 0).map(category => ({
    ...category, data: category.rows.slice(0, limits[category.key]),
  }));
  let body;
  if (search.status === 'idle') body = <EmptyState title={strings.search.prompt} hint={strings.search.promptHint} />;
  else if (search.status === 'tooShort') body = <EmptyState title={strings.search.tooShort} />;
  else if (search.status === 'loading') body = <LoadingState label={strings.search.searching} />;
  else if (search.status === 'error') body = <ErrorState message={search.error ?? ''} onRetry={search.retry} />;
  else if (!sections.length) body = <EmptyState title={strings.search.noResults} hint={strings.search.noResultsHint} />;
  else body = (
    <SectionList
      sections={sections}
      initialNumToRender={30}
      keyExtractor={row => row.id}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      renderSectionHeader={({ section }) => (
        <View style={[styles.header, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="smallBold">{section.header}</ThemedText>
        </View>
      )}
      renderItem={({ item }) => (
        <Pressable accessibilityRole="button" onPress={item.open} style={styles.row}>
          <ThemedText style={styles.name} numberOfLines={1}>{item.title}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{strings.search.results(item.count)}</ThemedText>
        </Pressable>
      )}
      renderSectionFooter={({ section }) => section.data.length < section.rows.length ? (
        <Pressable accessibilityRole="button" accessibilityLabel={strings.search.seeMoreIn(section.header)}
          onPress={() => setExpanded({ ...limits, [section.key]: limits[section.key] + PAGE_SIZE })} style={styles.more}>
          <ThemedText type="smallBold" themeColor="tint">{strings.search.seeMore}</ThemedText>
        </Pressable>
      ) : null}
    />
  );
  return <>
    <TextInput value={search.query} onChangeText={search.setQuery}
      placeholder={serverId ? strings.search.scopedPlaceholder(title ?? strings.navigation.server) : strings.search.placeholder}
      placeholderTextColor={theme.textSecondary} returnKeyType="search" autoCapitalize="none" autoCorrect={false}
      maxLength={100} clearButtonMode="while-editing" accessibilityLabel={strings.accessibility.search}
      style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]} />
    {body}
  </>;
}
const styles = StyleSheet.create({
  input: { margin: Spacing.three, borderRadius: 10, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2, fontSize: 16 },
  header: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  name: { flex: 1 },
  more: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.two },
});
