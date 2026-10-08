import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useTheme } from '@/hooks/use-theme';
import { useTranslation } from '@/i18n';
export function UserAvatar({ avatar, name, online = false, size = 36 }: { avatar?: string | null; name: string; online?: boolean; size?: number }) {
  const theme = useTheme();
  const { strings } = useTranslation();
  const [failed, setFailed] = useState<string | null>(null);
  return <View accessibilityLabel={`${name}, ${online ? strings.control.online : strings.control.offline}`} style={{ width: size, height: size }}>
    {avatar && avatar !== failed ? <Image accessibilityLabel={name} source={{ uri: avatar }} onError={() => setFailed(avatar)} style={{ width: size, height: size, borderRadius: size / 2 }} /> : <View style={[styles.placeholder, { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.backgroundSelected }]}><SymbolView name={{ ios: 'person.fill', android: 'person', web: 'person' }} size={size * .6} tintColor={theme.textSecondary} fallback={<Text style={{ color: theme.textSecondary, fontSize: size * .5 }}>{name.charAt(0).toUpperCase()}</Text>} /></View>}
    <View testID="presence-dot" style={[styles.dot, { backgroundColor: online ? '#29bb77' : theme.textSecondary, borderColor: theme.card }]} />
  </View>;
}
const styles = StyleSheet.create({ placeholder: { alignItems: 'center', justifyContent: 'center' }, dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, position: 'absolute', bottom: -1, right: -1 } });
