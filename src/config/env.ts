import Constants from 'expo-constants';

const API_PORT = 3000;
const FALLBACK_API_URL = `http://localhost:${API_PORT}`;

/**
 * Détermine l'URL du Serveur-API, par ordre de priorité :
 * 1. `EXPO_PUBLIC_API_URL` si définie (obligatoire en tunnel, ou si le backend est sur une autre machine) ;
 * 2. la machine qui sert Metro (`hostUri`), sur le port du Gateway : le cas courant
 *    `npx expo start` avec le backend lancé sur le même poste ;
 * 3. `localhost`.
 */
export function resolveApiUrl(configured: string | undefined, hostUri: string | null | undefined): string {
  const explicit = configured?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');

  const host = hostUri?.split(':')[0]?.trim();
  // Un tunnel (*.exp.direct) ne donne pas accès au backend.
  if (host && !host.endsWith('.exp.direct') && !host.endsWith('.ngrok.io')) {
    return `http://${host}:${API_PORT}`;
  }
  return FALLBACK_API_URL;
}

/** Seul endroit qui lit la configuration d'environnement. */
export const API_URL = resolveApiUrl(process.env.EXPO_PUBLIC_API_URL, Constants.expoConfig?.hostUri);
