import { TextInput, type TextInputProps } from 'react-native';
import { useTheme } from '@/hooks/use-theme';

/** Champ de formulaire des écrans de gestion : indication lisible (`textSecondary`) dans les deux thèmes. */
export function ThemedTextInput({ style, ...rest }: TextInputProps) {
  const theme = useTheme();
  return <TextInput placeholderTextColor={theme.textSecondary} style={[{ color: theme.text, padding: 12, borderWidth: 1, borderColor: theme.textSecondary, borderRadius: 12, backgroundColor: theme.backgroundSelected }, style]} {...rest} />;
}
