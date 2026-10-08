import { useCallback, useEffect, useRef, useState } from 'react';

import { confirmDelivery } from '@/services/receipts.service';
import { ApiError, userMessage } from '@/services/ApiError';
import {
  belongsTo,
  deleteMessage,
  editMessage,
  fetchHistory,
  hasNewerMessages,
  mergeMessages,
  sendMessage,
  type RawMessage,
} from '@/services/messagesService';
import { useSession } from '@/session/SessionContext';
import { lookupPseudos } from '@/services/usersService';
import type { ChatMessage } from '@/types/conversation';
import { parseConversationId } from '@/types/conversationId';

const PAGE_SIZE = 50;
/** Suppressions mémorisées (pour ignorer une réponse tardive qui les ramènerait) : les plus anciennes sont oubliées. */
const MAX_DELETED_IDS = 500;
type Status = 'loading' | 'error' | 'ready';

function normalizeEvent(raw: RawMessage, senderId: string, senderName?: string): ChatMessage {
  return {
    id: raw.id,
    senderId,
    senderName,
    content: raw.content,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    ...(raw.deliveredAt ? { deliveredAt: raw.deliveredAt } : {}),
  };
}

export function useMessages(conversationId: string, currentUserId: string, initialMessageId?: string) {
  const { realtime } = useSession();
  const { getRealtimeState, joinRoom, leaveRoom, onConnectionState, onReady, subscribe } = realtime;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Erreur d'abonnement temps réel au salon, indépendante du chargement REST.
  const [accessError, setAccessError] = useState<string | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState<string | null>(null);
  const [connection, setConnection] = useState(getRealtimeState());
  const messagesRef = useRef<ChatMessage[]>([]);
  const statusRef = useRef<Status>('loading');
  const generation = useRef(0);
  const firstLoadDone = useRef(false);
  const eventBuffer = useRef<ChatMessage[]>([]);
  const pseudoCache = useRef(new Map<string, string>());
  const pseudoLookups = useRef(new Set<string>());
  // Chargement de page ancienne en cours (loadOlder ou jumpTo) : l'autre attend ou renonce, pour ne jamais lire le même curseur.
  const olderInFlight = useRef<Promise<void> | null>(null);
  // Messages supprimés pendant la session : une page REST arrivée en retard ne doit pas les faire réapparaître.
  const deletedIds = useRef(new Set<string>());
  const hasOlderRef = useRef(false);
  const subscriptionFailed = useRef(false);
  const [subscriptionAttempt, setSubscriptionAttempt] = useState(0);
  const recentRequest = useRef(0);
  const windowRequest = useRef(0);
  const anchor = useRef<string | null>(initialMessageId ?? null);
  const newerAvailable = useRef(false);
  const [hasNewer, setHasNewer] = useState(false);
  const [loadingNewer, setLoadingNewer] = useState(false);
  const [jumping, setJumping] = useState(false);

  const updateStatus = useCallback((next: Status) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const updateMessages = useCallback((incoming: ChatMessage[]) => {
    // Fusion synchrone pour remonter les réponses invalides à la frontière UI avant tout changement d'état.
    const merged = mergeMessages(
      messagesRef.current,
      incoming.filter((message) => !deletedIds.current.has(message.id)),
    );
    messagesRef.current = merged;
    setMessages(merged);
  }, []);

  /** Retire un message supprimé (événement temps réel ou action locale), y compris du tampon de chargement. */
  const forget = useCallback((messageId: string) => {
    deletedIds.current.add(messageId);
    if (deletedIds.current.size > MAX_DELETED_IDS) deletedIds.current.delete(deletedIds.current.values().next().value as string);
    eventBuffer.current = eventBuffer.current.filter((message) => message.id !== messageId);
    messagesRef.current = messagesRef.current.filter((message) => message.id !== messageId);
    setMessages(messagesRef.current);
  }, []);

  const loadRecent = useCallback(async () => {
    const requestGeneration = generation.current;
    const requestId = ++recentRequest.current;
    const initial = !firstLoadDone.current;
    if (initial) {
      updateStatus('loading');
      setErrorMessage(null);
    }
    try {
      const page = anchor.current ? await fetchHistory(conversationId, PAGE_SIZE, undefined, { around: anchor.current }) : await fetchHistory(conversationId);
      const newest = mergeMessages(messagesRef.current, page)[0];
      const more = anchor.current && newest
        ? await hasNewerMessages(conversationId, newest.id).catch(() => true)
        : false;
      if (requestGeneration !== generation.current || requestId !== recentRequest.current) return;
      newerAvailable.current = more;
      setHasNewer(more);
      if (!more) anchor.current = null;
      for (const message of page) {
        if (conversationId.startsWith('dm:') && message.senderId !== currentUserId && !message.deliveredAt) void confirmDelivery(message.id).catch(() => undefined);
        if (message.senderName) pseudoCache.current.set(message.senderId, message.senderName);
      }
      const buffered = initial ? eventBuffer.current : [];
      updateMessages([...page, ...buffered]);
      if (initial) eventBuffer.current = [];
      if (initial) setHasOlder(page.length === PAGE_SIZE);
      firstLoadDone.current = true;
      updateStatus('ready');
      setErrorMessage(null);
    } catch (error) {
      if (requestGeneration !== generation.current || requestId !== recentRequest.current) return;
      setErrorMessage(userMessage(error));
      if (initial) updateStatus('error');
    }
  }, [conversationId, currentUserId, updateMessages, updateStatus]);

  useEffect(() => {
    const ref = parseConversationId(conversationId);
    const currentGeneration = ++generation.current;
    let joinGeneration = 0;
    messagesRef.current = [];
    anchor.current = initialMessageId ?? null;
    newerAvailable.current = Boolean(initialMessageId);
    windowRequest.current++;
    // La conversation change : ses indicateurs sont reinitialises avec sa liste.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasNewer(Boolean(initialMessageId));
    setLoadingNewer(false);
    setJumping(false);
    // La conversation est une frontière d'état: son changement invalide immédiatement la liste précédente.
    setMessages([]);
    updateStatus('loading');
    setErrorMessage(null);
    setAccessError(null);
    setHasOlder(false);
    setLoadingOlder(false);
    setOlderError(null);
    firstLoadDone.current = false;
    eventBuffer.current = [];
    pseudoCache.current.clear();
    pseudoLookups.current.clear();
    olderInFlight.current = null;
    deletedIds.current.clear();

    const receive = (raw: unknown) => {
      if (currentGeneration !== generation.current) return;
      if (!belongsTo(conversationId, currentUserId, raw)) return;
      const message = raw as RawMessage;
      if (typeof message.id !== 'string' || typeof message.content !== 'string') return;
      const senderId = message.senderId ?? message.authorId;
      if (!senderId) return;
      if (newerAvailable.current && !messagesRef.current.some(item => item.id === message.id)) return;
      const incoming = normalizeEvent(message, senderId, pseudoCache.current.get(senderId));
      try {
        if (firstLoadDone.current) updateMessages([incoming]);
        else eventBuffer.current = mergeMessages(eventBuffer.current, [incoming]);
      } catch (error) {
        if (!(error instanceof ApiError) || error.kind !== 'invalid_response') throw error;
        setErrorMessage(userMessage(error));
        return;
      }

      if (pseudoCache.current.has(senderId) || pseudoLookups.current.has(senderId)) return;
      pseudoLookups.current.add(senderId);
      void lookupPseudos([senderId])
        .then((names) => {
          const name = names[senderId];
          if (!name || currentGeneration !== generation.current) return;
          pseudoCache.current.set(senderId, name);
          const source = firstLoadDone.current ? messagesRef.current : eventBuffer.current;
          const enriched = source
            .filter((item) => item.senderId === senderId)
            .map((item) => ({ ...item, senderName: name }));
          if (firstLoadDone.current) updateMessages(enriched);
          else eventBuffer.current = mergeMessages(eventBuffer.current, enriched);
        })
        .catch((error: unknown) => {
          if (currentGeneration === generation.current) setErrorMessage(userMessage(error));
        })
        .finally(() => {
          if (currentGeneration === generation.current) pseudoLookups.current.delete(senderId);
        });
    };

    const removed = (raw: unknown) => {
      if (currentGeneration !== generation.current) return;
      if (!belongsTo(conversationId, currentUserId, raw)) return;
      const id = (raw as { id?: unknown }).id;
      if (typeof id === 'string') forget(id);
    };

    const revoke = (raw: unknown) => {
      if (currentGeneration !== generation.current) return;
      if (
        typeof raw === 'object' &&
        raw !== null &&
        'roomId' in raw &&
        (raw as { roomId?: unknown }).roomId === ref?.targetId
      ) {
        joinGeneration++;
        setAccessError(userMessage(new ApiError('forbidden', 'Accès au salon révoqué')));
      }
    };

    const events =
      ref?.kind === 'room'
        ? [
            ['room-message.created', receive],
            ['room-message.updated', receive],
            ['room-message.deleted', removed],
            ['room-message.revoked', revoke],
          ] as const
        : [
            ['private-message.created', receive],
            ['private-message.updated', receive],
            ['private-message.delivered', receive],
            ['private-message.deleted', removed],
          ] as const;

    const join = () => {
      if (ref?.kind !== 'room') return;
      const requestJoinGeneration = ++joinGeneration;
      joinRoom(ref.targetId).then(
        () => {
          if (currentGeneration === generation.current && requestJoinGeneration === joinGeneration) setAccessError(null);
        },
        (error: unknown) => {
          if (currentGeneration !== generation.current || requestJoinGeneration !== joinGeneration) return;
          setAccessError(userMessage(error));
        },
      );
    };

    const unsubscribers: (() => void)[] = [];
    try {
      for (const [event, handler] of events) unsubscribers.push(subscribe(event, handler));
      unsubscribers.push(onConnectionState(setConnection));
      unsubscribers.push(onReady(() => {
        if (currentGeneration !== generation.current) return;
        // Suit l'adhésion de la connexion courante, même si l'ancien ACK a été perdu.
        join();
        void loadRecent();
      }));
    } catch (error) {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      if (!(error instanceof ApiError)) throw error;
      subscriptionFailed.current = true;
      setErrorMessage(userMessage(error));
      updateStatus('error');
      return;
    }
    subscriptionFailed.current = false;
    join();
    void loadRecent();

    return () => {
      // Invalide les réponses REST et les résolutions de pseudos de cette conversation.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      if (ref?.kind === 'room') void leaveRoom(ref.targetId).catch(() => undefined);
    };
  }, [conversationId, currentUserId, initialMessageId, forget, getRealtimeState, joinRoom, leaveRoom, loadRecent, onConnectionState, onReady, subscribe, subscriptionAttempt, updateMessages, updateStatus]);

  const retry = useCallback(() => {
    if (subscriptionFailed.current) setSubscriptionAttempt((attempt) => attempt + 1);
    else void loadRecent();
  }, [loadRecent]);

  const loadOlder = useCallback(async () => {
    if (statusRef.current !== 'ready' || olderInFlight.current || !hasOlder) return;
    const oldest = messagesRef.current.at(-1);
    if (!oldest) return;
    const windowVersion = windowRequest.current;
    setLoadingOlder(true);
    setOlderError(null);
    const requestGeneration = generation.current;
    let release!: () => void;
    const inFlight = new Promise<void>((resolve) => (release = resolve));
    olderInFlight.current = inFlight;
    try {
      const page = await fetchHistory(conversationId, PAGE_SIZE, oldest.id);
      if (requestGeneration !== generation.current || windowVersion !== windowRequest.current) return;
      for (const message of page) {
        if (message.senderName) pseudoCache.current.set(message.senderId, message.senderName);
      }
      updateMessages(page);
      hasOlderRef.current = page.length === PAGE_SIZE;
      setHasOlder(hasOlderRef.current);
    } catch (error) {
      if (requestGeneration === generation.current && windowVersion === windowRequest.current) setOlderError(userMessage(error));
    } finally {
      if (olderInFlight.current === inFlight) olderInFlight.current = null;
      if (requestGeneration === generation.current && windowVersion === windowRequest.current) setLoadingOlder(false);
      release();
    }
  }, [conversationId, hasOlder, updateMessages]);

  useEffect(() => {
    hasOlderRef.current = hasOlder;
  }, [hasOlder]);

  /** Une seule page part du message recherche; aucun historique intermediaire n'est charge. */
  const jumpTo = useCallback(async (messageId: string): Promise<boolean> => {
    if (messagesRef.current.some(message => message.id === messageId)) return true;
    const requestGeneration = generation.current;
    const version = ++windowRequest.current;
    recentRequest.current++;
    setJumping(true);
    setLoadingOlder(false);
    setLoadingNewer(false);
    try {
      const page = await fetchHistory(conversationId, PAGE_SIZE, undefined, { around: messageId });
      const more = page[0] ? await hasNewerMessages(conversationId, page[0].id).catch(() => true) : false;
      if (requestGeneration !== generation.current || version !== windowRequest.current) return false;
      if (!page.some(message => message.id === messageId) || deletedIds.current.has(messageId)) return false;
      anchor.current = more ? messageId : null;
      newerAvailable.current = more;
      setHasNewer(more);
      messagesRef.current = [];
      updateMessages(page);
      hasOlderRef.current = page.length === PAGE_SIZE;
      setHasOlder(hasOlderRef.current);
      setLoadingOlder(false);
      setOlderError(null);
      return true;
    } catch { return false; }
    finally { if (requestGeneration === generation.current && version === windowRequest.current) setJumping(false); }
  }, [conversationId, updateMessages]);

  const loadNewer = useCallback(async () => {
    const newest = messagesRef.current[0];
    if (!newerAvailable.current || olderInFlight.current || !newest) return;
    const requestGeneration = generation.current;
    const version = windowRequest.current;
    let release!: () => void;
    const inFlight = new Promise<void>(resolve => { release = resolve; });
    olderInFlight.current = inFlight;
    setLoadingNewer(true);
    setOlderError(null);
    try {
      const page = await fetchHistory(conversationId, PAGE_SIZE, newest.id, { direction: 'after' });
      const more = page.length === PAGE_SIZE
        ? await hasNewerMessages(conversationId, page[0].id).catch(() => true)
        : false;
      if (requestGeneration !== generation.current || version !== windowRequest.current) return;
      updateMessages(page);
      newerAvailable.current = more;
      setHasNewer(newerAvailable.current);
      if (!newerAvailable.current) anchor.current = null;
    } catch (error) {
      if (requestGeneration === generation.current && version === windowRequest.current) setOlderError(userMessage(error));
    } finally {
      if (olderInFlight.current === inFlight) olderInFlight.current = null;
      if (requestGeneration === generation.current && version === windowRequest.current) setLoadingNewer(false);
      release();
    }
  }, [conversationId, updateMessages]);

  const send = useCallback(
    async (text: string) => {
      const requestGeneration = generation.current;
      const sent = await sendMessage(conversationId, text);
      if (requestGeneration === generation.current) {
        if (anchor.current) {
          windowRequest.current++;
          anchor.current = null;
          newerAvailable.current = false;
          setHasNewer(false);
          messagesRef.current = [];
          updateMessages([sent]);
          await loadRecent();
        } else updateMessages([sent]);
      }
    },
    [conversationId, loadRecent, updateMessages],
  );

  const edit = useCallback(
    async (messageId: string, text: string) => {
      const requestGeneration = generation.current;
      const edited = await editMessage(conversationId, messageId, text);
      if (requestGeneration === generation.current) updateMessages([edited]);
    },
    [conversationId, updateMessages],
  );

  const remove = useCallback(
    async (messageId: string) => {
      const requestGeneration = generation.current;
      await deleteMessage(conversationId, messageId);
      if (requestGeneration === generation.current) forget(messageId);
    },
    [conversationId, forget],
  );

  return { hasNewer, loadingNewer, loadNewer, jumping, messages, status, errorMessage, accessError, hasOlder, loadingOlder, olderError, connection, retry, loadOlder, jumpTo, send, edit, remove };
}
