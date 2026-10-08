import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useSession } from '@/session/SessionContext';
import { getReaders, type Reader } from '@/services/receipts.service';
export function useReadReceipts(conversationId: string): Reader[] {
  const { realtime } = useSession();
  const [state, setState] = useState<{ id: string; readers: Reader[] } | null>(null);
  useEffect(() => {
    let alive = true; let sequence = 0;
    const refresh = async () => {
      const version = ++sequence;
      try { const readers = await getReaders(conversationId); if (alive && version === sequence) setState({ id: conversationId, readers }); }
      catch { /* Un accuse inconnu ne doit jamais etre presente comme une lecture. */ }
    };
    void refresh();
    let off: (() => void) | undefined; let ready: (() => void) | undefined;
    try {
      off = realtime?.subscribe?.('read-state.updated', () => void refresh());
      ready = realtime?.onReady?.(() => void refresh());
    } catch { /* Relecture REST au retour au premier plan. */ }
    const listener = AppState.addEventListener('change', value => { if (value === 'active') void refresh(); });
    return () => { alive = false; sequence++; off?.(); ready?.(); listener.remove(); };
  }, [conversationId, realtime]);
  return state?.id === conversationId ? state.readers : [];
}
