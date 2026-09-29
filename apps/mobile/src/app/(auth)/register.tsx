import { registerSchema, type Role } from '@kavriel/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';

import { errorMessage, fieldErrors } from '@/api/errors';
import { referenceApi } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthProvider';
import { AppText, Banner, Button, Chips, Screen, TextField } from '@/components/ui';
import { blankToUndefined, validate } from '@/lib/validation';
import { spacing } from '@/theme';

export default function RegisterScreen() {
  const { register } = useAuth();
  const [role, setRole] = useState<Role>('STUDENT');
  const [form, setForm] = useState({
    email: '',
    password: '',
    firstName: '',
    middleName: '',
    lastName: '',
    contactNumber: '',
    studentNumber: '',
    employeeNumber: '',
    teacherCode: '',
  });
  const [yearLevelId, setYearLevelId] = useState<string | undefined>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const yearLevels = useQuery({ queryKey: ['yearLevels'], queryFn: referenceApi.yearLevels });

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function onSubmit() {
    setFormError(null);
    const base = {
      role,
      email: form.email.trim(),
      password: form.password,
      firstName: form.firstName,
      middleName: form.middleName,
      lastName: form.lastName,
      contactNumber: form.contactNumber,
    };
    const values =
      role === 'STUDENT'
        ? {
            ...base,
            studentNumber: form.studentNumber,
            yearLevelId: yearLevelId ? Number(yearLevelId) : undefined,
          }
        : { ...base, employeeNumber: form.employeeNumber, teacherCode: form.teacherCode };
    const v = validate(registerSchema, blankToUndefined(values));
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setBusy(true);
    try {
      await register(v.data);
    } catch (err) {
      setErrors(fieldErrors(err));
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
        <AppText variant="title" style={{ marginTop: spacing.lg }}>
          Create your account
        </AppText>
        <Chips
          options={[
            { value: 'STUDENT', label: "I'm a student" },
            { value: 'TEACHER', label: "I'm a teacher" },
          ]}
          value={role}
          onChange={setRole}
        />
        {formError ? <Banner tone="danger" message={formError} /> : null}

        <TextField
          label="First name"
          value={form.firstName}
          onChangeText={set('firstName')}
          error={errors.firstName}
          autoComplete="given-name"
        />
        <TextField
          label="Middle name (optional)"
          value={form.middleName}
          onChangeText={set('middleName')}
          error={errors.middleName}
        />
        <TextField
          label="Last name"
          value={form.lastName}
          onChangeText={set('lastName')}
          error={errors.lastName}
          autoComplete="family-name"
        />

        {role === 'STUDENT' ? (
          <>
            <TextField
              label="Student number"
              value={form.studentNumber}
              onChangeText={set('studentNumber')}
              error={errors.studentNumber}
              autoCapitalize="characters"
            />
            {yearLevels.data?.length ? (
              <>
                <AppText variant="label">Year level (optional)</AppText>
                <Chips
                  options={yearLevels.data.map((y) => ({ value: String(y.id), label: y.name }))}
                  value={yearLevelId}
                  onChange={setYearLevelId}
                />
              </>
            ) : null}
          </>
        ) : (
          <>
            <TextField
              label="Employee number (optional)"
              value={form.employeeNumber}
              onChangeText={set('employeeNumber')}
              error={errors.employeeNumber}
            />
            <TextField
              label="Teacher registration code"
              value={form.teacherCode}
              onChangeText={set('teacherCode')}
              error={errors.teacherCode}
              autoCapitalize="none"
              secureTextEntry
            />
            <AppText variant="small">Ask your school for the teacher registration code.</AppText>
          </>
        )}

        <TextField
          label="Contact number (optional)"
          value={form.contactNumber}
          onChangeText={set('contactNumber')}
          error={errors.contactNumber}
          keyboardType="phone-pad"
        />
        <TextField
          label="Email"
          value={form.email}
          onChangeText={set('email')}
          error={errors.email}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <TextField
          label="Password (at least 8 characters)"
          value={form.password}
          onChangeText={set('password')}
          error={errors.password}
          secureTextEntry
          autoComplete="new-password"
        />

        <AppText variant="small">
          Kavriel stores your name, school number, email and attendance records to run class
          attendance for your school. Only your teachers (and you) can see your attendance.
        </AppText>

        <Button title="Create account" onPress={onSubmit} loading={busy} />
        <Button
          title="I already have an account"
          variant="ghost"
          onPress={() => router.replace('/login')}
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}
