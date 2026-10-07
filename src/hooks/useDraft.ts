import { useCallback, useEffect, useRef, useState } from 'react';

import { loadDraft, saveDraft } from '@/adapters/drafts.adapter';

/**
 * Texte en cours de saisie d'une conversation, conservé sur l'appareil. L'écran qui l'utilise doit
 * être remonté quand la conversation change (`key`). Un texte saisi avant la fin de la lecture du
 * brouillon n'est jamais écrasé par celui-ci.
 */
export function useDraft(conversationId: string) {
  const [text, setTextState] = useState('');
  const edited = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void loadDraft(conversationId).then((saved) => {
      if (!cancelled && !edited.current) setTextState(saved);
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  const setText = useCallback(
    (value: string) => {
      edited.current = true;
      setTextState(value);
      void saveDraft(conversationId, value);
    },
    [conversationId],
  );
  const clear = useCallback(() => {
    edited.current = true;
    setTextState('');
    void saveDraft(conversationId, '');
  }, [conversationId]);

  return { text, setText, clear };
}
