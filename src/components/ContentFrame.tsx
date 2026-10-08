import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MaxContentWidth } from '@/constants/theme';

type Props = {
  children: ReactNode;
  /**
   * Marges latérales de la zone sûre (encoche, coins arrondis) : indispensables en paysage. À désactiver
   * quand un parent (`SafeAreaView`) les applique déjà.
   */
  insets?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Cadre commun des écrans : occupe toute la hauteur, respecte les marges latérales de la zone sûre et
 * limite la largeur du contenu (centré) sur les grands écrans ou en paysage, pour garder des lignes lisibles.
 */
export function ContentFrame({ children, insets = true, style, testID }: Props) {
  const safe = useSafeAreaInsets();
  return (
    <View
      testID={testID}
      style={[
        styles.frame,
        insets && { paddingLeft: safe.left, paddingRight: safe.right },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
});
