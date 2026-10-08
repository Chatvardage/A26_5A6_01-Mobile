import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ContentFrame } from '@/components/ContentFrame';
import { SearchPanel } from '@/components/SearchPanel';
import { ErrorState } from '@/components/StateViews';
import { useTheme } from '@/hooks/use-theme';
import { useTranslation } from '@/i18n';
import { parseConversationParams, Routes, type RootStackParamList } from '@/navigation/routes';

type Props = NativeStackScreenProps<RootStackParamList, 'ConversationSearch'>;

/**
 * Recherche dans la conversation affichée (messages privés ou salon), comme le client Web : mêmes
 * droits, résultats limités à cette conversation. Toucher un résultat revient à la conversation.
 */
export function ConversationSearchScreen({ navigation, route }: Props) {
  const theme = useTheme();
  const { strings } = useTranslation();
  const params = useMemo(() => parseConversationParams(route.params), [route.params]);
  if (!params) return <ErrorState message={strings.states.conversationNotFound} />;

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: theme.background }]} edges={['left', 'right']}>
      <ContentFrame insets={false}>
        <SearchPanel
          conversationId={params.conversationId}
          title={params.title}
          initialQuery={typeof route.params?.query === 'string' ? route.params.query : undefined}
          // Retour à la conversation déjà ouverte sous cette recherche (popTo la dépile, au lieu d'en
          // empiler une seconde) : plusieurs recherches de suite ne laissent donc qu'une seule entrée, et la
          // flèche de retour ramène directement à la liste. `focusToken` permet de viser deux fois le même message.
          onOpenResult={(result) =>
            navigation.popTo(Routes.Conversation, {
              conversationId: params.conversationId,
              title: params.title,
              messageId: result.id,
              focusToken: Date.now(),
            })
          }
        />
      </ContentFrame>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
