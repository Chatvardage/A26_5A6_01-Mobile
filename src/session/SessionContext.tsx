import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Registration } from '@/services/authService';
import { SessionManager, type SessionState } from './SessionManager';
import type { RealtimeService } from '@/services/websocketService';
export type { SessionStatus } from './SessionManager';
export type Session = SessionState & {
  realtime: RealtimeService;
  drafts: Map<string, string>;
  signIn: (identifiant: string, motDePasse: string) => Promise<void>;
  register: (input: Registration) => Promise<void>;
  signOut: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  deleteAccount: (currentPassword: string) => Promise<void>;
  logoutOthers: () => Promise<void>;
  restoreSession: () => Promise<void>;
  refreshSession: () => Promise<void>;
};
const SessionContext = createContext<Session | null>(null);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [manager] = useState(() => new SessionManager());
  const state = useSyncExternalStore(manager.subscribe, manager.snapshot, manager.snapshot);
  useEffect(() => {
    void manager.start();
    return () => manager.dispose();
  }, [manager]);
  return (
    <SessionContext.Provider
      value={{
        ...state,
        realtime: manager.realtime,
        drafts: manager.drafts,
        signIn: manager.signIn,
        register: manager.register,
        signOut: manager.signOut,
        changePassword: manager.changePassword,
        deleteAccount: manager.deleteAccount,
        logoutOthers: manager.logoutOthers,
        restoreSession: manager.restoreSession,
        refreshSession: manager.refreshSession,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}
export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession doit être utilisé dans un SessionProvider');
  return ctx;
}
