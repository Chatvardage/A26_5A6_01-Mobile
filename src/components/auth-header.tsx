import { Image, StyleSheet, View } from 'react-native';
import { ThemedText } from './themed-text';
import { useTranslation } from '@/i18n';

export function AuthHeader({ title, subtitle }: { title: string; subtitle: string }) {
  const { strings } = useTranslation();
  return (
    <View style={styles.header}>
      <View style={styles.brand}>
        <Image
          source={require('../../assets/images/chatvardage-logo.png')}
          style={styles.logo}
          accessibilityLabel={strings.accessibility.logo}
        />
        <ThemedText style={styles.brandName}>{strings.brand}</ThemedText>
      </View>
      <ThemedText accessibilityRole="header" style={styles.title}>
        {title}
      </ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.subtitle}>
        {subtitle}
      </ThemedText>
    </View>
  );
}
const styles = StyleSheet.create({
  header: { alignItems: 'center', marginBottom: 8 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 26 },
  logo: { width: 58, height: 58, borderRadius: 18 },
  brandName: { fontSize: 32, fontWeight: '800', letterSpacing: 0.5 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '800', textAlign: 'center', marginBottom: 6 },
  subtitle: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
