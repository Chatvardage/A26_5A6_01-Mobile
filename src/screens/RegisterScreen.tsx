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
import { ThemedText } from '@/components/themed-text';
import { AuthHeader } from '@/components/auth-header';
import { useTheme } from '@/hooks/use-theme';
import { Routes, type RootStackParamList } from '@/navigation/routes';
import { userMessage } from '@/services/ApiError';
import { useSession } from '@/session/SessionContext';
import { useTranslation } from '@/i18n';

export function RegisterScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Register'>) {
  const theme = useTheme();
  const { strings } = useTranslation();
  const { register } = useSession();
  const [pseudo, setPseudo] = useState('');
  const [courriel, setCourriel] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const courrielRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmationRef = useRef<TextInput>(null);
  async function submit() {
    if (submitting) return;
    if (!/^[A-Za-z0-9_-]{3,20}$/.test(pseudo.trim())) {
      setError(strings.auth.register.validation.username);
      return;
    }
    if (courriel.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(courriel.trim())) {
      setError(strings.auth.register.validation.email);
      return;
    }
    if (password.length < 8 || password.length > 128) {
      setError(strings.auth.register.validation.password);
      return;
    }
    if (password !== confirmation) {
      setError(strings.auth.register.validation.confirmation);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await register({ pseudo: pseudo.trim(), courriel: courriel.trim(), mot_de_passe: password });
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setSubmitting(false);
    }
  }
  const input = [styles.input, { color: theme.text, backgroundColor: theme.input }];
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={[styles.form, { backgroundColor: theme.card }]}
          keyboardShouldPersistTaps="handled"
        >
          <AuthHeader title={strings.auth.register.title} subtitle={strings.auth.register.subtitle} />
          <ThemedText type="smallBold" themeColor="textSecondary">
            {strings.auth.register.usernameLabel}
          </ThemedText>
          <TextInput
            accessibilityLabel={strings.auth.register.username}
            returnKeyType="next"
            onSubmitEditing={() => courrielRef.current?.focus()}
            placeholder={strings.auth.register.username}
            placeholderTextColor={theme.textSecondary}
            value={pseudo}
            onChangeText={setPseudo}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={20}
            editable={!submitting}
            style={input}
          />
          <ThemedText type="smallBold" themeColor="textSecondary">
            {strings.auth.register.emailLabel}
          </ThemedText>
          <TextInput
            accessibilityLabel={strings.auth.register.email}
            ref={courrielRef}
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            placeholder={strings.auth.register.email}
            placeholderTextColor={theme.textSecondary}
            value={courriel}
            onChangeText={setCourriel}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            maxLength={254}
            editable={!submitting}
            style={input}
          />
          <ThemedText type="smallBold" themeColor="textSecondary">
            {strings.auth.register.passwordLabel}
          </ThemedText>
          <TextInput
            accessibilityLabel={strings.auth.register.password}
            ref={passwordRef}
            returnKeyType="next"
            onSubmitEditing={() => confirmationRef.current?.focus()}
            placeholder={strings.auth.register.password}
            placeholderTextColor={theme.textSecondary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            maxLength={128}
            editable={!submitting}
            style={input}
          />
          <ThemedText type="smallBold" themeColor="textSecondary">
            {strings.auth.register.confirmPasswordLabel}
          </ThemedText>
          <TextInput
            accessibilityLabel={strings.auth.register.confirmPassword}
            ref={confirmationRef}
            returnKeyType="go"
            placeholder={strings.auth.register.confirmPassword}
            placeholderTextColor={theme.textSecondary}
            value={confirmation}
            onChangeText={setConfirmation}
            secureTextEntry
            autoCapitalize="none"
            maxLength={128}
            editable={!submitting}
            onSubmitEditing={submit}
            style={input}
          />
          {error ? (
            <ThemedText accessibilityRole="alert" style={{ color: theme.danger }}>
              {error}
            </ThemedText>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={submitting ? strings.accessibility.signingUp : strings.auth.register.submit}
            accessibilityState={{ disabled: submitting, busy: submitting }}
            disabled={submitting}
            onPress={submit}
            style={[styles.button, { backgroundColor: theme.authButton }]}
          >
            {submitting ? (
              <ActivityIndicator accessible={false} importantForAccessibility="no" color="#fff" />
            ) : (
              <ThemedText style={{ color: '#fff' }}>{strings.auth.register.submit}</ThemedText>
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={submitting}
            onPress={() => navigation.navigate(Routes.Login)}
          >
            <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center', marginTop: 8 }}>
              {strings.auth.register.alreadyRegistered}
            </ThemedText>
            <ThemedText
              type="smallBold"
              themeColor="tint"
              style={{ textAlign: 'center', paddingVertical: 8 }}
            >
              {strings.auth.register.backToLogin}
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
    paddingHorizontal: 24,
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
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 8,
  },
  button: {
    borderRadius: 14,
    minHeight: 52,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
});
