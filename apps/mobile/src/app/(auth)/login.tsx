import { loginSchema } from '@kavriel/shared';
import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { errorMessage } from '@/api/errors';
import { useAuth } from '@/auth/AuthProvider';
import { AppText, Banner, Button, Screen, TextField } from '@/components/ui';
import { validate } from '@/lib/validation';
import { colors, fontFamily, spacing } from '@/theme';

export default function LoginScreen() {
  const { login, notice, clearNotice } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    clearNotice();
    setFormError(null);
    const v = validate(loginSchema, { email: email.trim(), password });
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setBusy(true);
    try {
      await login(v.data);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen edges={['top', 'bottom']}>
        <View style={{ gap: spacing.xs, marginTop: spacing.xxl }}>
          <AppText variant="hero" style={{ color: colors.primary }}>
            Kavriel
          </AppText>
          <AppText variant="muted">QR attendance for teachers and students</AppText>
        </View>

        {notice ? <Banner tone="warning" message={notice} /> : null}
        {formError ? <Banner tone="danger" message={formError} /> : null}

        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          error={errors.email}
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
          textContentType="password"
          error={errors.password}
          onSubmitEditing={onSubmit}
        />
        <Button title="Sign in" size="lg" onPress={onSubmit} loading={busy} />

        <View style={{ alignItems: 'center', gap: spacing.sm }}>
          <AppText variant="muted">New to Kavriel?</AppText>
          <Link
            href="/register"
            style={{ color: colors.primaryDark, fontFamily: fontFamily.bold, padding: spacing.sm }}
          >
            Create an account
          </Link>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
