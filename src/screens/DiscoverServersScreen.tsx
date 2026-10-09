import { useCallback, useState } from 'react';
import { ScrollView, Switch, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActionButton } from '@/components/ActionButton';
import { SectionCard } from '@/components/SectionCard';
import { ThemedText } from '@/components/themed-text';
import { ThemedTextInput } from '@/components/ThemedTextInput';
import { ThemedView } from '@/components/themed-view';
import { ErrorState, LoadingState } from '@/components/StateViews';
import { useDiscoverServers } from '@/hooks/useDiscoverServers';
import { useLoadable } from '@/hooks/useLoadable';
import { useRefreshOnServerChange } from '@/hooks/useRefreshOnServerChange';
import { useTranslation } from '@/i18n';
import { Routes, type RootStackParamList } from '@/navigation/routes';
import { userMessage } from '@/services/ApiError';
import { acceptInvitation, createServer, getInvitations, joinServer, refuseInvitation } from '@/services/rooms.service';
import { useBusyAction } from '@/hooks/useBusyAction';
type Props = NativeStackScreenProps<RootStackParamList, 'DiscoverServers'>;
export function DiscoverServersScreen({ navigation, route }: Props) {
  const creating = route?.params?.mode === 'create';
  return creating ? <CreateServer navigation={navigation} /> : <Discover navigation={navigation} />;
}
function useRun(navigation: Props['navigation'], refresh: () => unknown) {
  const { busy, start, finish } = useBusyAction(); const [error, setError] = useState<unknown>(null);
  async function run(action: () => Promise<unknown>, open = false) {
    if (!start()) return; setError(null);
    try { const result = await action(); if (open && result && typeof result === 'object' && 'id' in result && 'nom' in result) navigation.replace(Routes.Server, { serverId: String(result.id), title: String(result.nom) }); else await refresh(); }
    catch (e) { setError(e); } finally { finish(); }
  }
  return { busy, error, run };
}
/** Invitations en haut, puis les serveurs publics par pages, filtrés par la recherche. */
function Discover({ navigation }: { navigation: Props['navigation'] }) {
  const { strings } = useTranslation(); const t = strings.control;
  const [query, setQuery] = useState('');
  const discovery = useDiscoverServers(query);
  const loadInvitations = useCallback(() => getInvitations(), []);
  const invitations = useLoadable(loadInvitations, () => false);
  const { reload } = discovery; const { refresh } = invitations;
  const refreshAll = useCallback(async () => { await Promise.all([refresh(), reload()]); }, [refresh, reload]);
  useRefreshOnServerChange(refreshAll);
  const { busy, error, run } = useRun(navigation, refreshAll);
  return <ThemedView style={{ flex: 1 }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 20, maxWidth: 700, width: '100%', alignSelf: 'center' }}>
    {error ? <ThemedText accessibilityRole="alert" themeColor="danger">{userMessage(error)}</ThemedText> : null}
    {invitations.state.status === 'error' ? <ErrorState message={invitations.state.message} onRetry={invitations.retry} /> : null}
    {invitations.state.status === 'ready' && invitations.state.data.length ? <SectionCard title={t.invitations}>
      {invitations.state.data.map(({ serveur }) => <View key={serveur.id} style={{ gap: 8 }}><ThemedText type="smallBold">{serveur.nom}</ThemedText><View style={{ flexDirection: 'row', gap: 10 }}><ActionButton compact label={t.accept} disabled={busy} onPress={() => void run(() => acceptInvitation(serveur.id), true)} /><ActionButton compact danger label={t.refuse} disabled={busy} onPress={() => void run(() => refuseInvitation(serveur.id))} /></View></View>)}
    </SectionCard> : null}
    <SectionCard title={t.publicServers}>
      <ThemedTextInput accessibilityLabel={t.searchServers} placeholder={t.searchServers} value={query} maxLength={80} onChangeText={setQuery} returnKeyType="search" autoCorrect={false} />
      {discovery.status === 'loading' ? <LoadingState /> : discovery.status === 'error' ? <ErrorState message={discovery.message} onRetry={reload} /> : <>
        {!discovery.servers.length ? <ThemedText themeColor="textSecondary">{t.noDiscovery}</ThemedText> : null}
        {discovery.servers.map(server => <View key={server.id} style={{ gap: 8 }}><ThemedText type="smallBold">{server.nom}</ThemedText><ThemedText type="small" themeColor="textSecondary">{server.nombreMembres} {strings.server.members}</ThemedText><ActionButton label={`${t.join} · ${server.nom}`} disabled={busy} onPress={() => void run(() => joinServer(server.id), true)} /></View>)}
        {discovery.moreError ? <ThemedText accessibilityRole="alert" themeColor="danger">{discovery.moreError}</ThemedText> : null}
        {discovery.next !== null ? <ActionButton label={t.loadMoreServers} disabled={discovery.loadingMore} onPress={() => void discovery.loadMore()} /> : null}
      </>}
    </SectionCard>
  </ScrollView></ThemedView>;
}
function CreateServer({ navigation }: { navigation: Props['navigation'] }) {
  const { strings } = useTranslation(); const t = strings.control;
  const [name, setName] = useState(''); const [isPublic, setPublic] = useState(false);
  const { busy, error, run } = useRun(navigation, () => undefined);
  return <ThemedView style={{ flex: 1 }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 14 }}>
    {error ? <ThemedText accessibilityRole="alert" themeColor="danger">{userMessage(error)}</ThemedText> : null}
    <ThemedText type="subtitle">{t.createServer}</ThemedText>
    <ThemedTextInput accessibilityLabel={t.serverName} placeholder={t.serverName} value={name} onChangeText={setName} maxLength={80} />
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><ThemedText>{t.public}</ThemedText><Switch accessibilityLabel={t.public} value={isPublic} onValueChange={setPublic} /></View>
    <ActionButton label={t.createServer} disabled={busy || !name.trim()} onPress={() => void run(() => createServer(name, isPublic), true)} />
  </ScrollView></ThemedView>;
}
