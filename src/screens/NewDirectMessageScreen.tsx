import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback } from 'react';
import { FlatList, StyleSheet, TextInput } from 'react-native';

import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { UserChoiceItem } from '@/components/UserChoiceItem';
import { Spacing } from '@/constants/theme';
import { useNewDirectMessage } from '@/hooks/useNewDirectMessage';
import { useTheme } from '@/hooks/use-theme';
import { Routes, type RootStackParamList } from '@/navigation/routes';
import { SEARCH_MAX_LENGTH, type UserChoice } from '@/services/usersService';
import { useSession } from '@/session/SessionContext';
import { toConversationId } from '@/types/conversationId';

type Props = NativeStackScreenProps<RootStackParamList, 'NewDirectMessage'>;

/** Choix du destinataire d'un message privé, y compris une personne à qui on n'a jamais écrit. */
export function NewDirectMessageScreen({ navigation }: Props) {
  const theme = useTheme();
  const { user } = useSession();
  const { query, setQuery, searching, search, retrySearch, suggestions, retrySuggestions, hasConversationWith } =
    useNewDirectMessage(user?.id ?? '');

  // La conversation n'existe côté serveur qu'au premier message : on ouvre simplement `dm:<id>`.
  const open = useCallback(
    (choice: UserChoice) =>
      navigation.replace(Routes.Conversation, {
        conversationId: toConversationId({ kind: 'dm', targetId: choice.id }),
        title: choice.pseudo,
      }),
    [navigation],
  );

  const list = (title: string, users: UserChoice[]) => (
    <FlatList
      data={users}
      keyExtractor={(item) => item.id}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <ThemedText type="small" themeColor="textSecondary" style={styles.section}>
          {title}
        </ThemedText>
      }
      renderItem={({ item }) => (
        <UserChoiceItem user={item} hasConversation={hasConversationWith(item.id)} onPress={open} />
      )}
    />
  );

  let body;
  if (searching) {
    if (search.status === 'error') body = <ErrorState message={search.message} onRetry={retrySearch} />;
    else if (search.status !== 'ready') body = <LoadingState label="Recherche…" />;
    else if (search.users.length === 0) {
      body = <EmptyState title="Aucun utilisateur trouvé" hint="Vérifiez le début du pseudo." />;
    } else body = list('Résultats', search.users);
  } else if (suggestions.status === 'loading') body = <LoadingState label="Chargement des suggestions…" />;
  else if (suggestions.status === 'error') body = <ErrorState message={suggestions.message} onRetry={retrySuggestions} />;
  else if (suggestions.status === 'empty') {
    body = <EmptyState title="Aucune suggestion" hint="Tapez le début d'un pseudo pour trouver quelqu'un." />;
  } else body = list('Suggestions', suggestions.data);

  return (
    <ThemedView style={styles.fill}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Rechercher un pseudo"
        placeholderTextColor={theme.textSecondary}
        maxLength={SEARCH_MAX_LENGTH}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
        accessibilityLabel="Rechercher un pseudo"
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
      />
      {body}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  input: { margin: Spacing.three, borderRadius: 10, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2, fontSize: 16 },
  section: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.one },
});
