import * as SecureStore from 'expo-secure-store';
import { ApiError } from '@/services/ApiError';
import { isSession, type AuthResult } from '@/services/authService';
import { getTranslations } from '@/i18n';

const KEY = 'chatvardage.session.v1';
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export const storage = {
  async save(session: AuthResult): Promise<void> {
    try {
      await SecureStore.setItemAsync(
        KEY,
        JSON.stringify({
          jeton: session.jeton,
          refresh_token: session.refresh_token,
          utilisateur: {
            id: session.utilisateur.id,
            pseudo: session.utilisateur.pseudo,
            courriel: session.utilisateur.courriel,
            role: session.utilisateur.role,
          },
        }),
        options,
      );
    } catch {
      throw new ApiError('storage', getTranslations().errors.saveSession);
    }
  },
  async load(): Promise<AuthResult | null> {
    let raw: string | null;
    try {
      raw = await SecureStore.getItemAsync(KEY, options);
    } catch {
      throw new ApiError('storage', getTranslations().errors.loadSession);
    }
    if (raw === null) return null;
    try {
      const value: unknown = JSON.parse(raw);
      if (isSession(value)) return value;
    } catch {
      /* Corrupted data is removed, never trusted. */
    }
    await storage.clear();
    return null;
  },
  async clear(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(KEY, options);
    } catch {
      throw new ApiError('storage', getTranslations().errors.clearSession);
    }
  },
};
