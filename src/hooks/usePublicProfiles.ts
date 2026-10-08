import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useSession } from '@/session/SessionContext';
import { getPublicProfiles, type PublicProfile } from '@/services/publicProfiles.service';
export type DisplayProfile = PublicProfile & { online: boolean };
/** Profils publics et presence effective, comme sur Electron. */
export function usePublicProfiles(ids: string[]): Record<string, DisplayProfile> {
  const { realtime } = useSession();
  const key = [...new Set(ids)].sort().join(',');
  const [profiles, setProfiles] = useState<Record<string, DisplayProfile>>({});
  useEffect(() => {
    const targets = key ? key.split(',') : [];
    if (!targets.length) return;
    let alive = true;
    let sequence = 0;
    let connected: Set<string> | null = null;
    const offline = new Set<string>();
    async function refresh() {
      const version = ++sequence;
      try {
        const values = await getPublicProfiles(targets);
        if (!alive || version !== sequence) return;
        setProfiles(Object.fromEntries(values.map(value => [value.idUtilisateur, { ...value, online: value.actif && (connected ? connected.has(value.idUtilisateur) : !offline.has(value.idUtilisateur)) }])));
      } catch { /* Une panne de profil ne masque pas les messages. */ }
    }
    async function follow() {
      if (!realtime?.followPresence) return;
      try {
        const online = await realtime.followPresence(targets);
        if (!alive) return;
        connected = new Set(online);
        await refresh();
      } catch { /* Le sondage REST reste disponible apres une coupure. */ }
    }
    void refresh();
    void follow();
    let offReady: (() => void) | undefined;
    let offProfile: (() => void) | undefined;
    let offPresence: (() => void) | undefined;
    try {
    offReady = realtime?.onReady?.(() => void follow());
    offProfile = realtime?.subscribe?.('profil.changed', () => void refresh());
    offPresence = realtime?.subscribe?.('presence.changed', raw => {
      if (!raw || typeof raw !== 'object') return;
      const event = raw as { userId?: unknown; statut?: unknown };
      if (typeof event.userId !== 'string' || !targets.includes(event.userId) || !['en-ligne', 'hors-ligne'].includes(String(event.statut))) return;
      if (event.statut === 'en-ligne') { offline.delete(event.userId); connected?.add(event.userId); }
      else { offline.add(event.userId); connected?.delete(event.userId); }
      void refresh();
    });
    } catch { /* Le REST reste disponible pendant la configuration de session. */ }
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 30_000);
    return () => { alive = false; sequence++; clearInterval(timer); offReady?.(); offProfile?.(); offPresence?.(); };
  }, [key, realtime]);
  return profiles;
}
