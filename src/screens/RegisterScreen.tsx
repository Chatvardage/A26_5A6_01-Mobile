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

export function RegisterScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Register'>) {
  const theme = useTheme();
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
      setError('Pseudo : 3 à 20 lettres, chiffres, _ ou -.');
      return;
    }
    if (courriel.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(courriel.trim())) {
      setError('Adresse courriel invalide.');
      return;
    }
    if (password.length < 8 || password.length > 128) {
      setError('Mot de passe : 8 à 128 caractères.');
      return;
    }
    if (password !== confirmation) {
      setError('Les mots de passe ne correspondent pas.');
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
  const input = [styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }];
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <AuthHeader title="Crée ton compte" subtitle="Tes amis, tes serveurs, tes conversations." />
          <ThemedText type="smallBold" themeColor="textSecondary">
            PSEUDO
          </ThemedText>
          <TextInput
            accessibilityLabel="Pseudo"
            returnKeyType="next"
            onSubmitEditing={() => courrielRef.current?.focus()}
            placeholder="Pseudo"
            value={pseudo}
            onChangeText={setPseudo}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={20}
            editable={!submitting}
            style={input}
          />
          <ThemedText type="smallBold" themeColor="textSecondary">
            COURRIEL
          </ThemedText>
          <TextInput
            accessibilityLabel="Courriel"
            ref={courrielRef}
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            placeholder="Courriel"
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
            MOT DE PASSE
          </ThemedText>
          <TextInput
            accessibilityLabel="Mot de passe"
            ref={passwordRef}
            returnKeyType="next"
            onSubmitEditing={() => confirmationRef.current?.focus()}
            placeholder="Mot de passe"
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
            CONFIRMER LE MOT DE PASSE
          </ThemedText>
          <TextInput
            accessibilityLabel="Confirmation du mot de passe"
            ref={confirmationRef}
            returnKeyType="go"
            placeholder="Confirmation du mot de passe"
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
            accessibilityLabel="S’inscrire"
            disabled={submitting}
            onPress={submit}
            style={[styles.button, { backgroundColor: theme.tint }]}
          >
            {submitting ? (
              <ActivityIndicator accessibilityLabel="Inscription en cours" color="#fff" />
            ) : (
              <ThemedText style={{ color: '#fff' }}>S’inscrire</ThemedText>
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={submitting}
            onPress={() => navigation.navigate(Routes.Login)}
          >
            <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center', marginTop: 8 }}>
              Déjà un compte ?
            </ThemedText>
            <ThemedText
              type="smallBold"
              themeColor="tint"
              style={{ textAlign: 'center', paddingVertical: 8 }}
            >
              Retour à la connexion
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
    gap: 10,
    paddingHorizontal: 24,
    paddingVertical: 32,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  input: {
    borderRadius: 6,
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 8,
  },
  button: {
    borderRadius: 6,
    minHeight: 52,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
});
