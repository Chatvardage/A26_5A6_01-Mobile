import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTranslation } from '@/i18n';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { UserChoice } from '@/services/usersService';

/** `alias` : nom d'affichage choisi dans le profil, montré à la place du pseudo (qui reste en second). */
type Props = { user: UserChoice; alias?: string | null; hasConversation: boolean; onPress: (user: UserChoice) => void };

function UserChoiceItemBase({ user, alias, hasConversation, onPress }: Props) {
  const theme = useTheme();
  const { strings } = useTranslation();
  const t = strings.directMessage;
  const action = hasConversation ? t.open : t.new;
  const name = alias || user.pseudo;
  return (
    <Pressable
      onPress={() => onPress(user)}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${hasConversation ? t.openConversation : t.newConversation}`}
      android_ripple={{ color: theme.backgroundSelected }}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.backgroundSelected }]}
    >
      <View style={[styles.avatar, { backgroundColor: theme.tint }]}>
        <ThemedText type="smallBold" style={styles.avatarText}>
          {name.slice(0, 1).toUpperCase()}
        </ThemedText>
      </View>
      <View style={styles.name}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {name}
        </ThemedText>
        {alias ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            @{user.pseudo}
          </ThemedText>
        ) : null}
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {action}
      </ThemedText>
    </Pressable>
  );
}

export const UserChoiceItem = memo(UserChoiceItemBase);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#ffffff' },
  name: { flex: 1 },
});
