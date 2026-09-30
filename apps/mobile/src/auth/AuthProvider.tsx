/**
 * Session state for the whole app. On launch it restores the session from the stored refresh
 * token; the role in `user` drives which route group (teacher / student) is shown.
 */
import type { LoginInput, RegisterInput, UserDto } from '@kavriel/shared';
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  refreshSession,
  setDeviceIdProvider,
  setSessionExpiredHandler,
  tokens,
} from '@/api/client';
import { authApi } from '@/api/endpoints';
import {
  hasCompletedOnboarding,
  markOnboardingCompleted,
} from '@/features/onboarding/onboardingStore';
import { deviceInstallId } from '@/lib/deviceId';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthContextValue {
  status: Status;
  user: UserDto | null;
  /** Set when the session ended on its own (expired, disabled), for a one-time notice. */
  notice: string | null;
  /** True until the user finishes (or skips) the first-run walkthrough. */
  onboardingPending: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: UserDto) => void;
  clearNotice: () => void;
  completeOnboarding: () => void;
  replayOnboarding: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

setDeviceIdProvider(deviceInstallId);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUserState] = useState<UserDto | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [onboardingPending, setOnboardingPending] = useState(false);

  const signOutLocally = useCallback(
    async (message?: string) => {
      await tokens.clear();
      queryClient.clear();
      setUserState(null);
      setOnboardingPending(false);
      setStatus('signedOut');
      if (message) setNotice(message);
    },
    [queryClient],
  );

  useEffect(() => {
    setSessionExpiredHandler(() => {
      void signOutLocally('Your session has ended. Please sign in again.');
    });
  }, [signOutLocally]);

  // Restore the session on launch.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (await refreshSession()) {
          const me = await authApi.me();
          const seen = await hasCompletedOnboarding(me.id);
          if (!cancelled) {
            setOnboardingPending(!seen);
            setUserState(me);
            setStatus('signedIn');
          }
          return;
        }
      } catch {
        // Unreachable server: fall through to the sign-in screen; the token stays stored.
      }
      if (!cancelled) setStatus('signedOut');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      notice,
      onboardingPending,
      async login(input) {
        const result = await authApi.login(input);
        await tokens.set(result);
        // An existing account on a fresh install has no flag yet, so it sees the walkthrough too.
        setOnboardingPending(!(await hasCompletedOnboarding(result.user.id)));
        setUserState(result.user);
        setNotice(null);
        setStatus('signedIn');
      },
      async register(input) {
        const result = await authApi.register(input);
        await tokens.set(result);
        setOnboardingPending(true); // brand-new account: always show the walkthrough
        setUserState(result.user);
        setNotice(null);
        setStatus('signedIn');
      },
      async logout() {
        const refreshToken = await tokens.getRefresh();
        try {
          if (refreshToken) await authApi.logout(refreshToken);
        } catch {
          // Best effort: the local sign-out below still happens.
        }
        await signOutLocally();
      },
      setUser: setUserState,
      clearNotice: () => setNotice(null),
      completeOnboarding() {
        setOnboardingPending(false);
        if (user) void markOnboardingCompleted(user.id);
      },
      replayOnboarding: () => setOnboardingPending(true),
    }),
    [status, user, notice, onboardingPending, signOutLocally],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** The signed-in user, narrowed by role. Only use inside the matching route group. */
export function useTeacher() {
  const { user } = useAuth();
  if (user?.role !== 'TEACHER') throw new Error('Not a teacher');
  return user;
}

export function useStudent() {
  const { user } = useAuth();
  if (user?.role !== 'STUDENT') throw new Error('Not a student');
  return user;
}
