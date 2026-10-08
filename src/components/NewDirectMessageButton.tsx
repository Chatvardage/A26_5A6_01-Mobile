import { Pressable, StyleSheet, View } from 'react-native';

import { useTranslation } from '@/i18n';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function NewDirectMessageButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  const { strings } = useTranslation();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={strings.directMessage.button}
      accessibilityHint={strings.directMessage.chooseRecipient}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
      ]}
    >
      <View style={styles.icon} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={[styles.horizontal, { backgroundColor: theme.tint }]} />
        <View style={[styles.vertical, { backgroundColor: theme.tint }]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    margin: Spacing.three,
    minHeight: Spacing.six,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  horizontal: { position: 'absolute', width: 24, height: 3, borderRadius: 2 },
  vertical: { position: 'absolute', width: 3, height: 24, borderRadius: 2 },
});
