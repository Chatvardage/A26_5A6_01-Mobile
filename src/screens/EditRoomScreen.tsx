import { useCallback, useState } from 'react';
import { ScrollView } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RoomForm } from '@/components/RoomForm';
import { SectionCard } from '@/components/SectionCard';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ErrorState, LoadingState } from '@/components/StateViews';
import { useLoadable } from '@/hooks/useLoadable';
import { useTranslation } from '@/i18n';
import { parseRoomParams, type RootStackParamList } from '@/navigation/routes';
import { userMessage } from '@/services/ApiError';
import { canManageRooms, getServer, updateRoom, type RoomInput } from '@/services/rooms.service';
import { displayName } from '@/utils/displayNames';
type Props = NativeStackScreenProps<RootStackParamList, 'EditRoom'>;

/** Modification d'un salon, sur son propre écran depuis la gestion du serveur (retour : annuler). */
export function EditRoomScreen({ route, navigation }: Props) {
  const { strings } = useTranslation(); const params = parseRoomParams(route.params);
  return params ? <Editor {...params} navigation={navigation} /> : <ErrorState message={strings.states.roomNotFound} />;
}
function Editor({ serverId, roomId, navigation }: { serverId: string; roomId: string; navigation: Props['navigation'] }) {
  const { strings } = useTranslation(); const t = strings.control;
  const load = useCallback(() => getServer(serverId), [serverId]);
  const { state, retry } = useLoadable(load, () => false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null);
  async function save(input: RoomInput) {
    if (busy) return false; setBusy(true); setError(null);
    try { await updateRoom(roomId, input); navigation.goBack(); return true; }
    catch (e) { setError(e); return false; } finally { setBusy(false); }
  }
  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={retry} />;
  if (state.status !== 'ready') return null;
  if (!canManageRooms(state.data)) return <ErrorState message={strings.errors.forbidden} />;
  const room = state.data.salons.find(salon => salon.id === roomId);
  if (!room) return <ErrorState message={strings.states.roomNotFound} />;
  return <ThemedView style={{ flex: 1 }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 20, maxWidth: 700, width: '100%', alignSelf: 'center' }}>
    {error ? <ThemedText accessibilityRole="alert" themeColor="danger">{userMessage(error)}</ThemedText> : null}
    <SectionCard title={displayName('#' + room.nom, strings)}>
      <RoomForm initial={{ nom: room.nom, acces: room.acces, ecriture: room.ecriture }} submitLabel={t.save} busy={busy} onSubmit={save} />
    </SectionCard>
  </ScrollView></ThemedView>;
}
