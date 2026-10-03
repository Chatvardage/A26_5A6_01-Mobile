import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback } from 'react';
import { FlatList, StyleSheet } from 'react-native';

import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { ServerItem } from '@/components/ServerItem';
import { ThemedView } from '@/components/themed-view';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { useServers } from '@/hooks/useServers';
import { Routes, type MainTabParamList, type RootStackParamList } from '@/navigation/routes';
import type { ServerSummary } from '@/types/server';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Servers'>,
  NativeStackScreenProps<RootStackParamList>
>;

export function ServersScreen({ navigation }: Props) {
  const { state, refreshing, retry, refresh } = useServers();
  useRefreshOnFocus(refresh);
  const refreshProps = { refreshing, onRefresh: refresh };

  const open = useCallback(
    (server: ServerSummary) => navigation.navigate(Routes.Server, { serverId: server.id, title: server.name }),
    [navigation],
  );

  if (state.status === 'loading') return <LoadingState label="Chargement des serveurs…" />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={retry} refresh={refreshProps} />;
  if (state.status === 'empty') {
    return <EmptyState title="Aucun serveur" hint="Rejoignez un serveur public pour accéder à ses salons." refresh={refreshProps} />;
  }

  return (
    <ThemedView style={styles.fill}>
      <FlatList
        data={state.data}
        keyExtractor={(s) => s.id}
        renderItem={({ item }) => <ServerItem server={item} onPress={open} />}
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
