import { Stack } from 'expo-router';

import { headerOptions } from '@/components/navOptions';
import { colors } from '@/theme';

export default function TeacherLayout() {
  return (
    <Stack
      screenOptions={{
        ...headerOptions,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      {/* Titles shown until a screen sets its own (avoids the raw route name flashing). */}
      <Stack.Screen name="session/[id]/index" options={{ title: 'Session' }} />
      <Stack.Screen name="class/[id]/index" options={{ title: 'Class' }} />
      <Stack.Screen name="class/[id]/students" options={{ title: 'Students' }} />
      <Stack.Screen name="subject/[id]" options={{ title: 'Subject' }} />
      <Stack.Screen
        name="session/[id]/qr"
        options={{ headerShown: false, presentation: 'fullScreenModal' }}
      />
    </Stack>
  );
}
