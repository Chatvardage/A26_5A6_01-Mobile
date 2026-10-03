import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useMemo } from 'react';
import { FlatList, StyleSheet } from 'react-native';

import { ConversationItem } from '@/components/ConversationItem';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { ThemedView } from '@/components/themed-view';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { useServerChannels } from '@/hooks/useServerChannels';
import { parseServerParams, Routes, type RootStackParamList } from '@/navigation/routes';
import { useSession } from '@/session/SessionContext';
import type { ConversationSummary } from '@/types/conversation';

type Props = NativeStackScreenProps<RootStackParamList, 'Server'>;

export function ServerScreen({ route, navigation }: Props) {
  // Paramètres validés avant tout chargement : un identifiant invalide n'appelle jamais l'API.
  const params = useMemo(() => parseServerParams(route.params), [route.params]);
  if (!params) return <ErrorState message="Ce serveur est introuvable." />;
  return <ValidServer serverId={params.serverId} navigation={navigation} />;
}

function ValidServer({ serverId, navigation }: { serverId: string; navigation: Props['navigation'] }) {
  const { user } = useSession();
  const { state, refreshing, retry, refresh } = useServerChannels(serverId);
  useRefreshOnFocus(refresh);
  const refreshProps = { refreshing, onRefresh: refresh };

  const open = useCallback(
    (channel: ConversationSummary) =>
      navigation.navigate(Routes.Conversation, { conversationId: channel.id, title: channel.title }),
    [navigation],
  );

  if (state.status === 'loading') return <LoadingState label="Chargement des salons…" />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={retry} refresh={refreshProps} />;
  if (state.status === 'empty') return <EmptyState title="Aucun salon" hint="Ce serveur n'a aucun salon accessible." refresh={refreshProps} />;

  return (
    <ThemedView style={styles.fill}>
      <FlatList
        data={state.data.channels}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => <ConversationItem conversation={item} currentUserId={user?.id} onPress={open} />}
        ItemSeparatorComponent={() => <ThemedView type="backgroundSelected" style={styles.separator} />}
        refreshing={refreshing}
        onRefresh={refresh}
        contentContainerStyle={styles.list}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { flexGrow: 1 },
  separator: { height: StyleSheet.hairlineWidth },
});
