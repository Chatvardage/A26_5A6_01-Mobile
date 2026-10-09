import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useLayoutEffect } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { ContentFrame } from '@/components/ContentFrame';
import { HeaderSearchButton } from '@/components/HeaderSearchButton';
import { ThemedTextInput } from '@/components/ThemedTextInput';
import { EmptyState, ErrorState, LoadingState, RefreshErrorBanner } from '@/components/StateViews';
import { ServerItem } from '@/components/ServerItem';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { usePendingInvitations } from '@/hooks/usePendingInvitations';
import { useListFilter } from '@/hooks/useListFilter';
import { usePagedList } from '@/hooks/usePagedList';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
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
const nameOf = (item: ServerSummary) => item.name;

export function ServersScreen({ navigation }: Props) {
  const { strings } = useTranslation();
  const { state, refreshError, retry, refresh } = useServers();
  useRefreshOnFocus(refresh);
  useRefreshOnServerChange(refresh);
  const invitations = usePendingInvitations();
  // Spinner seulement quand l'utilisateur tire la liste : les mises à jour en arrière-plan restent invisibles.
  const refreshProps = usePullToRefresh(refresh);
  const servers = useLiveServers(state.status === 'ready' ? state.data : NONE);
  // Loupe de l'en-tête : filtre par nom, avant la pagination.
  const search = useListFilter(servers, nameOf);
  useLayoutEffect(() => {
    navigation.setOptions({ headerRight: () => <HeaderSearchButton label={strings.navigation.searchServers} active={search.open} onPress={search.toggle} /> });
  }, [navigation, strings, search.open, search.toggle]);
  // 15 à la fois, les plus actifs en haut (tri du service).
  const page = usePagedList(search.filtered);

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
        {search.open ? <View style={styles.search}><ThemedTextInput autoFocus accessibilityLabel={strings.navigation.searchServers} placeholder={strings.navigation.searchServers} value={search.query} onChangeText={search.setQuery} maxLength={80} autoCorrect={false} autoCapitalize="none" returnKeyType="search" /></View> : null}
        <FlatList
          ListEmptyComponent={search.query.trim() ? <ThemedText themeColor="textSecondary" style={styles.noMatch}>{strings.navigation.noMatch}</ThemedText> : null}
          ListHeaderComponent={<View style={{ paddingHorizontal: 16, paddingTop: 24, paddingBottom: 20, gap: 12 }}>
            <ActionButton label={strings.control.discover} badge={invitations} onPress={() => navigation.navigate(Routes.DiscoverServers, { mode: 'discover' })} />
            <ActionButton label={strings.control.createServer} onPress={() => navigation.navigate(Routes.DiscoverServers, { mode: 'create' })} />
          </View>}
          data={page.visible}
          ListFooterComponent={page.hasMore ? <View style={styles.more}><ActionButton label={strings.navigation.showMore} onPress={page.showMore} /></View> : null}
          keyExtractor={(s) => s.id}
          renderItem={({ item }) => <ServerItem server={item} onPress={open} />}
          ItemSeparatorComponent={() => <ThemedView type="backgroundSelected" style={styles.separator} />}
          refreshing={refreshProps.refreshing}
          onRefresh={refreshProps.onRefresh}
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
  more: { padding: 16 },
  search: { paddingHorizontal: 16, paddingTop: 12 },
  noMatch: { padding: 16, textAlign: 'center' },
});
