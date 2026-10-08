import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { getProfile, updateProfile, updatePresence, type Profile, type ProfilePatch } from '@/services/profileService';
import { useSession } from '@/session/SessionContext';
import { userMessage } from '@/services/ApiError';
type State = { profile: Profile | null; loading: boolean; error: string | null; reload: () => Promise<void>; save: (patch: ProfilePatch) => Promise<void>; presence: (status: Profile['statutPresence']) => Promise<void> };
const Context = createContext<State>({ profile: null, loading: false, error: null, reload: async () => undefined, save: async () => undefined, presence: async () => undefined });
export function ProfileProvider({ children }: PropsWithChildren) {
  const { status, user, realtime } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const epoch = useRef(0);
  const current = useRef(profile);
  useEffect(() => { current.current = profile; }, [profile]);
  const apply = useCallback((value: Profile, generation: number) => {
    if (generation !== epoch.current) return;
    setProfile(value); setError(null);
  }, []);
  const reload = useCallback(async () => {
    const generation = epoch.current; setLoading(true);
    try { apply(await getProfile(), generation); }
    catch (e) { if (generation === epoch.current) setError(userMessage(e)); }
    finally { if (generation === epoch.current) setLoading(false); }
  }, [apply]);
  const save = useCallback(async (patch: ProfilePatch) => { const generation = epoch.current; apply(await updateProfile(patch), generation); realtime?.publishProfile?.(); }, [apply, realtime]);
  const presence = useCallback(async (value: Profile['statutPresence']) => { const generation = epoch.current; apply(await updatePresence(value), generation); realtime?.publishPresence?.(value === 'enLigne' ? 'en-ligne' : 'hors-ligne'); }, [apply, realtime]);
  const userId = user?.id;
  useEffect(() => {
    const counter = epoch;
    counter.current++; let alive = true;
    if (status === 'signedIn' && userId) {
      // Chargement des préférences externes à l’ouverture de session.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void reload();
      const publish = () => realtime?.publishPresence?.(current.current?.statutPresence === 'enLigne' ? 'en-ligne' : 'hors-ligne');
      let offReady: (() => void) | undefined;
      try { offReady = realtime?.onReady?.(publish); } catch { /* La presence sera publiee au prochain signe de vie. */ }
      const heartbeat = () => { if (alive && AppState.currentState === 'active' && current.current?.statutPresence === 'enLigne') void updatePresence('enLigne').then(publish).catch(() => undefined); };
      const timer = setInterval(heartbeat, 20_000);
      const listener = AppState.addEventListener('change', value => { if (value === 'active') { void reload(); heartbeat(); } });
      return () => { alive = false; counter.current++; clearInterval(timer); listener.remove(); offReady?.(); };
    }
    // Nettoyer les préférences avant le compte suivant.
    setProfile(null); setError(null); setLoading(false);
  }, [status, userId, reload, realtime]);
  return <Context.Provider value={{ profile, loading, error, reload, save, presence }}>{children}</Context.Provider>;
}
export const useProfile = () => useContext(Context);
