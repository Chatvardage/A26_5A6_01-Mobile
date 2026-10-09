import { useCallback, useRef, useState } from 'react';

/**
 * Une action à la fois (enregistrer, supprimer, quitter…). Le verrou est une ref lue au moment de l'appel : un état
 * `busy` serait figé dans la fonction d'un dialogue déjà ouvert ou de deux appuis dans la même image, et laisserait
 * passer la seconde action. `busy` sert seulement à l'affichage (boutons désactivés).
 */
export function useBusyAction() {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  /** Faux si une action est déjà en cours : l'appelant abandonne. */
  const start = useCallback(() => {
    if (pending.current) return false;
    pending.current = true;
    setBusy(true);
    return true;
  }, []);
  const finish = useCallback(() => {
    pending.current = false;
    setBusy(false);
  }, []);
  return { busy, start, finish };
}
