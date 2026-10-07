import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/StateViews';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTranslation } from '@/i18n';

/** Écran de recherche : saisie et zone de résultats. L'appel de recherche sera branché sur le service dédié. */
export function SearchScreen() {
  const theme = useTheme();
  const { strings } = useTranslation();
  const [query, setQuery] = useState('');

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: theme.background }]} edges={['left', 'right']}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={strings.search.placeholder}
        placeholderTextColor={theme.textSecondary}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        accessibilityLabel={strings.accessibility.search}
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
      />
      <EmptyState
        title={query.trim() ? strings.search.unavailable : strings.search.prompt}
        hint={strings.search.comingSoon}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  input: { margin: Spacing.three, borderRadius: 10, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2, fontSize: 16 },
});
