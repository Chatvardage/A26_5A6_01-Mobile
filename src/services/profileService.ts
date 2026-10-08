import { apiFetch } from './httpClient';
export type Profile = { idUtilisateur: string; alias: string | null; avatar: string | null; theme: 'sombre' | 'clair'; langue: 'fr' | 'en'; statutPresence: 'enLigne' | 'horsLigne'; modeNotification: 'systeme' | 'discret' | 'aucune' };
export type ProfilePatch = Partial<Pick<Profile, 'alias' | 'avatar' | 'theme' | 'langue' | 'modeNotification'>>;
export const getProfile = () => apiFetch<Profile>('/api/config-utilisateur');
export const updateProfile = (patch: ProfilePatch) => apiFetch<Profile>('/api/config-utilisateur', { method: 'PATCH', body: JSON.stringify({ ...patch, ...(patch.avatar === null ? { avatar: '' } : {}) }) });
export const updatePresence = (statut: Profile['statutPresence']) => apiFetch<Profile>('/api/config-utilisateur/presence', { method: 'PUT', body: JSON.stringify({ statut }) });
