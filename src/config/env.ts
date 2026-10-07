import Constants from 'expo-constants';

const API_PORT = 3000;
const FALLBACK_API_URL = `http://localhost:${API_PORT}`;

/** `localhost`, nom mDNS (`.local`) ou IPv4 privée / de boucle locale / lien local. */
export function isLocalHost(host: string): boolean {
  if (host === 'localhost' || host.endsWith('.local')) return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254);
}

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
  // Seule une adresse locale désigne le poste qui héberge aussi le backend : tout autre hôte
  // (tunnel exp.direct, ngrok, Cloudflare, etc.) ne donne pas accès au backend.
  if (host && isLocalHost(host)) return `http://${host}:${API_PORT}`;
  return FALLBACK_API_URL;
}

/**
 * Seul endroit qui lit la configuration d'environnement. Résolue au chargement du bundle :
 * un changement d'IP ou de `.env` demande de relancer Metro (`npm start -- -c`).
 */
export const API_URL = resolveApiUrl(process.env.EXPO_PUBLIC_API_URL, Constants.expoConfig?.hostUri);
