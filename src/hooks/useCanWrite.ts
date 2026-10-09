import { useEffect, useState } from 'react';
import { getServer } from '@/services/rooms.service';
import { fetchServers } from '@/services/serversService';
import { parseConversationId } from '@/types/conversationId';
import { canModerate } from '@/types/serverRole';
import { useSession } from '@/session/SessionContext';
/**
 * Une réponse ancienne ne doit pas rétablir l’écriture après une révocation. Un `serveur.change` relit les droits
 * sans fermer la saisie entre-temps ; `room-message.revoked` la ferme immédiatement.
 */
export function useCanWrite(conversationId: string): boolean {
  const { realtime, user } = useSession();
  const [access, setAccess] = useState<{ id: string; allowed: boolean } | null>(null);
  const ref = parseConversationId(conversationId);
  useEffect(() => {
    const room = parseConversationId(conversationId);
    if (room?.kind !== 'room') return;
    const targetId = room.targetId;
    let alive = true; let generation = 0;
    const read = async () => {
      const version = ++generation;
      try {
        const servers = await fetchServers();
        const summary = servers.find(s => s.channelIds.includes(targetId));
        const server = summary ? await getServer(summary.id) : null;
        const channel = server?.salons.find(c => c.id === targetId);
        const allowed = channel ? (channel.peutEcrire ?? (canModerate(server?.monRole) || (server?.monRole != null && channel.ecriture === 'tous'))) : false;
        if (alive && version === generation) setAccess({ id: conversationId, allowed });
      } catch { if (alive && version === generation) setAccess({ id: conversationId, allowed: false }); }
    };
    void read();
    let off = () => {}; let ready = () => {}; let revoke = () => {};
    try {
    // Droit actuel conservé pendant la relecture : sans cela, la saisie disparaît puis réapparaît à chaque changement.
    off = realtime.subscribe('serveur.change', () => { void read(); });
    ready = realtime.onReady(() => { void read(); });
    revoke = realtime.subscribe('room-message.revoked', raw => { if (raw && typeof raw === 'object' && 'roomId' in raw && raw.roomId === targetId) { generation++; setAccess(null); } });
    } catch { /* Lecture REST possible meme avant la configuration du temps reel. */ }
    return () => { alive = false; generation++; off(); ready(); revoke(); };
  }, [conversationId, realtime]);
  return ref?.kind === 'dm' || (ref?.kind === 'room' && user?.role === 'admin') || (access?.id === conversationId && access.allowed === true);
}
