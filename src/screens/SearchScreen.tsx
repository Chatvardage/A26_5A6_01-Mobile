import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/StateViews';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Écran de recherche : saisie et zone de résultats. L'appel de recherche sera branché sur le service dédié. */
export function SearchScreen() {
  const theme = useTheme();
  const [query, setQuery] = useState('');

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: theme.background }]} edges={['left', 'right']}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Rechercher dans vos conversations"
        placeholderTextColor={theme.textSecondary}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        accessibilityLabel="Recherche"
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
      />
      <EmptyState
        title={query.trim() ? 'Recherche non disponible' : 'Recherchez un message'}
        hint="La recherche dans les conversations accessibles sera disponible prochainement."
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  input: { margin: Spacing.three, borderRadius: 10, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2, fontSize: 16 },
});
