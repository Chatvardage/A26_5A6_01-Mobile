import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ContentFrame } from '@/components/ContentFrame';
import { SearchSummaryPanel } from '@/components/SearchSummaryPanel';
import { Routes, type MainTabParamList, type RootStackParamList } from '@/navigation/routes';
import { useTheme } from '@/hooks/use-theme';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Search'>,
  NativeStackScreenProps<RootStackParamList>
>;

/** Comptes complets par personne et serveur, puis recherche dans le groupe choisi. */
export function SearchScreen({ navigation }: Props) {
  const theme = useTheme();

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: theme.background }]} edges={['left', 'right']}>
      <ContentFrame insets={false}>
        <SearchSummaryPanel
          onOpenConversation={(match, query) => navigation.navigate(Routes.ConversationSearch, {
            conversationId: match.conversationId, title: match.title, query,
          })}
          onOpenServer={(match, query) => navigation.navigate(Routes.ServerSearch, {
            serverId: match.serverId, title: match.title, query,
          })}
        />
      </ContentFrame>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
