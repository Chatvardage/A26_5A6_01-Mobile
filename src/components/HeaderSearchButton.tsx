import { Pressable } from 'react-native';

import { SearchIcon } from '@/components/SearchIcon';
import { useTheme } from '@/hooks/use-theme';

/** Loupe de l'en-tête d'un écran (ouvre ou ferme sa recherche). */
export function HeaderSearchButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      hitSlop={8}
      onPress={onPress}
      style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}
    >
      <SearchIcon color={active ? theme.accent : theme.primary} size={22} />
    </Pressable>
  );
}
