import { useCallback, useState } from 'react';
import { Alert, ScrollView, Switch, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SectionCard } from '@/components/SectionCard';
import { displayName } from '@/utils/displayNames';
import { ActionButton } from '@/components/ActionButton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ErrorState, LoadingState } from '@/components/StateViews';
import { useLoadable } from '@/hooks/useLoadable';
import { useRefreshOnServerChange } from '@/hooks/useRefreshOnServerChange';
import { useTheme } from '@/hooks/use-theme';
import { useTranslation } from '@/i18n';
import { parseServerParams, type RootStackParamList } from '@/navigation/routes';
import { userMessage } from '@/services/ApiError';
import { canManageRooms, canManageServer, createRoom, deleteRoom, deleteServer, getServer, updateRoom, updateServer, type ChannelPolicy, type Room } from '@/services/rooms.service';
type Props = NativeStackScreenProps<RootStackParamList, 'ManageServer'>;
export function ManageServerScreen({ route, navigation }: Props) {
  const { strings } = useTranslation(); const params = parseServerParams(route.params);
  return params ? <Manager serverId={params.serverId} navigation={navigation} /> : <ErrorState message={strings.states.serverNotFound} />;
}
function Manager({ serverId, navigation }: { serverId: string; navigation: Props['navigation'] }) {
  const { strings } = useTranslation(); const t = strings.control; const theme = useTheme();
  const load = useCallback(() => getServer(serverId), [serverId]);
  const { state, retry, refresh } = useLoadable(load, () => false); useRefreshOnServerChange(refresh, serverId);
  const [serverName, setServerName] = useState(''); const [isPublic, setPublic] = useState<boolean | null>(null);
  const [editing, setEditing] = useState<Room | null>(null); const [roomName, setRoomName] = useState('');
  const [access, setAccess] = useState<ChannelPolicy>('tous'); const [write, setWrite] = useState<ChannelPolicy>('tous');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null);
  async function run(action: () => Promise<unknown>, exit = false) {
    if (busy) return; setBusy(true); setError(null);
    try { await action(); if (exit) navigation.popTo('Main', { screen: 'Servers' }); else { setEditing(null); setRoomName(''); await refresh(); } }
    catch (e) { setError(e); } finally { setBusy(false); }
  }
  function confirm(action: () => Promise<unknown>, exit = false) { Alert.alert(t.delete, t.deleteHint, [{ text: t.cancel, style: 'cancel' }, { text: t.confirm, style: 'destructive', onPress: () => void run(action, exit) }]); }
  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={retry} />;
  if (state.status !== 'ready') return null;
  const server = state.data;
  if (!canManageRooms(server)) return <ErrorState message={strings.errors.forbidden} />;
  const field = { color: theme.text, padding: 12, borderWidth: 1, borderColor: theme.textSecondary, borderRadius: 12, backgroundColor: theme.backgroundSelected };
  return <ThemedView style={{ flex: 1 }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 20, maxWidth: 700, width: '100%', alignSelf: 'center' }}>
    {error ? <ThemedText accessibilityRole="alert" themeColor="danger">{userMessage(error)}</ThemedText> : null}
    {canManageServer(server) ? <SectionCard title={server.nom}>
      <TextInput accessibilityLabel={t.serverName} placeholder={server.nom} placeholderTextColor={theme.textSecondary} value={serverName} maxLength={80} onChangeText={setServerName} style={field} />
      <View testID="server-visibility" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 48 }}><ThemedText style={{ flex: 1 }}>{t.public}</ThemedText><Switch accessibilityLabel={t.public} disabled={server.parDefaut} value={isPublic ?? server.public} onValueChange={setPublic} /></View>
      <ActionButton label={t.save} disabled={busy} onPress={() => void run(() => updateServer(server.id, { nom: serverName.trim() || server.nom, public: server.parDefaut ? true : isPublic ?? server.public }))} />
      {!server.parDefaut ? <ActionButton label={`${t.delete} · ${server.nom}`} disabled={busy} danger onPress={() => confirm(() => deleteServer(server.id), true)} /> : null}
    </SectionCard> : null}
    <SectionCard title={editing ? t.edit : t.createRoom}>
    <TextInput accessibilityLabel={t.roomName} placeholder={t.roomName} placeholderTextColor={theme.textSecondary} value={roomName} maxLength={80} onChangeText={setRoomName} style={field} />
    <ThemedText>{t.readPolicy}</ThemedText>
    <View style={{ flexDirection: 'row', gap: 10 }}>{(['tous', 'moderateurs'] as const).map(value => <ActionButton compact key={value} label={`${access === value ? '✓ ' : ''}${value === 'tous' ? t.everyone : t.moderators}`} onPress={() => setAccess(value)} />)}</View>
    <ThemedText>{t.writePolicy}</ThemedText>
    <View style={{ flexDirection: 'row', gap: 10 }}>{(['tous', 'moderateurs'] as const).map(value => <ActionButton compact key={value} label={`${write === value ? '✓ ' : ''}${value === 'tous' ? t.everyone : t.moderators}`} onPress={() => setWrite(value)} />)}</View>
    <ActionButton label={editing ? t.save : t.createRoom} disabled={busy || !roomName.trim()} onPress={() => void run(() => editing ? updateRoom(editing.id, { nom: roomName.trim(), acces: access, ecriture: write }) : createRoom(server.id, { nom: roomName.trim(), acces: access, ecriture: write }))} />
    {editing ? <ActionButton label={t.cancel} onPress={() => { setEditing(null); setRoomName(''); }} /> : null}
    </SectionCard>
    {server.salons.map(room => <SectionCard key={room.id} title={displayName('#' + room.nom, strings)}><View style={{ flexDirection: 'row', gap: 10 }}>
      <ActionButton compact label={`${t.edit} · #${room.nom}`} disabled={busy} onPress={() => { setEditing(room); setRoomName(room.nom); setAccess(room.acces); setWrite(room.ecriture); }} />
      <ActionButton compact label={`${t.delete} · #${room.nom}`} disabled={busy || server.salons.length <= 1} danger onPress={() => confirm(() => deleteRoom(room.id))} />
    </View></SectionCard>)}
  </ScrollView></ThemedView>;
}
