import { Redirect } from 'expo-router';

import { useAuth } from '@/auth/AuthProvider';

/** Entry point: send each user to their role's home. */
export default function Index() {
  const { status, user } = useAuth();
  if (status !== 'signedIn' || !user) return <Redirect href="/login" />;
  return <Redirect href={user.role === 'TEACHER' ? '/teacher' : '/student'} />;
}
