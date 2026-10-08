import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { getPermission, showMessageNotification } from '@/adapters/notifications.adapter';
import { useProfile } from '@/profile/ProfileContext';
import { useTranslation } from '@/i18n';
import { confirmDelivery } from '@/services/receipts.service';
import { markConversationRead } from '@/services/unreadService';
import { lookupPseudos } from '@/services/usersService';
import { useSession } from '@/session/SessionContext';
import { toConversationId } from '@/types/conversationId';
import { useUnread } from '@/unread/UnreadContext';

const MAX_CACHED_TITLES = 500;

type Incoming = { conversationId: string; senderId: string } | null;

function str(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

/** Conversation et expéditeur d'un événement temps réel, ou `null` pour un message de soi-même ou invalide. */
export function parseIncoming(kind: 'dm' | 'room', raw: unknown, userId: string): Incoming {
  if (typeof raw !== 'object' || raw === null) return null;
  const message = raw as Record<string, unknown>;
  if (kind === 'dm') {
    const senderId = str(message.senderId);
    if (!senderId || senderId === userId || message.recipientId !== userId) return null;
    return { conversationId: toConversationId({ kind: 'dm', targetId: senderId }), senderId };
  }
  const roomId = str(message.roomId);
  const senderId = str(message.authorId);
  if (!roomId || !senderId || senderId === userId) return null;
  return { conversationId: toConversationId({ kind: 'room', targetId: roomId }), senderId };
}

/**
 * Nouveau message reçu en temps réel :
 * - conversation affichée au premier plan : on la marque lue, aucun compteur ni notification ;
 * - sinon : le compteur de non-lus augmente (badge) et, si la permission est accordée, une notification
 *   locale s'affiche. Elle ne contient que le pseudo ; le texte du message n'y figure jamais.
 */
export function useMessageAlerts(userId: string, activeConversationId: string | null) {
  const { subscribe } = useSession().realtime;
  const unread = useUnread();
  const { strings } = useTranslation();
  const { profile } = useProfile();
  const mode = profile?.modeNotification;
  const active = useRef(activeConversationId);
  const unreadRef = useRef(unread);
  const titles = useRef(new Map<string, string>());
  // La permission ne change pas en cours de session : relue seulement tant qu'elle n'est pas accordée.
  const granted = useRef(false);

  useEffect(() => {
    active.current = activeConversationId;
    unreadRef.current = unread;
  });

  // Ouvrir une conversation la marque lue (état en base, partagé avec les autres appareils) ; revenir au premier
  // plan avec elle encore affichée aussi : les messages reçus en arrière-plan l'ont rendue non lue.
  useEffect(() => {
    const markActiveRead = () => {
      if (!activeConversationId) return;
      unreadRef.current.clear(activeConversationId);
      void markConversationRead(activeConversationId).catch(() => undefined);
    };
    markActiveRead();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') markActiveRead();
    });
    return () => appState.remove();
  }, [activeConversationId]);

  useEffect(() => {
    let alive = true;
    const notify = async (conversationId: string, senderId: string) => {
      if (mode !== 'systeme') return;
      if (!granted.current) {
        granted.current = (await getPermission()) === 'granted';
        if (!granted.current) return;
      }
      if (!titles.current.has(senderId)) {
        const names = await lookupPseudos([senderId]).catch(() => ({}) as Record<string, string>);
        if (names[senderId]) {
          // Cache borné (le plus ancien est oublié) : une longue session sur un serveur très actif ne le fait pas grossir.
          if (titles.current.size >= MAX_CACHED_TITLES) titles.current.delete(titles.current.keys().next().value as string);
          titles.current.set(senderId, names[senderId]);
        }
      }
      if (!alive || (active.current === conversationId && AppState.currentState === 'active')) return;
      await showMessageNotification({
        conversationId,
        title: titles.current.get(senderId) ?? strings.brand,
        body: strings.notifications.newMessage,
      });
    };

    const handle = (kind: 'dm' | 'room') => (raw: unknown) => {
      const incoming = parseIncoming(kind, raw, userId);
      if (!incoming) return;
      if (kind === 'dm' && raw && typeof raw === 'object' && 'id' in raw && typeof raw.id === 'string') void confirmDelivery(raw.id).catch(() => undefined);
      if (active.current === incoming.conversationId && AppState.currentState === 'active') {
        void markConversationRead(incoming.conversationId).catch(() => undefined);
        return;
      }
      unreadRef.current.increment(incoming.conversationId);
      void notify(incoming.conversationId, incoming.senderId);
    };

    try {
      const offDm = subscribe('private-message.created', handle('dm'));
      const offRoom = subscribe('room-message.created', handle('room'));
      return () => {
        alive = false;
        offDm();
        offRoom();
      };
    } catch {
      return undefined;
    }
  }, [userId, strings, subscribe, mode]);
}
