import { useState } from 'react';
import { View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { useAppDialog } from '@/components/AppDialog';
import { ThemedText } from '@/components/themed-text';
import { ThemedTextInput } from '@/components/ThemedTextInput';
import { useTranslation } from '@/i18n';
import { userMessage } from '@/services/ApiError';
import { useSession } from '@/session/SessionContext';

/** Même borne qu'à l'inscription (Authentification : 8 à 128 caractères). */
const validPassword = (value: string) => value.length >= 8 && value.length <= 128;

/**
 * Compte : modifier le mot de passe (l'actuel est exigé, la session est rouverte avec le nouveau), déconnecter
 * les autres appareils (celui-ci reste connecté) et supprimer le compte (mot de passe actuel, puis confirmation
 * définitive). Changer le mot de passe ou supprimer le compte déconnecte aussi les autres appareils.
 */
export function AccountSection({ cardStyle }: { cardStyle: object }) {
  const { strings } = useTranslation(); const t = strings.account; const validation = strings.auth.register.validation;
  const { changePassword, deleteAccount, logoutOthers } = useSession();
  const { show, dialog } = useAppDialog();
  const [current, setCurrent] = useState(''); const [next, setNext] = useState(''); const [confirmation, setConfirmation] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [changed, setChanged] = useState(false); const [othersSignedOut, setOthersSignedOut] = useState(false);

  async function run(action: () => Promise<void>, onSuccess?: () => void) {
    if (busy) return; setBusy(true); setError(null); setChanged(false); setOthersSignedOut(false);
    try { await action(); onSuccess?.(); } catch (e) { setError(userMessage(e)); } finally { setBusy(false); }
  }
  function submitPassword() {
    if (!validPassword(next)) return setError(validation.password);
    if (next !== confirmation) return setError(validation.confirmation);
    void run(() => changePassword(current, next), () => { setCurrent(''); setNext(''); setConfirmation(''); setChanged(true); });
  }
  function confirmLogoutOthers() {
    show({ title: t.logoutOthersTitle, message: t.logoutOthersBody, actions: [{ label: strings.control.cancel, kind: 'cancel' }, { label: t.logoutOthers, kind: 'danger', onPress: () => void run(logoutOthers, () => setOthersSignedOut(true)) }] });
  }
  function confirmDelete() {
    show({ title: t.deleteConfirmTitle, message: t.deleteConfirmBody, actions: [{ label: strings.control.cancel, kind: 'cancel' }, { label: t.deleteAccount, kind: 'danger', onPress: () => void run(() => deleteAccount(deletePassword)) }] });
  }

  return <View style={cardStyle}>
    <ThemedText style={{ fontSize: 20, fontWeight: '700' }}>{t.title}</ThemedText>
    {error ? <ThemedText accessibilityRole="alert" themeColor="danger">{error}</ThemedText> : null}
    {changed ? <ThemedText accessibilityLiveRegion="polite">{t.passwordChanged}</ThemedText> : null}
    <ThemedText type="smallBold">{t.changePassword}</ThemedText>
    <ThemedTextInput accessibilityLabel={t.currentPassword} placeholder={t.currentPassword} secureTextEntry autoCapitalize="none" autoComplete="current-password" maxLength={128} value={current} onChangeText={setCurrent} />
    <ThemedTextInput accessibilityLabel={t.newPassword} placeholder={t.newPassword} secureTextEntry autoCapitalize="none" autoComplete="new-password" maxLength={128} value={next} onChangeText={setNext} />
    <ThemedTextInput accessibilityLabel={t.confirmPassword} placeholder={t.confirmPassword} secureTextEntry autoCapitalize="none" autoComplete="new-password" maxLength={128} value={confirmation} onChangeText={setConfirmation} />
    <ActionButton label={t.changePassword} disabled={busy || !current || !next || !confirmation} onPress={submitPassword} />
    <ThemedText type="smallBold">{t.otherDevices}</ThemedText>
    {othersSignedOut ? <ThemedText accessibilityLiveRegion="polite">{t.othersSignedOut}</ThemedText> : null}
    <ActionButton label={t.logoutOthers} danger disabled={busy} onPress={confirmLogoutOthers} />
    <ThemedText type="smallBold">{t.deleteAccount}</ThemedText>
    <ThemedText type="small" themeColor="textSecondary">{t.deleteWarning}</ThemedText>
    <ThemedTextInput accessibilityLabel={`${t.deleteAccount} · ${t.currentPassword}`} placeholder={t.currentPassword} secureTextEntry autoCapitalize="none" autoComplete="current-password" maxLength={128} value={deletePassword} onChangeText={setDeletePassword} />
    <ActionButton label={t.deleteAccount} danger disabled={busy || !deletePassword} onPress={confirmDelete} />
    {dialog}
  </View>;
}
