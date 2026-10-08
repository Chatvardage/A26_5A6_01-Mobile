import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

/** « Hors ligne » seulement quand le système le dit : un état inconnu (`null`) reste considéré en ligne. */
export function isOnline(state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

/** Notifie l'état réseau courant puis chaque changement ; retourne la fonction de désabonnement. */
export function subscribeToNetwork(listener: (online: boolean) => void): () => void {
  return NetInfo.addEventListener((state) => listener(isOnline(state)));
}
