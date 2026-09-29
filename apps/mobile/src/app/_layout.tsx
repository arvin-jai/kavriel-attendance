import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ApiError } from '@/api/client';
import { API_ORIGIN } from '@/lib/env';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { NetworkBanner } from '@/components/NetworkBanner';
import { LoadingState } from '@/components/ui';
import { colors } from '@/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Don't hammer the API on 4xx; retry network trouble twice.
      retry: (count, err) =>
        !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
    mutations: { retry: false },
  },
});

// Refetch and poll only while the app is in the foreground.
function useAppFocus() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (state) =>
      focusManager.setFocused(state === 'active'),
    );
    return () => sub.remove();
  }, []);
}

// Wake a sleeping free-tier server as early as possible.
function useWarmUp() {
  useEffect(() => {
    fetch(`${API_ORIGIN}/health`).catch(() => undefined);
  }, []);
}

function RootNavigator() {
  const { status, user } = useAuth();
  if (status === 'loading') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
        <LoadingState label="Starting Kavriel…" />
      </View>
    );
  }
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={status === 'signedOut'}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={user?.role === 'TEACHER'}>
        <Stack.Screen name="teacher" />
      </Stack.Protected>
      <Stack.Protected guard={user?.role === 'STUDENT'}>
        <Stack.Screen name="student" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  useAppFocus();
  useWarmUp();
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="dark" />
          <NetworkBanner />
          <RootNavigator />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
