import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, userMessage } from '@/services/ApiError';
import {
  belongsTo,
  editMessage,
  fetchHistory,
  mergeMessages,
  sendMessage,
  type RawMessage,
} from '@/services/messagesService';
import {
  getRealtimeState,
  hasRealtimeBeenReady,
  joinRoom,
  leaveRoom,
  onConnectionState,
  onReady,
  subscribe,
} from '@/services/websocketService';
import { lookupPseudos } from '@/services/usersService';
import type { ChatMessage } from '@/types/conversation';
import { parseConversationId } from '@/types/conversationId';

const PAGE_SIZE = 50;
type Status = 'loading' | 'error' | 'ready';

function normalizeEvent(raw: RawMessage, senderId: string, senderName?: string): ChatMessage {
  return {
    id: raw.id,
    senderId,
    senderName,
    content: raw.content,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export function useMessages(conversationId: string, currentUserId: string) {
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
  const olderRequest = useRef(false);
  const subscriptionFailed = useRef(false);
  const [subscriptionAttempt, setSubscriptionAttempt] = useState(0);

  const updateStatus = useCallback((next: Status) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const updateMessages = useCallback((incoming: ChatMessage[]) => {
    // Fusion synchrone pour remonter les réponses invalides à la frontière UI avant tout changement d'état.
    const merged = mergeMessages(messagesRef.current, incoming);
    messagesRef.current = merged;
    setMessages(merged);
  }, []);

  const loadRecent = useCallback(async () => {
    const requestGeneration = generation.current;
    const initial = !firstLoadDone.current;
    if (initial) {
      updateStatus('loading');
      setErrorMessage(null);
    }
    try {
      const page = await fetchHistory(conversationId);
      if (requestGeneration !== generation.current) return;
      for (const message of page) {
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
      if (requestGeneration !== generation.current) return;
      setErrorMessage(userMessage(error));
      if (initial) updateStatus('error');
    }
  }, [conversationId, updateMessages, updateStatus]);

  useEffect(() => {
    const ref = parseConversationId(conversationId);
    const currentGeneration = ++generation.current;
    let firstReadyIsInitial = !hasRealtimeBeenReady();
    let joinFailed = false;
    messagesRef.current = [];
    // La conversation est une frontière d'état: son changement invalide immédiatement la liste précédente.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    olderRequest.current = false;

    const receive = (raw: unknown) => {
      if (!belongsTo(conversationId, currentUserId, raw) || typeof raw !== 'object' || raw === null) return;
      const message = raw as RawMessage;
      if (typeof message.id !== 'string' || typeof message.content !== 'string') return;
      const senderId = message.senderId ?? message.authorId;
      if (!senderId) return;
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
          const enriched = { ...incoming, senderName: name };
          if (firstLoadDone.current) updateMessages([enriched]);
          else eventBuffer.current = mergeMessages(eventBuffer.current, [enriched]);
        })
        .catch((error: unknown) => {
          if (currentGeneration === generation.current) setErrorMessage(userMessage(error));
        });
    };

    const revoke = (raw: unknown) => {
      if (
        typeof raw === 'object' &&
        raw !== null &&
        'roomId' in raw &&
        (raw as { roomId?: unknown }).roomId === ref?.targetId
      ) {
        joinFailed = true;
        setAccessError(userMessage(new ApiError('forbidden', 'Accès au salon révoqué')));
      }
    };

    const events =
      ref?.kind === 'room'
        ? [
            ['room-message.created', receive],
            ['room-message.updated', receive],
            ['room-message.revoked', revoke],
          ] as const
        : [
            ['private-message.created', receive],
            ['private-message.updated', receive],
          ] as const;

    const join = () => {
      if (ref?.kind !== 'room') return;
      joinFailed = false;
      joinRoom(ref.targetId).then(
        () => {
          if (currentGeneration === generation.current) setAccessError(null);
        },
        (error: unknown) => {
          if (currentGeneration !== generation.current) return;
          joinFailed = true;
          setAccessError(userMessage(error));
        },
      );
    };

    const unsubscribers: (() => void)[] = [];
    try {
      for (const [event, handler] of events) unsubscribers.push(subscribe(event, handler));
      unsubscribers.push(onConnectionState(setConnection));
      unsubscribers.push(onReady(() => {
        // Un abonnement expiré avant la première connexion, refusé ou révoqué est retenté à chaque connexion prête.
        if (joinFailed) join();
        if (firstReadyIsInitial) {
          firstReadyIsInitial = false;
          return;
        }
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
    setConnection(getRealtimeState());
    join();
    void loadRecent();

    return () => {
      // Invalide les réponses REST et les résolutions de pseudos de cette conversation.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      if (ref?.kind === 'room') void leaveRoom(ref.targetId).catch(() => undefined);
    };
  }, [conversationId, currentUserId, loadRecent, subscriptionAttempt, updateMessages, updateStatus]);

  const retry = useCallback(() => {
    if (subscriptionFailed.current) setSubscriptionAttempt((attempt) => attempt + 1);
    else void loadRecent();
  }, [loadRecent]);

  const loadOlder = useCallback(async () => {
    if (statusRef.current !== 'ready' || olderRequest.current || !hasOlder) return;
    const oldest = messagesRef.current.at(-1);
    if (!oldest) return;
    olderRequest.current = true;
    setLoadingOlder(true);
    setOlderError(null);
    const requestGeneration = generation.current;
    try {
      const page = await fetchHistory(conversationId, PAGE_SIZE, oldest.id);
      if (requestGeneration !== generation.current) return;
      for (const message of page) {
        if (message.senderName) pseudoCache.current.set(message.senderId, message.senderName);
      }
      updateMessages(page);
      setHasOlder(page.length === PAGE_SIZE);
    } catch (error) {
      if (requestGeneration === generation.current) setOlderError(userMessage(error));
    } finally {
      if (requestGeneration === generation.current) {
        olderRequest.current = false;
        setLoadingOlder(false);
      }
    }
  }, [conversationId, hasOlder, updateMessages]);

  const send = useCallback(
    async (text: string) => {
      const requestGeneration = generation.current;
      try {
        const sent = await sendMessage(conversationId, text);
        if (requestGeneration === generation.current) updateMessages([sent]);
      } catch (error) {
        throw userMessage(error);
      }
    },
    [conversationId, updateMessages],
  );

  const edit = useCallback(
    async (messageId: string, text: string) => {
      const requestGeneration = generation.current;
      try {
        const edited = await editMessage(conversationId, messageId, text);
        if (requestGeneration === generation.current) updateMessages([edited]);
      } catch (error) {
        throw userMessage(error);
      }
    },
    [conversationId, updateMessages],
  );

  return { messages, status, errorMessage, accessError, hasOlder, loadingOlder, olderError, connection, retry, loadOlder, send, edit };
}
