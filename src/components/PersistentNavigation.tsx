import { Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from './themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useTranslation } from '@/i18n';
import { unreadLabel } from './UnreadBadge';
import { useUnread } from '@/unread/UnreadContext';
import { Routes, type MainTabParamList } from '@/navigation/routes';
const tabs = [
  { route: Routes.Rooms, label: 'home', icon: { ios: 'house', android: 'home', web: 'home' }, fallback: '\u2302' },
  { route: Routes.DirectMessages, label: 'messages', icon: { ios: 'bubble.left', android: 'chat', web: 'chat' }, fallback: '\u2709' },
  { route: Routes.Servers, label: 'servers', icon: { ios: 'server.rack', android: 'dns', web: 'dns' }, fallback: '#' },
  { route: Routes.Search, label: 'search', icon: { ios: 'magnifyingglass', android: 'search', web: 'search' }, fallback: '\u2315' },
  { route: Routes.Preferences, label: 'preferences', icon: { ios: 'gearshape', android: 'settings', web: 'settings' }, fallback: '\u2699' },
] as const;
/** Navigation commune a tous les ecrans authentifies, y compris les conversations. */
export function PersistentNavigation({ selected, onNavigate }: { selected: keyof MainTabParamList; onNavigate: (tab: keyof MainTabParamList) => void }) {
  const theme = useTheme(); const { strings } = useTranslation(); const inset = useSafeAreaInsets();
  const { dmTotal, roomTotal } = useUnread();
  return <View style={[styles.bar, { backgroundColor: theme.card, borderTopColor: theme.textSecondary + '40', paddingBottom: Math.max(inset.bottom, 8) }]}>
    {tabs.map(tab => {
      const active = tab.route === selected;
      const label = tab.label === 'home' ? strings.control.home : strings.navigation[tab.label];
      const count = tab.route === Routes.DirectMessages ? dmTotal : tab.route === Routes.Servers ? roomTotal : 0;
      return <Pressable key={tab.route} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: active }} onPress={() => onNavigate(tab.route)} style={[styles.tab, { backgroundColor: active ? theme.backgroundSelected : 'transparent' }]}>
        <SymbolView name={tab.icon} size={24} tintColor={active ? theme.accent : theme.textSecondary} fallback={<ThemedText>{tab.fallback}</ThemedText>} />
        <ThemedText style={{ fontSize: 10, lineHeight: 14, fontWeight: active ? '700' : '500' }}>{label}</ThemedText>
        {count > 0 ? <View style={[styles.badge, { backgroundColor: theme.primary }]}><ThemedText style={{ color: theme.onPrimary, fontSize: 10, lineHeight: 14 }}>{unreadLabel(count)}</ThemedText></View> : null}
      </Pressable>;
    })}
  </View>;
}
const styles = StyleSheet.create({ bar: { flexDirection: 'row', paddingHorizontal: 6, paddingTop: 8, borderTopWidth: 1 }, tab: { flex: 1, minHeight: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 4 }, badge: { position: 'absolute', top: 0, right: 2, borderRadius: 8, paddingHorizontal: 4 } });
