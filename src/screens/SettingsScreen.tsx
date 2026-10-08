import { useEffect, useState } from 'react';
import { Image, ScrollView, View, Pressable, StyleSheet } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { pickAvatar } from '@/adapters/avatar.adapter';
import { AccountSection } from '@/components/AccountSection';
import { ActionButton } from '@/components/ActionButton';
import { ThemedText } from '@/components/themed-text';
import { ThemedTextInput } from '@/components/ThemedTextInput';
import { ThemedView } from '@/components/themed-view';
import { useNotificationPermission } from '@/hooks/useNotificationPermission';
import { useTheme } from '@/hooks/use-theme';
import { useConnection } from '@/hooks/useConnection';
import { useSession } from '@/session/SessionContext';
import { useTranslation } from '@/i18n';
import { useProfile } from '@/profile/ProfileContext';
import { userMessage } from '@/services/ApiError';
export function SettingsScreen() {
  const theme = useTheme(); const { strings } = useTranslation(); const t = strings.control;
  const { user, signOut } = useSession(); const { profile, loading, error, reload, save, presence } = useProfile();
  const { permission, request, openSettings } = useNotificationPermission(); const { status } = useConnection();
  const [alias, setAlias] = useState(''); const [busy, setBusy] = useState(false); const [result, setResult] = useState<unknown>(null); const [saved, setSaved] = useState(false);
  useEffect(() => { if (profile) { // Synchronisation du formulaire après lecture du profil.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAlias(profile.alias ?? '');
  } }, [profile]);
  async function run(action: () => Promise<void>) { if (busy) return; setBusy(true); setResult(null); setSaved(false); try { await action(); setSaved(true); } catch (e) { setResult(e); } finally { setBusy(false); } }
  const card = { ...styles.card, backgroundColor: theme.card };
  function heading(label: string, icon: 'person' | 'notifications' | 'settings') {
    const ios = icon === 'person' ? 'person.crop.circle' : icon === 'notifications' ? 'bell' : 'gearshape';
    return <View style={styles.heading}><SymbolView name={{ ios, android: icon, web: icon }} tintColor={theme.accent} size={24} fallback={<ThemedText>{icon === 'person' ? '\u25cb' : icon === 'notifications' ? '\u2667' : '\u2699'}</ThemedText>} /><ThemedText style={styles.sectionTitle}>{label}</ThemedText></View>;
  }
  function option(label: string, selected: boolean, action: () => Promise<void>) {
    return <Pressable key={label} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected, disabled: busy }} disabled={busy} onPress={() => void run(action)} style={[styles.option, { backgroundColor: selected ? theme.backgroundSelected : theme.card, borderColor: selected ? theme.accent : theme.textSecondary + '30' }]}><ThemedText style={{ flex: 1 }}>{label}</ThemedText><ThemedText themeColor={selected ? 'accent' : 'textSecondary'}>{selected ? '\u2713' : '\u25cb'}</ThemedText></Pressable>;
  }
  return <ThemedView style={{ flex: 1 }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <View style={card}><ThemedText type="smallBold">{strings.preferences.connectedAs}</ThemedText><ThemedText type="subtitle">{user?.pseudo ?? '—'}</ThemedText>
    <ThemedText>{t.status} : {status === 'online' ? t.connected : status === 'offline' ? t.offline : strings.connection.reconnecting}</ThemedText></View>
    {loading ? <ThemedText>{strings.states.loading}</ThemedText> : null}
    {error ? <><ThemedText accessibilityRole="alert" themeColor="danger">{error}</ThemedText><ActionButton label={strings.navigation.retry} onPress={() => void reload()} /></> : null}
    {result ? <ThemedText accessibilityRole="alert" themeColor="danger">{userMessage(result)}</ThemedText> : null}
    {saved ? <ThemedText accessibilityLiveRegion="polite">{t.saved}</ThemedText> : null}
    {profile ? <>
      <View style={card}>{heading(t.profile, 'person')}
      {profile.avatar ? <Image accessibilityLabel={t.avatar} source={{ uri: profile.avatar }} style={{ width: 80, height: 80, borderRadius: 40 }} /> : null}
      <ActionButton label={t.chooseAvatar} disabled={busy} onPress={() => void run(async () => { const avatar = await pickAvatar(); if (avatar) await save({ avatar }); })} />
      {profile.avatar ? <ActionButton label={t.removeAvatar} disabled={busy} onPress={() => void run(() => save({ avatar: null }))} /> : null}
      <ThemedTextInput accessibilityLabel={t.alias} placeholder={t.alias} maxLength={50} value={alias} onChangeText={setAlias} />
      <ActionButton label={t.save} disabled={busy} onPress={() => void run(() => save({ alias: alias.trim() }))} />
      </View><View style={card}>{heading(t.language, 'settings')}
      <ThemedText>{t.deviceLanguage}</ThemedText>
      </View><View style={card}><ThemedText style={styles.sectionTitle}>{t.presence}</ThemedText>
      {(['enLigne', 'horsLigne'] as const).map(value => option(value === 'enLigne' ? t.online : t.offline, profile.statutPresence === value, () => presence(value)))}
      </View>
    </> : null}
    <View style={card}>{heading(strings.notifications.title, 'notifications')}
    {profile ? (['systeme', 'discret', 'aucune'] as const).map(value => option(value === 'systeme' ? t.system : value === 'discret' ? t.discreet : t.none, profile.modeNotification === value, () => save({ modeNotification: value }))) : null}
    {permission ? <ThemedText testID="notification-permission">{strings.notifications[permission]}</ThemedText> : null}
    {permission === 'undetermined' ? <ActionButton label={strings.notifications.enable} onPress={() => void request()} /> : permission === 'denied' ? <ActionButton label={strings.notifications.openSettings} onPress={() => void openSettings()} /> : null}
    <ThemedText type="small">{strings.notifications.badgeNote}</ThemedText><ThemedText type="small">{t.notificationLimit}</ThemedText>
    </View><AccountSection cardStyle={card} /><View style={card}><ActionButton label={strings.preferences.signOut} danger disabled={busy} onPress={() => void run(signOut)} /></View>
  </ScrollView></ThemedView>;
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 16, maxWidth: 700, width: '100%', alignSelf: 'center' },
  card: { padding: 20, borderRadius: 20, gap: 14 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionTitle: { fontSize: 20, fontWeight: '700' },
  option: { minHeight: 52, padding: 14, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
});
