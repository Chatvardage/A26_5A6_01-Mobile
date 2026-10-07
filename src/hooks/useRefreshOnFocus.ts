import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef } from 'react';

/** Relance `refresh` quand l'écran reprend le focus (retour d'un onglet ou d'un écran), pas au premier affichage. */
export function useRefreshOnFocus(refresh: () => unknown) {
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      void refresh();
    }, [refresh]),
  );
}
