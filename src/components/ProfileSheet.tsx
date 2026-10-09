import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { ThemedText } from '@/components/themed-text';
import { UserAvatar } from '@/components/UserAvatar';
import { usePublicProfiles, type DisplayProfile } from '@/hooks/usePublicProfiles';
import { useTheme } from '@/hooks/use-theme';
import { useTranslation } from '@/i18n';
import { lookupPseudos } from '@/services/usersService';
import { useSession } from '@/session/SessionContext';

/** Personne dont on affiche le profil ; `pseudo` évite une requête quand l'écran le connaît déjà. */
export type ProfileTarget = { userId: string; pseudo?: string | null };

type Options = {
  /** Ouvre la conversation privée avec cette personne (bouton « Message privé »). */
  onMessage: (userId: string, name: string) => void;
  /** Conversation affichée : le bouton est masqué si c'est déjà celle avec cette personne. */
  currentConversationId?: string;
  /**
   * Profils déjà suivis par l'écran (alias, photo, présence), lus en direct par la fiche : mêmes valeurs que la
   * pastille de la liste, sans nouvelle requête. Sans eux, la fiche suit la personne elle-même.
   */
  profiles?: Record<string, DisplayProfile>;
};

/**
 * Fiche de profil d'un autre utilisateur : photo, alias, pseudo, présence et bouton « Message privé ».
 * `show` l'ouvre ; `sheet` est à rendre dans l'écran (comme le dialogue de `useAppDialog`).
 */
export function useProfileSheet({ onMessage, currentConversationId, profiles }: Options) {
  const [target, setTarget] = useState<ProfileTarget | null>(null);
  const show = useCallback((next: ProfileTarget) => setTarget(next), []);
  const close = useCallback(() => setTarget(null), []);
  const sheet = target ? (
    <ProfileSheet
      key={target.userId}
      target={target}
      known={profiles}
      onClose={close}
      onMessage={currentConversationId === `dm:${target.userId}` ? undefined : (userId, name) => { close(); onMessage(userId, name); }}
    />
  ) : null;
  return { show, sheet };
}

function ProfileSheet({ target, known, onClose, onMessage }: { target: ProfileTarget; known?: Record<string, DisplayProfile>; onClose: () => void; onMessage?: (userId: string, name: string) => void }) {
  const theme = useTheme();
  const { strings } = useTranslation();
  const t = strings.profileCard;
  const { user } = useSession();
  // Alias, photo et présence en direct : ceux de l'écran s'il les suit déjà, sinon suivis par la fiche.
  const own = usePublicProfiles(known ? [] : [target.userId]);
  const profile = (known ?? own)[target.userId];
  const [fetchedPseudo, setFetchedPseudo] = useState<string | null>(null);
  useEffect(() => {
    if (target.pseudo) return;
    let alive = true;
    lookupPseudos([target.userId]).then(
      names => { if (alive) setFetchedPseudo(names[target.userId] ?? null); },
      () => undefined,
    );
    return () => { alive = false; };
  }, [target.userId, target.pseudo]);
  const pseudo = target.pseudo || fetchedPseudo;
  const name = profile?.alias || pseudo || strings.conversation.unknownUser;
  const mine = target.userId === user?.id;

  return <Modal transparent animationType="fade" visible onRequestClose={onClose}>
    <Pressable accessibilityLabel={t.close} onPress={onClose} style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16, backgroundColor: '#00000080' }}>
      {/* Le contenu absorbe l'appui : seul un appui sur le fond ferme la fiche. */}
      <Pressable accessibilityViewIsModal testID="profile-sheet" onPress={() => undefined} style={{ width: '100%', maxWidth: 360, alignItems: 'center', gap: 10, backgroundColor: theme.card, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: theme.textSecondary + '30' }}>
        <UserAvatar avatar={profile?.avatar} online={profile?.online} name={name} size={88} />
        <ThemedText accessibilityRole="header" style={{ fontSize: 20, fontWeight: '700', textAlign: 'center' }}>{name}</ThemedText>
        {pseudo ? <ThemedText themeColor="textSecondary">@{pseudo}</ThemedText> : null}
        <ThemedText type="small" themeColor="textSecondary">{profile?.online ? strings.control.online : strings.control.offline}</ThemedText>
        <View style={{ alignSelf: 'stretch', gap: 6, paddingVertical: 6 }}>
          <ThemedText type="small" themeColor="textSecondary">{t.alias}</ThemedText>
          <ThemedText>{profile?.alias || t.noAlias}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{t.pseudo}</ThemedText>
          <ThemedText>{pseudo || strings.conversation.unknownUser}</ThemedText>
        </View>
        <View style={{ alignSelf: 'stretch', gap: 10 }}>
          {!mine && onMessage ? <ActionButton label={t.message} onPress={() => onMessage(target.userId, name)} /> : null}
          <ActionButton label={t.close} onPress={onClose} />
        </View>
      </Pressable>
    </Pressable>
  </Modal>;
}
