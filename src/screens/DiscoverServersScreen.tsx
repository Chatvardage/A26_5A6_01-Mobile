import { useCallback, useState } from 'react';
import { ScrollView, TextInput, Switch, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActionButton } from '@/components/ActionButton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ErrorState, LoadingState } from '@/components/StateViews';
import { useLoadable } from '@/hooks/useLoadable';
import { useRefreshOnServerChange } from '@/hooks/useRefreshOnServerChange';
import { useTranslation } from '@/i18n';
import { Routes, type RootStackParamList } from '@/navigation/routes';
import { userMessage } from '@/services/ApiError';
import { acceptInvitation, createServer, discoverServers, getInvitations, joinServer, refuseInvitation } from '@/services/rooms.service';
import { useTheme } from '@/hooks/use-theme';
type Props = NativeStackScreenProps<RootStackParamList, 'DiscoverServers'>;
export function DiscoverServersScreen({ navigation, route }: Props) {
  const { strings } = useTranslation(); const t = strings.control; const theme = useTheme();
  const creating = route?.params?.mode === 'create';
  const [query, setQuery] = useState(''); const [search, setSearch] = useState('');
  const [name, setName] = useState(''); const [isPublic, setPublic] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null);
  const load = useCallback(async () => ({ servers: await discoverServers(search), invitations: await getInvitations() }), [search]);
  const { state, refresh, retry } = useLoadable(load, () => false);
  useRefreshOnServerChange(refresh);
  async function run(action: () => Promise<unknown>, open = false) {
    if (busy) return; setBusy(true); setError(null);
    try { const result = await action(); if (open && result && typeof result === 'object' && 'id' in result && 'nom' in result) navigation.replace(Routes.Server, { serverId: String(result.id), title: String(result.nom) }); else await refresh(); }
    catch (e) { setError(e); } finally { setBusy(false); }
  }
  return <ThemedView style={{ flex: 1 }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 14 }}>
    {!creating ? <><TextInput accessibilityLabel={t.search} placeholder={t.discover} value={query} maxLength={80} onChangeText={setQuery} style={{ color: theme.text, borderWidth: 1, borderColor: theme.textSecondary, padding: 12, borderRadius: 8 }} />
    <ActionButton label={t.search} disabled={busy} onPress={() => setSearch(query.trim())} />
    {error ? <ThemedText accessibilityRole="alert" themeColor="danger">{userMessage(error)}</ThemedText> : null}
    {state.status === 'loading' ? <LoadingState /> : state.status === 'error' ? <ErrorState message={state.message} onRetry={retry} /> : state.status === 'ready' ? <>
      <ThemedText type="subtitle">{t.invitations}</ThemedText>
      {!state.data.invitations.length ? <ThemedText>{t.noInvitations}</ThemedText> : null}
      {state.data.invitations.map(({ serveur }) => <View key={serveur.id} style={{ gap: 8 }}><ThemedText type="smallBold">{serveur.nom}</ThemedText><ActionButton label={t.accept} disabled={busy} onPress={() => void run(() => acceptInvitation(serveur.id), true)} /><ActionButton label={t.refuse} disabled={busy} onPress={() => void run(() => refuseInvitation(serveur.id))} /></View>)}
      <ThemedText type="subtitle">{t.discover}</ThemedText>
      {!state.data.servers.length ? <ThemedText>{t.noDiscovery}</ThemedText> : null}
      {state.data.servers.map(server => <View key={server.id} style={{ gap: 8 }}><ThemedText type="smallBold">{server.nom}</ThemedText><ThemedText>{server.nombreMembres} {strings.server.members}</ThemedText><ActionButton label={`${t.join} · ${server.nom}`} disabled={busy} onPress={() => void run(() => joinServer(server.id), true)} /></View>)}
    </> : null}
    </> : null}
    {creating ? <><ThemedText type="subtitle">{t.createServer}</ThemedText>
    <TextInput accessibilityLabel={t.serverName} placeholder={t.serverName} value={name} onChangeText={setName} maxLength={80} style={{ color: theme.text, padding: 12, borderWidth: 1, borderColor: theme.textSecondary, borderRadius: 8 }} />
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><ThemedText>{t.public}</ThemedText><Switch accessibilityLabel={t.public} value={isPublic} onValueChange={setPublic} /></View>
    <ActionButton label={t.createServer} disabled={busy || !name.trim()} onPress={() => void run(() => createServer(name, isPublic), true)} />
    </> : null}
  </ScrollView></ThemedView>;
}
