import { ActivityIndicator, Pressable, SectionList, StyleSheet, TextInput, View } from 'react-native';
import { useEffect } from 'react';

import { SearchResultItem } from '@/components/SearchResultItem';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useSearch } from '@/hooks/useSearch';
import { useTheme } from '@/hooks/use-theme';
import { useTranslation } from '@/i18n';
import type { SearchResult } from '@/services/searchService';
import { groupResults } from '@/partage/groupResults';

type Props = {
  /** Limite la recherche à cette conversation (`dm:…` ou `room:…`), comme le client Web. */
  conversationId?: string;
  /** Nom de la conversation, pour le champ de saisie. */
  title?: string;
  initialQuery?: string;
  onOpenResult: (result: SearchResult) => void;
};

/** Saisie + résultats paginés ; partagée par l'onglet Recherche (global) et la recherche d'une conversation. */
export function SearchPanel({ conversationId, title, initialQuery, onOpenResult }: Props) {
  const theme = useTheme();
  const { strings } = useTranslation();
  const search = useSearch(conversationId);
  const { setQuery } = search;
  useEffect(() => {
    // Synchronise le terme transmis par la navigation globale avec la recherche existante.
    if (initialQuery !== undefined) setQuery(initialQuery);
  }, [initialQuery, setQuery]);
  const placeholder = conversationId
    ? strings.search.scopedPlaceholder(title ?? strings.search.scopedFallback)
    : strings.search.placeholder;

  // Recherche globale : messages privés, puis un groupe par serveur. Dans une conversation, un seul groupe sans titre.
  const sections: { key: string; header: string | null; data: SearchResult[] }[] = conversationId
    ? [{ key: 'all', header: null, data: search.results }]
    : groupResults(search.results).map((group) => ({
        key: group.key,
        header: group.kind === 'dm' ? strings.search.privateMessages : (group.title ?? strings.search.channels),
        data: group.data,
      }));

  let body;
  if (search.status === 'idle') body = <EmptyState title={strings.search.prompt} hint={strings.search.promptHint} />;
  else if (search.status === 'tooShort') body = <EmptyState title={strings.search.tooShort} />;
  else if (search.status === 'loading') body = <LoadingState label={strings.search.searching} />;
  else if (search.status === 'error') body = <ErrorState message={search.errorMessage ?? ''} onRetry={search.retry} />;
  else if (search.status === 'empty') {
    body = <EmptyState title={strings.search.noResults} hint={strings.search.noResultsHint} />;
  } else {
    body = (
      <SectionList
        sections={sections}
        stickySectionHeadersEnabled
        // Une page de résultats (20) et ses en-têtes s'affichent d'un coup.
        initialNumToRender={30}
        keyExtractor={(r) => `${r.conversationId}:${r.id}`}
        renderSectionHeader={({ section }) =>
          section.header ? (
            <View style={[styles.section, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="smallBold" numberOfLines={1} style={styles.sectionTitle}>
                {section.header}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {section.data.length}
              </ThemedText>
            </View>
          ) : null
        }
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        renderItem={({ item }) => (
          <SearchResultItem result={item} variant={conversationId ? 'scoped' : 'grouped'} term={search.term} onPress={onOpenResult} />
        )}
        ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: theme.backgroundSelected }]} />}
        ListHeaderComponent={
          <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite" style={styles.count}>
            {strings.search.results(search.results.length)}
          </ThemedText>
        }
        ListFooterComponent={
          search.loadingMore || search.moreError || search.hasMore ? (
            <View style={styles.footer}>
              {search.loadingMore ? <ActivityIndicator color={theme.tint} accessibilityLabel={strings.search.loadingMore} /> : null}
              {search.moreError ? (
                <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
                  {search.moreError}
                </ThemedText>
              ) : null}
              {!search.loadingMore && search.hasMore ? (
                <Pressable onPress={() => void search.loadMore()} accessibilityRole="button" style={styles.more}>
                  <ThemedText type="smallBold" style={{ color: theme.tint }}>
                    {strings.search.loadMore}
                  </ThemedText>
                </Pressable>
              ) : null}
            </View>
          ) : null
        }
      />
    );
  }

  return (
    <>
      <TextInput
        value={search.query}
        onChangeText={search.setQuery}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={Boolean(conversationId)}
        maxLength={100}
        clearButtonMode="while-editing"
        accessibilityLabel={conversationId ? strings.accessibility.searchInConversation : strings.accessibility.search}
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
      />
      {body}
    </>
  );
}

const styles = StyleSheet.create({
  input: { margin: Spacing.three, borderRadius: 10, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2, fontSize: 16 },
  separator: { height: StyleSheet.hairlineWidth },
  count: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.one },
  section: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one + 2 },
  sectionTitle: { flex: 1 },
  footer: { minHeight: 44, alignItems: 'center', justifyContent: 'center', gap: Spacing.one, paddingVertical: Spacing.two },
  more: { minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.three },
});
