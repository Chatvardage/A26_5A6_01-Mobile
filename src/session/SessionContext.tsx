/**
 * Session PROVISOIRE (en mémoire seulement) : elle fournit le contrat dont la
 * navigation a besoin (`status`, `user`, `signIn`, `signOut`).
 * La session complète (SecureStore, restauration, renouvellement, effacement
 * de l'état de navigation) remplacera ce fichier sans toucher aux écrans.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { login, type AuthUser } from '@/services/authService';
import { configureHttpClient } from '@/services/httpClient';

export type SessionStatus = 'loading' | 'signedIn' | 'signedOut';

export type Session = {
  status: SessionStatus;
  user: AuthUser | null;
  signIn: (identifiant: string, motDePasse: string) => Promise<void>;
  signOut: () => void;
};

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<{ token: string; user: AuthUser } | null>(null);
  // TODO(session) : provisoire. Le jeton reste en mémoire et se perd à chaque redémarrage. La session
  // complète le stockera avec expo-secure-store et le restaurera au démarrage (status « loading »).
  const tokenRef = useRef<string | null>(null);

  const signOut = useCallback(() => {
    tokenRef.current = null;
    setAuth(null);
  }, []);

  useEffect(() => {
    configureHttpClient({ getToken: () => tokenRef.current, onUnauthorized: signOut });
  }, [signOut]);

  const signIn = useCallback(async (identifiant: string, motDePasse: string) => {
    const result = await login(identifiant, motDePasse);
    tokenRef.current = result.jeton;
    setAuth({ token: result.jeton, user: result.utilisateur });
  }, []);

  const value = useMemo<Session>(
    () => ({ status: auth ? 'signedIn' : 'signedOut', user: auth?.user ?? null, signIn, signOut }),
    [auth, signIn, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession doit être utilisé dans un SessionProvider');
  return ctx;
}
