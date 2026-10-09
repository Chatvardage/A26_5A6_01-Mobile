import { useState } from 'react';
import { View } from 'react-native';
import { ActionButton } from './ActionButton';
import { ThemedText } from './themed-text';
import { ThemedTextInput } from './ThemedTextInput';
import { useTranslation } from '@/i18n';
import type { ChannelPolicy, RoomInput } from '@/services/rooms.service';

/**
 * Nom et droits d'un salon (création dans la gestion du serveur, modification sur son propre écran).
 * `onSubmit` rend `true` en cas de succès : `resetOnSuccess` vide alors le formulaire; un échec le conserve.
 */
export function RoomForm({ initial, submitLabel, busy, onSubmit, resetOnSuccess = false }: { initial?: RoomInput; submitLabel: string; busy: boolean; onSubmit: (input: RoomInput) => Promise<boolean>; resetOnSuccess?: boolean }) {
  const { strings } = useTranslation(); const t = strings.control;
  const [name, setName] = useState(initial?.nom ?? '');
  const [access, setAccess] = useState<ChannelPolicy>(initial?.acces ?? 'tous'); const [write, setWrite] = useState<ChannelPolicy>(initial?.ecriture ?? 'tous');
  async function submit() {
    if (await onSubmit({ nom: name.trim(), acces: access, ecriture: write }) && resetOnSuccess) { setName(''); setAccess('tous'); setWrite('tous'); }
  }
  const policy = (value: ChannelPolicy, select: (next: ChannelPolicy) => void) => <View style={{ flexDirection: 'row', gap: 10 }}>{(['tous', 'moderateurs'] as const).map(option => <ActionButton compact key={option} label={`${value === option ? '✓ ' : ''}${option === 'tous' ? t.everyone : t.moderators}`} onPress={() => select(option)} />)}</View>;
  return <>
    <ThemedTextInput accessibilityLabel={t.roomName} placeholder={t.roomName} value={name} maxLength={80} onChangeText={setName} />
    <ThemedText>{t.readPolicy}</ThemedText>
    {policy(access, setAccess)}
    <ThemedText>{t.writePolicy}</ThemedText>
    {policy(write, setWrite)}
    <ActionButton label={submitLabel} disabled={busy || !name.trim()} onPress={() => void submit()} />
  </>;
}
