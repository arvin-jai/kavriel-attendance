import { Stack } from 'expo-router';

import { headerOptions } from '@/components/navOptions';
import { colors } from '@/theme';

export default function StudentLayout() {
  return (
    <Stack
      screenOptions={{
        ...headerOptions,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="class/[id]" options={{ title: 'Class' }} />
    </Stack>
  );
}
