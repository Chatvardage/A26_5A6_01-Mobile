import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { getServer, leaveServer, canLeaveServer, canManageRooms } from '@/services/rooms.service';
import { useLoadable } from '@/hooks/useLoadable';
import { userMessage } from '@/services/ApiError';
import { ThemedText } from '@/components/themed-text';
import { ContentFrame } from '@/components/ContentFrame';
import { ConversationItem } from '@/components/ConversationItem';
import { EmptyState, ErrorState, LoadingState, RefreshErrorBanner } from '@/components/StateViews';
import { ThemedView } from '@/components/themed-view';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { useRefreshOnServerChange } from '@/hooks/useRefreshOnServerChange';
import { useServerChannels } from '@/hooks/useServerChannels';
import { useLiveConversations } from '@/unread/liveUnread';
import { parseServerParams, Routes, type RootStackParamList } from '@/navigation/routes';
import { useSession } from '@/session/SessionContext';
import type { ConversationSummary } from '@/types/conversation';
import { useTranslation } from '@/i18n';

type Props = NativeStackScreenProps<RootStackParamList, 'Server'>;

const NONE: ConversationSummary[] = [];

export function ServerScreen({ route, navigation }: Props) {
  const { strings } = useTranslation();
  // Paramètres validés avant tout chargement : un identifiant invalide n'appelle jamais l'API.
  const params = useMemo(() => parseServerParams(route.params), [route.params]);
  if (!params) return <ErrorState message={strings.states.serverNotFound} />;
  return <ValidServer serverId={params.serverId} navigation={navigation} />;
}

function ValidServer({ serverId, navigation }: { serverId: string; navigation: Props['navigation'] }) {
  const { strings } = useTranslation();
  const { user } = useSession();
  const loadDetails = useCallback(() => getServer(serverId), [serverId]);
  const details = useLoadable(loadDetails, () => false);
  const [leaving, setLeaving] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  useRefreshOnServerChange(details.refresh, serverId);
  async function leave() {
    if (leaving) return; setLeaving(true); setActionError(null);
    try { await leaveServer(serverId); navigation.popTo(Routes.Main, { screen: Routes.Servers }); }
    catch (e) { setActionError(e); } finally { setLeaving(false); }
  }
  const { state, refreshing, refreshError, retry, refresh } = useServerChannels(serverId);
  useRefreshOnFocus(refresh);
  useRefreshOnServerChange(refresh, serverId);
  const refreshProps = { refreshing, onRefresh: refresh };
  const channels = useLiveConversations(state.status === 'ready' ? state.data.channels : NONE);

  const open = useCallback(
    (channel: ConversationSummary) =>
      navigation.navigate(Routes.Conversation, { conversationId: channel.id, title: channel.title }),
    [navigation],
  );

  if (state.status === 'loading') return <LoadingState label={strings.states.loadingChannels} />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={retry} refresh={refreshProps} />;
  if (state.status === 'empty') return <EmptyState title={strings.states.noChannels} hint={strings.states.noAccessibleChannels} refresh={refreshProps} />;

  return (
    <ThemedView style={styles.fill}>
      <ContentFrame>
        {actionError ? <ThemedText accessibilityRole="alert" themeColor="danger">{userMessage(actionError)}</ThemedText> : null}
        <View style={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 16, gap: 12 }}><View style={{ flexDirection: 'row', gap: 12 }}>
        <ActionButton compact icon={{ ios: 'person.2', android: 'group', web: 'group' }} label={strings.control.members} onPress={() => navigation.navigate(Routes.ServerMembers, { serverId })} />
        {details.state.status === 'ready' && canManageRooms(details.state.data) ? <ActionButton compact icon={{ ios: 'slider.horizontal.3', android: 'settings', web: 'settings' }} label={strings.control.manageShort} onPress={() => navigation.navigate(Routes.ManageServer, { serverId })} /> : null}
        </View>
        {details.state.status === 'ready' && canLeaveServer(details.state.data, user?.id ?? '') ? <ActionButton label={strings.control.leave} disabled={leaving} danger onPress={() => Alert.alert(strings.control.leave, strings.control.leaveHint, [{ text: strings.control.cancel, style: 'cancel' }, { text: strings.control.confirm, style: 'destructive', onPress: () => void leave() }])} /> : null}
        </View>
        {refreshError ? <RefreshErrorBanner message={refreshError} onRetry={refresh} /> : null}
        <FlatList
          data={channels}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => <ConversationItem conversation={item} currentUserId={user?.id} onPress={open} />}
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
