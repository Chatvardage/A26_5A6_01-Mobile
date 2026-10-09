import { NavigationContext } from '@react-navigation/native';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';

/** Comparaison sans casse ni accents (« equipe » trouve « Équipe »). */
export const foldText = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Recherche locale d'une liste par nom (messages privés, serveurs) : la loupe ouvre le champ, le texte filtre
 * les éléments déjà chargés. Fermer la recherche efface le texte ; quitter l'écran (changement d'onglet ou
 * de page) la ferme aussi. Hors navigateur (tests), seule la fermeture manuelle s'applique.
 */
export function useListFilter<T>(items: T[], nameOf: (item: T) => string) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const toggle = useCallback(() => {
    setOpen(current => !current);
    setQuery('');
  }, []);
  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);
  const navigation = useContext(NavigationContext);
  useEffect(() => navigation?.addListener('blur', close), [navigation, close]);
  const filtered = useMemo(() => {
    const term = foldText(query.trim());
    return term ? items.filter(item => foldText(nameOf(item)).includes(term)) : items;
  }, [items, nameOf, query]);
  return { open, toggle, close, query, setQuery, filtered };
}
