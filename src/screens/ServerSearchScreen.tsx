import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ContentFrame } from '@/components/ContentFrame';
import { SearchSummaryPanel } from '@/components/SearchSummaryPanel';
import { ErrorState } from '@/components/StateViews';
import { useTheme } from '@/hooks/use-theme';
import { useTranslation } from '@/i18n';
import { parseServerParams, Routes, type RootStackParamList } from '@/navigation/routes';

type Props = NativeStackScreenProps<RootStackParamList, 'ServerSearch'>;
export function ServerSearchScreen({ navigation, route }: Props) {
  const theme = useTheme();
  const { strings } = useTranslation();
  const params = parseServerParams(route.params);
  const query = route.params?.query;
  if (!params || typeof query !== 'string') return <ErrorState message={strings.states.noAccessibleChannels} />;
  return <SafeAreaView style={[styles.fill, { backgroundColor: theme.background }]} edges={['left', 'right']}>
    <ContentFrame insets={false}>
      <SearchSummaryPanel key={`${params.serverId}:${query}`} serverId={params.serverId} title={params.title} initialQuery={query}
        onOpenConversation={(match, term) => navigation.navigate(Routes.ConversationSearch, {
          conversationId: match.conversationId, title: match.title, query: term,
        })} />
    </ContentFrame>
  </SafeAreaView>;
}
const styles = StyleSheet.create({ fill: { flex: 1 } });
