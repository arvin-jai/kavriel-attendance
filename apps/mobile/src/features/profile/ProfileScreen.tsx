import { changePasswordSchema } from '@kavriel/shared';
import { useMutation } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';

import { errorMessage } from '@/api/errors';
import { authApi } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthProvider';
import { AppText, Banner, Button, Card, Screen, Section, TextField } from '@/components/ui';
import { confirm } from '@/lib/confirm';
import { validate } from '@/lib/validation';

/** Profile for both roles: details, contact correction, password change, sign out. */
export function ProfileScreen() {
  const { user, setUser, logout } = useAuth();
  const [contact, setContact] = useState('');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  useEffect(() => setContact(user?.profile.contactNumber ?? ''), [user]);

  const saveContact = useMutation({
    mutationFn: () => authApi.updateMe({ contactNumber: contact.trim() || null }),
    onSuccess: (u) => {
      setUser(u);
      setMessage({ tone: 'success', text: 'Contact number saved.' });
    },
    onError: (err) => setMessage({ tone: 'danger', text: errorMessage(err) }),
  });

  const changePassword = useMutation({
    mutationFn: async () => {
      const v = validate(changePasswordSchema, { currentPassword: current, newPassword: next });
      if (!v.ok) {
        setPwErrors(v.errors);
        throw new Error('invalid');
      }
      setPwErrors({});
      await authApi.changePassword(current, next);
    },
    onSuccess: () => {
      setCurrent('');
      setNext('');
      setMessage({
        tone: 'success',
        text: 'Password changed. Other devices have been signed out.',
      });
    },
    onError: (err) => {
      if ((err as Error).message !== 'invalid')
        setMessage({ tone: 'danger', text: errorMessage(err) });
    },
  });

  if (!user) return null;
  const p = user.profile;

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Profile' }} />
      {message ? <Banner tone={message.tone} message={message.text} /> : null}

      <Card>
        <AppText variant="title">
          {p.firstName} {p.middleName ? `${p.middleName} ` : ''}
          {p.lastName}
        </AppText>
        <AppText variant="muted">{user.email}</AppText>
        {user.role === 'STUDENT' ? (
          <AppText variant="small">
            Student no. {user.profile.studentNumber}
            {user.profile.yearLevel ? ` · ${user.profile.yearLevel.name}` : ''}
          </AppText>
        ) : (
          <AppText variant="small">
            Teacher
            {user.profile.employeeNumber ? ` · Employee no. ${user.profile.employeeNumber}` : ''}
          </AppText>
        )}
      </Card>

      <Section title="Contact">
        <TextField
          label="Contact number"
          value={contact}
          onChangeText={setContact}
          keyboardType="phone-pad"
        />
        <Button
          title="Save contact number"
          variant="secondary"
          loading={saveContact.isPending}
          onPress={() => saveContact.mutate()}
        />
      </Section>

      <Section title="Change password">
        <TextField
          label="Current password"
          value={current}
          onChangeText={setCurrent}
          secureTextEntry
          error={pwErrors.currentPassword}
        />
        <TextField
          label="New password (at least 8 characters)"
          value={next}
          onChangeText={setNext}
          secureTextEntry
          error={pwErrors.newPassword}
        />
        <Button
          title="Change password"
          variant="secondary"
          loading={changePassword.isPending}
          onPress={() => changePassword.mutate()}
        />
      </Section>

      <AppText variant="small">
        To correct your name or school number, contact your school. Your data is used only for class
        attendance.
      </AppText>

      <Button
        title="Sign out"
        variant="danger"
        icon="log-out-outline"
        onPress={async () => {
          if (
            await confirm(
              'Sign out?',
              'You will need to sign in again to record attendance.',
              'Sign out',
            )
          ) {
            await logout();
          }
        }}
      />
    </Screen>
  );
}
