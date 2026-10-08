import { useCallback, useState } from 'react';
import { ScrollView, Switch, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppDialog } from '@/components/AppDialog';
import { RoomForm } from '@/components/RoomForm';
import { SectionCard } from '@/components/SectionCard';
import { ThemedTextInput } from '@/components/ThemedTextInput';
import { displayName } from '@/utils/displayNames';
import { ActionButton } from '@/components/ActionButton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ErrorState, LoadingState } from '@/components/StateViews';
import { useLoadable } from '@/hooks/useLoadable';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { useRefreshOnServerChange } from '@/hooks/useRefreshOnServerChange';
import { useTranslation } from '@/i18n';
import { parseServerParams, Routes, type RootStackParamList } from '@/navigation/routes';
import { userMessage } from '@/services/ApiError';
import { canManageRooms, canManageServer, createRoom, deleteRoom, deleteServer, getServer, updateServer } from '@/services/rooms.service';
type Props = NativeStackScreenProps<RootStackParamList, 'ManageServer'>;
export function ManageServerScreen({ route, navigation }: Props) {
  const { strings } = useTranslation(); const params = parseServerParams(route.params);
  return params ? <Manager serverId={params.serverId} navigation={navigation} /> : <ErrorState message={strings.states.serverNotFound} />;
}
function Manager({ serverId, navigation }: { serverId: string; navigation: Props['navigation'] }) {
  const { strings } = useTranslation(); const t = strings.control;
  const load = useCallback(() => getServer(serverId), [serverId]);
  const { state, retry, refresh } = useLoadable(load, () => false); useRefreshOnServerChange(refresh, serverId);
  // Retour de l'écran de modification d'un salon : la liste reflète le nouveau nom.
  useRefreshOnFocus(refresh);
  const [serverName, setServerName] = useState(''); const [isPublic, setPublic] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null);
  const { show, dialog } = useAppDialog();
  async function run(action: () => Promise<unknown>, exit = false) {
    if (busy) return false; setBusy(true); setError(null);
    try { await action(); if (exit) navigation.popTo('Main', { screen: 'Servers' }); else await refresh(); return true; }
    catch (e) { setError(e); return false; } finally { setBusy(false); }
  }
  function confirm(title: string, action: () => Promise<unknown>, exit = false) {
    show({ title, message: t.deleteHint, actions: [{ label: t.cancel, kind: 'cancel' }, { label: t.delete, kind: 'danger', onPress: () => void run(action, exit) }] });
  }
  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={retry} />;
  if (state.status !== 'ready') return null;
  const server = state.data;
  if (!canManageRooms(server)) return <ErrorState message={strings.errors.forbidden} />;
  return <ThemedView style={{ flex: 1 }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 20, maxWidth: 700, width: '100%', alignSelf: 'center' }}>
    {error ? <ThemedText accessibilityRole="alert" themeColor="danger">{userMessage(error)}</ThemedText> : null}
    {canManageServer(server) ? <SectionCard title={server.nom}>
      <ThemedTextInput accessibilityLabel={t.serverName} placeholder={server.nom} value={serverName} maxLength={80} onChangeText={setServerName} />
      <View testID="server-visibility" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 48 }}><ThemedText style={{ flex: 1 }}>{t.public}</ThemedText><Switch accessibilityLabel={t.public} disabled={server.parDefaut} value={isPublic ?? server.public} onValueChange={setPublic} /></View>
      <ActionButton label={t.save} disabled={busy} onPress={() => void run(() => updateServer(server.id, { nom: serverName.trim() || server.nom, public: server.parDefaut ? true : isPublic ?? server.public }))} />
      {!server.parDefaut ? <ActionButton label={`${t.delete} · ${server.nom}`} disabled={busy} danger onPress={() => confirm(t.deleteServerTitle(server.nom), () => deleteServer(server.id), true)} /> : null}
    </SectionCard> : null}
    <SectionCard title={t.createRoom}>
      <RoomForm submitLabel={t.createRoom} busy={busy} resetOnSuccess onSubmit={input => run(() => createRoom(server.id, input))} />
    </SectionCard>
    {server.salons.map(room => <SectionCard key={room.id} title={displayName('#' + room.nom, strings)}><View style={{ flexDirection: 'row', gap: 10 }}>
      <ActionButton compact label={`${t.edit} · #${room.nom}`} disabled={busy} onPress={() => navigation.navigate(Routes.EditRoom, { serverId: server.id, roomId: room.id })} />
      <ActionButton compact label={`${t.delete} · #${room.nom}`} disabled={busy || server.salons.length <= 1} danger onPress={() => confirm(t.deleteRoomTitle(room.nom), () => deleteRoom(room.id))} />
    </View></SectionCard>)}
  </ScrollView>{dialog}</ThemedView>;
}
