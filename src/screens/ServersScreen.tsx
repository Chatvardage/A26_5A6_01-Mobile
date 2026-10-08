import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { ContentFrame } from '@/components/ContentFrame';
import { EmptyState, ErrorState, LoadingState, RefreshErrorBanner } from '@/components/StateViews';
import { ServerItem } from '@/components/ServerItem';
import { ThemedView } from '@/components/themed-view';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { useRefreshOnServerChange } from '@/hooks/useRefreshOnServerChange';
import { useServers } from '@/hooks/useServers';
import { useLiveServers } from '@/unread/liveUnread';
import { Routes, type MainTabParamList, type RootStackParamList } from '@/navigation/routes';
import type { ServerSummary } from '@/types/server';
import { useTranslation } from '@/i18n';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Servers'>,
  NativeStackScreenProps<RootStackParamList>
>;

const NONE: ServerSummary[] = [];

export function ServersScreen({ navigation }: Props) {
  const { strings } = useTranslation();
  const { state, refreshing, refreshError, retry, refresh } = useServers();
  useRefreshOnFocus(refresh);
  useRefreshOnServerChange(refresh);
  const refreshProps = { refreshing, onRefresh: refresh };
  const servers = useLiveServers(state.status === 'ready' ? state.data : NONE);

  const open = useCallback(
    (server: ServerSummary) => navigation.navigate(Routes.Server, { serverId: server.id, title: server.name }),
    [navigation],
  );

  if (state.status === 'loading') return <LoadingState label={strings.states.loadingServers} />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={retry} refresh={refreshProps} />;
  if (state.status === 'empty') {
    return <EmptyState title={strings.states.noServers} hint={strings.states.joinServer} refresh={refreshProps} />;
  }

  return (
    <ThemedView style={styles.fill}>
      <ContentFrame>
        {refreshError ? <RefreshErrorBanner message={refreshError} onRetry={refresh} /> : null}
        <FlatList
          ListHeaderComponent={<View style={{ paddingHorizontal: 16, paddingTop: 24, paddingBottom: 20, gap: 12 }}>
            <ActionButton label={strings.control.discover} onPress={() => navigation.navigate(Routes.DiscoverServers, { mode: 'discover' })} />
            <ActionButton label={strings.control.createServer} onPress={() => navigation.navigate(Routes.DiscoverServers, { mode: 'create' })} />
          </View>}
          data={servers}
          keyExtractor={(s) => s.id}
          renderItem={({ item }) => <ServerItem server={item} onPress={open} />}
          ItemSeparatorComponent={() => <ThemedView type="backgroundSelected" style={styles.separator} />}
          refreshing={refreshing}
          onRefresh={refresh}
          contentContainerStyle={styles.list}
        />
      </ContentFrame>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { flexGrow: 1 },
  separator: { height: StyleSheet.hairlineWidth },
});
