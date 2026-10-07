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
  header: { alignItems: 'center', marginBottom: 16 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 32 },
  logo: { width: 44, height: 44 },
  brandName: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  title: { fontSize: 28, lineHeight: 36, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
});
