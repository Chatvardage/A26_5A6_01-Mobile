import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Routes, type RootStackParamList } from '@/navigation/routes';

/** Bouton d'en-tête de l'onglet Messages privés : ouvre le choix d'un destinataire. */
export function NewDirectMessageButton() {
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <Pressable
      onPress={() => navigation.navigate(Routes.NewDirectMessage)}
      accessibilityRole="button"
      accessibilityLabel="Nouveau message privé"
      hitSlop={8}
      style={({ pressed }) => [styles.button, { opacity: pressed ? 0.6 : 1 }]}
    >
      <ThemedText type="smallBold" style={{ color: theme.tint }}>
        Nouveau
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
});
