import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SearchPanel } from '@/components/SearchPanel';
import { Routes, type MainTabParamList, type RootStackParamList } from '@/navigation/routes';
import type { SearchResult } from '@/services/searchService';
import { useTheme } from '@/hooks/use-theme';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Search'>,
  NativeStackScreenProps<RootStackParamList>
>;

/** Recherche dans toutes les conversations accessibles ; un résultat ouvre la conversation trouvée. */
export function SearchScreen({ navigation }: Props) {
  const theme = useTheme();
  const open = useCallback(
    (result: SearchResult) =>
      navigation.navigate(Routes.Conversation, {
        conversationId: result.conversationId,
        title: result.conversationTitle,
        // Ouvre la conversation directement sur le message trouvé.
        messageId: result.id,
        focusToken: Date.now(),
      }),
    [navigation],
  );

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: theme.background }]} edges={['left', 'right']}>
      <SearchPanel onOpenResult={open} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
