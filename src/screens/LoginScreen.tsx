import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Routes, type RootStackParamList } from '@/navigation/routes';

import { ThemedText } from '@/components/themed-text';
import { AuthHeader } from '@/components/auth-header';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/services/ApiError';
import { useSession } from '@/session/SessionContext';
import { useTranslation } from '@/i18n';

function loginErrorMessage(error: unknown, messages: ReturnType<typeof useTranslation>['strings']['auth']['login']['errors']): string {
  if (error instanceof ApiError) {
    if (error.kind === 'timeout') return messages.timeout;
    if (error.kind === 'network') return messages.network;
    if (error.kind === 'unauthorized') return messages.unauthorized;
    if (error.status === 429) return messages.rateLimit;
  }
  return messages.generic;
}

export function LoginScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Login'>) {
  const theme = useTheme();
  const { strings } = useTranslation();
  const { signIn } = useSession();
  const [identifiant, setIdentifiant] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);

  const canSubmit = identifiant.trim().length > 0 && motDePasse.length > 0 && !submitting;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await signIn(identifiant.trim(), motDePasse);
      // La navigation bascule d'elle-même vers Main quand la session passe à « signedIn ».
    } catch (e) {
      setError(loginErrorMessage(e, strings.auth.login.errors));
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle = [styles.input, { color: theme.text, backgroundColor: theme.input }];

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={[styles.form, { backgroundColor: theme.card }]}
          keyboardShouldPersistTaps="handled"
        >
          <AuthHeader title={strings.auth.login.title} subtitle={strings.auth.login.subtitle} />
          <ThemedText type="smallBold" themeColor="textSecondary">
            {strings.auth.login.usernameLabel}
          </ThemedText>
          <TextInput
            value={identifiant}
            onChangeText={setIdentifiant}
            placeholder={strings.auth.login.usernamePlaceholder}
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            maxLength={254}
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            accessibilityLabel={strings.auth.login.usernamePlaceholder}
            style={inputStyle}
          />
          <ThemedText type="smallBold" themeColor="textSecondary">
            {strings.auth.login.passwordLabel}
          </ThemedText>
          <TextInput
            ref={passwordRef}
            value={motDePasse}
            onChangeText={setMotDePasse}
            placeholder={strings.auth.login.passwordPlaceholder}
            placeholderTextColor={theme.textSecondary}
            secureTextEntry
            maxLength={128}
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={submit}
            accessibilityLabel={strings.auth.login.passwordPlaceholder}
            style={inputStyle}
          />
          {error ? (
            <ThemedText type="small" style={{ color: theme.danger }} accessibilityRole="alert">
              {error}
            </ThemedText>
          ) : null}
          <Pressable
            onPress={submit}
            disabled={!canSubmit}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: theme.authButton, opacity: !canSubmit ? 0.6 : pressed ? 0.8 : 1 },
            ]}
          >
            {submitting ? (
              <ActivityIndicator accessibilityLabel={strings.accessibility.signingIn} color="#ffffff" />
            ) : (
              <ThemedText type="smallBold" style={styles.buttonText}>
                {strings.auth.login.submit}
              </ThemedText>
            )}
          </Pressable>
          <Pressable
            disabled={submitting}
            accessibilityRole="button"
            onPress={() => navigation.navigate(Routes.Register)}
          >
            <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center', marginTop: 8 }}>
              {strings.auth.login.newUser}
            </ThemedText>
            <ThemedText
              type="smallBold"
              themeColor="tint"
              style={{ textAlign: 'center', paddingVertical: 8 }}
            >
              {strings.auth.login.createAccount}
            </ThemedText>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  form: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 28,
    paddingVertical: 32,
    width: '100%',
    maxWidth: 700,
    alignSelf: 'center',
    borderRadius: 20,
    marginVertical: 24,
  },
  input: {
    borderRadius: 14,
    minHeight: 52,
    paddingHorizontal: Spacing.three,
    paddingVertical: 14,
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 8,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    borderRadius: 14,
    paddingVertical: Spacing.three,
    marginTop: 8,
  },
  buttonText: { color: '#ffffff' },
});
