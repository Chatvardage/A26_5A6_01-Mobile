import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { SymbolView } from 'expo-symbols';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { useTranslation } from '@/i18n';
import { Routes, type MainTabParamList } from '@/navigation/routes';

type Props = BottomTabScreenProps<MainTabParamList, 'Rooms'>;
const destinations = [
  { route: Routes.Servers, label: 'servers', description: 'serversDescription', icon: { ios: 'server.rack', android: 'dns', web: 'dns' }, fallback: '#' },
  { route: Routes.DirectMessages, label: 'directMessages', description: 'messagesDescription', icon: { ios: 'bubble.left.and.bubble.right', android: 'chat', web: 'chat' }, fallback: '\u2709' },
  { route: Routes.Search, label: 'search', description: 'searchDescription', icon: { ios: 'magnifyingglass', android: 'search', web: 'search' }, fallback: '\u2315' },
  { route: Routes.Preferences, label: 'preferences', description: 'settingsDescription', icon: { ios: 'gearshape', android: 'settings', web: 'settings' }, fallback: '\u2699' },
] as const;

/** Accueil avec raccourcis accessibles vers les principales sections. */
export function RoomsScreen({ navigation }: Props) {
  const { strings } = useTranslation();
  const theme = useTheme();
  return (
    <ThemedView style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.hero, { backgroundColor: theme.panel }]}>
          <View style={[styles.brandIcon, { backgroundColor: theme.primary }]}>
            <SymbolView name={{ ios: 'bubble.left.and.bubble.right.fill', android: 'forum', web: 'forum' }} tintColor={theme.onPrimary} size={32} fallback={<Text style={{ color: theme.onPrimary, fontSize: 32 }}>C</Text>} />
          </View>
          <ThemedText type="subtitle">Chatvardage</ThemedText>
          <ThemedText themeColor="textSecondary">{strings.control.homeIntro}</ThemedText>
        </View>
        <View style={styles.grid}>
          {destinations.map(item => (
            <Pressable key={item.route} accessibilityRole="button" accessibilityLabel={strings.navigation[item.label]} onPress={() => navigation.navigate(item.route)} style={({ pressed }) => [styles.card, { backgroundColor: pressed ? theme.backgroundSelected : theme.card, borderColor: theme.textSecondary + '30' }]}>
              <View style={[styles.icon, { backgroundColor: theme.background }]}>
                <SymbolView name={item.icon} tintColor={theme.accent} size={28} fallback={<Text style={{ color: theme.accent, fontSize: 28 }}>{item.fallback}</Text>} />
              </View>
              <ThemedText style={styles.cardTitle}>{strings.navigation[item.label]}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{strings.control[item.description]}</ThemedText>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </ThemedView>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 20, gap: 24, maxWidth: 700, width: '100%', alignSelf: 'center' },
  hero: { padding: 24, borderRadius: 24, gap: 10 },
  brandIcon: { width: 60, height: 60, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { flexGrow: 1, flexBasis: '45%', minWidth: 140, padding: 18, borderRadius: 20, borderWidth: 1, gap: 10 },
  icon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 18, fontWeight: '700' },
});
