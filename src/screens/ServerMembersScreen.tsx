import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppDialog } from '@/components/AppDialog';
import { SectionCard } from '@/components/SectionCard';
import { ThemedTextInput } from '@/components/ThemedTextInput';
import { UserAvatar } from '@/components/UserAvatar';
import { usePublicProfiles } from '@/hooks/usePublicProfiles';
import { useRefreshOnServerChange } from '@/hooks/useRefreshOnServerChange';
import { ActionButton } from '@/components/ActionButton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ErrorState, LoadingState } from '@/components/StateViews';
import { useLoadable } from '@/hooks/useLoadable';
import { useTranslation } from '@/i18n';
import { parseServerParams, Routes, type RootStackParamList } from '@/navigation/routes';
import { userMessage } from '@/services/ApiError';
import { effectiveMemberRole, canKick, canManageRooms, canManageServer, changeMemberRole, getMembers, getServer, inviteMember, kickMember, type Member } from '@/services/rooms.service';
import { searchUsers, type UserChoice } from '@/services/usersService';
import { useSession } from '@/session/SessionContext';
import { useBusyAction } from '@/hooks/useBusyAction';
import { useProfileSheet } from '@/components/ProfileSheet';
type Props = NativeStackScreenProps<RootStackParamList, 'ServerMembers'>;
export function ServerMembersScreen({ route, navigation }: Props) {
  const { strings } = useTranslation(); const params = parseServerParams(route.params);
  return params ? <Members serverId={params.serverId} navigation={navigation} /> : <ErrorState message={strings.states.serverNotFound} />;
}
function Members({ serverId, navigation }: { serverId: string; navigation: Props['navigation'] }) {
  const { user } = useSession(); const me = user?.id ?? ''; const { strings } = useTranslation(); const t = strings.control; const { show, dialog } = useAppDialog();
  const load = useCallback(async () => ({ server: await getServer(serverId), page: await getMembers(serverId) }), [serverId]);
  const { state, retry, refresh } = useLoadable(load, () => false);
  useRefreshOnServerChange(refresh, serverId);
  const [extra, setExtra] = useState<Member[]>([]); const [next, setNext] = useState<number | null | undefined>();
  const [query, setQuery] = useState(''); const [choices, setChoices] = useState<UserChoice[]>([]);
  const { busy, start, finish } = useBusyAction(); const [error, setError] = useState<unknown>(null); const [notice, setNotice] = useState(false);
  // Expulsion du propriétaire (administrateur) : on choisit d'abord le membre qui reçoit la propriété.
  const [transfer, setTransfer] = useState<{ ownerId: string; ownerName: string } | null>(null);
  async function run(action: () => Promise<unknown>, refreshList = true) { if (!start()) return; setError(null); setNotice(false); try { await action(); if (refreshList) { setExtra([]); setNext(undefined); await refresh(); } } catch (e) { setError(e); } finally { finish(); } }
  const profiles = usePublicProfiles(state.status === 'ready' ? [...state.data.page.membres, ...extra].map(member => member.utilisateurId) : []);
  const { show: showProfile, sheet: profileSheet } = useProfileSheet({ profiles, onMessage: (userId, name) => navigation.navigate(Routes.Conversation, { conversationId: `dm:${userId}`, title: name }) });
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={retry} />;
  // `empty` n'arrive pas (`isEmpty` toujours faux) : chargement en attendant les données.
  if (state.status !== 'ready') return <LoadingState />;
  const { server, page } = state.data; const offset = next === undefined ? page.suivant : next;
  const members = [...new Map([...page.membres, ...extra].map(m => [m.utilisateurId, m])).values()];
  return <ThemedView style={{ flex: 1 }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 16, maxWidth: 700, width: '100%', alignSelf: 'center' }}>
    {error ? <ThemedText accessibilityRole="alert" themeColor="danger">{userMessage(error)}</ThemedText> : null}
    {notice ? <ThemedText>{t.inviteSent}</ThemedText> : null}
    {transfer ? <SectionCard title={t.transferTitle(transfer.ownerName)}>
      <ThemedText themeColor="textSecondary">{t.transferHint}</ThemedText>
      <ActionButton label={t.cancel} disabled={busy} onPress={() => setTransfer(null)} />
    </SectionCard> : null}
    {members.map(rawMember => {
      const member = { ...rawMember, role: effectiveMemberRole(server, rawMember, me) };
      const profile = profiles[member.utilisateurId];
      const name = profile?.alias || member.pseudo || strings.conversation.unknownUser;
      return <SectionCard key={member.utilisateurId}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {/* Sa propre ligne : ni présence (le serveur ne nous suit pas nous-même), ni fiche. */}
          {member.utilisateurId === me ? <UserAvatar avatar={profile?.avatar} name={name} size={44} showPresence={false} /> : (
            <Pressable accessibilityRole="button" accessibilityLabel={strings.profileCard.view(name)} hitSlop={6} onPress={() => showProfile({ userId: member.utilisateurId, pseudo: member.pseudo })}>
              <UserAvatar avatar={profile?.avatar} online={profile?.online} name={name} size={44} />
            </Pressable>
          )}
          <View style={{ flex: 1, gap: 4 }}><ThemedText type="smallBold">{name}</ThemedText><ThemedText type="small" themeColor="textSecondary">{t.roles[member.role]}</ThemedText></View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {member.utilisateurId !== me ? <ActionButton compact label={`${t.dm} \u00b7 ${name}`} onPress={() => navigation.navigate(Routes.Conversation, { conversationId: `dm:${member.utilisateurId}`, title: name })} /> : null}
          {canKick(server, member, me) && !transfer ? <ActionButton compact disabled={busy} label={t.kick} danger onPress={() => member.role === 'proprietaire' ? setTransfer({ ownerId: member.utilisateurId, ownerName: name }) : show({ title: t.kickTitle(name), message: t.kickHint, actions: [{ label: t.cancel, kind: 'cancel' }, { label: t.kick, kind: 'danger', onPress: () => void run(() => kickMember(server.id, member.utilisateurId)) }] })} /> : null}
        </View>
        {transfer && member.utilisateurId !== transfer.ownerId ? <ActionButton disabled={busy} label={`${t.makeOwner} · ${name}`} onPress={() => show({ title: t.transferConfirmTitle(transfer.ownerName, name), message: t.transferConfirmHint, actions: [{ label: t.cancel, kind: 'cancel' }, { label: t.kick, kind: 'danger', onPress: () => void run(async () => { await kickMember(server.id, transfer.ownerId, member.utilisateurId); setTransfer(null); }) }] })} /> : null}
        {canManageServer(server) && member.role !== 'proprietaire' && member.role !== 'admin' && member.utilisateurId !== me ? <ActionButton disabled={busy} label={member.role === 'moderateur' ? t.demote : t.promote} onPress={() => void run(() => changeMemberRole(server.id, member.utilisateurId, member.role === 'moderateur' ? 'membre' : 'moderateur'))} /> : null}
      </SectionCard>;
    })}
    {offset !== null ? <ActionButton label={t.more} disabled={busy} onPress={() => void run(async () => { const value = await getMembers(serverId, offset); setExtra(current => [...current, ...value.membres]); setNext(value.suivant); }, false)} /> : null}
    {canManageRooms(server) && !server.parDefaut ? <SectionCard title={t.invite}>
      <ThemedTextInput accessibilityLabel={t.search} value={query} onChangeText={setQuery} maxLength={20} placeholder={t.search} />
      <ActionButton label={t.search} disabled={busy || !query.trim()} onPress={() => void run(async () => setChoices(await searchUsers(query, me)), false)} />
      {choices.map(choice => <ActionButton key={choice.id} label={`${t.invite} · ${choice.pseudo}`} disabled={busy || members.some(m => m.utilisateurId === choice.id) || server.invitations.includes(choice.id)} onPress={() => void run(async () => { await inviteMember(server.id, choice.id); setNotice(true); })} />)}
    </SectionCard> : null}
  </ScrollView>{dialog}{profileSheet}</ThemedView>;
}
