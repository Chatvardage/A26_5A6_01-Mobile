import { SymbolView } from 'expo-symbols';
import { Platform, StyleSheet, View } from 'react-native';

/**
 * Loupe : symbole système sur iOS ; sur Android et le web, SF Symbols n'existe pas (le symbole
 * n'afficherait rien), on dessine donc la loupe avec deux vues.
 */
export function SearchIcon({ color, size = 22 }: { color: string; size?: number }) {
  if (Platform.OS === 'ios') return <SymbolView name="magnifyingglass" tintColor={color} size={size} fallback={null} />;

  const ring = Math.round(size * 0.68);
  const stroke = Math.max(2, Math.round(size * 0.1));
  return (
    <View testID="search-icon-fallback" style={{ width: size, height: size }}>
      <View style={[styles.ring, { width: ring, height: ring, borderRadius: ring / 2, borderWidth: stroke, borderColor: color }]} />
      <View
        style={[
          styles.handle,
          { width: Math.round(size * 0.4), height: stroke, backgroundColor: color, right: -Math.round(size * 0.02), bottom: Math.round(size * 0.1) },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { position: 'absolute', left: 0, top: 0 },
  handle: { position: 'absolute', borderRadius: 2, transform: [{ rotate: '45deg' }] },
});
