import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, spacing } from '@/theme';

import { AppText } from './ui';

export interface SnackOptions {
  message: string;
  /** Label of the single action, e.g. "Undo". */
  actionLabel?: string;
  onAction?: () => void;
}

const SNACK_MS = 5_000;
const SnackContext = createContext<(options: SnackOptions) => void>(() => undefined);

/** `const snack = useSnackbar(); snack({ message: 'Saved', actionLabel: 'Undo', onAction })` */
export function useSnackbar() {
  return useContext(SnackContext);
}

/** Mount once near the root. One message at a time; a new one replaces the old. */
export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [snack, setSnack] = useState<SnackOptions | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { bottom } = useSafeAreaInsets();

  const show = useCallback((options: SnackOptions) => {
    clearTimeout(timer.current);
    setSnack(options);
    timer.current = setTimeout(() => setSnack(null), SNACK_MS);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <SnackContext.Provider value={show}>
      {children}
      {snack ? (
        <View
          style={[styles.snack, { bottom: Math.max(bottom, spacing.md) + 96 }]}
          accessibilityLiveRegion="polite"
        >
          <AppText style={styles.message}>{snack.message}</AppText>
          {snack.actionLabel ? (
            <Pressable
              accessibilityRole="button"
              style={styles.action}
              onPress={() => {
                clearTimeout(timer.current);
                setSnack(null);
                snack.onAction?.();
              }}
            >
              <AppText style={styles.actionText}>{snack.actionLabel}</AppText>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </SnackContext.Provider>
  );
}

const styles = StyleSheet.create({
  snack: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
    gap: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.text,
    shadowColor: colors.black,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  message: { flex: 1, color: colors.white },
  action: { minHeight: 48, minWidth: 64, paddingHorizontal: spacing.md, justifyContent: 'center' },
  actionText: { color: colors.sky, fontWeight: '700' },
});
