import { Ionicons } from '@expo/vector-icons';
import type { CheckInResultDto } from '@kavriel/shared';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Modal,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { copy } from '@/copy';
import { formatTime } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';

import { StatusBadge } from './common';
import { AppText, Button } from './ui';

/** What the sheet can show. It never shows success unless the server confirmed it. */
export type ScanSheetState =
  /** The scan was read and the request is on its way. Nothing is saved yet. */
  | { kind: 'sending' }
  /** The connection dropped; asking the server whether the check-in went through. */
  | { kind: 'checking' }
  | { kind: 'success'; result: CheckInResultDto; reconciled: boolean }
  | { kind: 'error'; title: string; message: string };

/** After this long without an answer, say so instead of looking frozen. */
export const SLOW_AFTER_MS = 8_000;

type IconName = ComponentProps<typeof Ionicons>['name'];

const TONES = {
  info: colors.primaryDark,
  success: colors.presentFg,
  danger: colors.absentFg,
} as const;

/**
 * Bottom sheet over the camera for every step after a scan. Sending and checking block the
 * screen (there is nothing to cancel: the request may already be at the server), success and
 * error each have one clear button.
 */
export function ScanResultSheet({
  state,
  onDone,
  onRetry,
}: {
  state: ScanSheetState | null;
  /** Dismiss after success and go back to scanning. */
  onDone: () => void;
  /** Dismiss after an error and go back to scanning. */
  onRetry: () => void;
}) {
  const { bottom } = useSafeAreaInsets();
  const slow = useSlow(state?.kind === 'sending' || state?.kind === 'checking');

  if (!state) return null;

  const dismiss = state.kind === 'success' ? onDone : state.kind === 'error' ? onRetry : undefined;

  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={dismiss}>
      <View style={styles.scrim}>
        <View
          style={[styles.sheet, { paddingBottom: Math.max(bottom, spacing.lg) + spacing.sm }]}
          accessibilityViewIsModal
        >
          <View style={styles.grab} />
          {state.kind === 'sending' || state.kind === 'checking' ? (
            <Progress checking={state.kind === 'checking'} slow={slow} />
          ) : null}
          {state.kind === 'success' ? <Success state={state} onDone={onDone} /> : null}
          {state.kind === 'error' ? <Failure state={state} onRetry={onRetry} /> : null}
        </View>
      </View>
    </Modal>
  );
}

/** True once `active` has been true for SLOW_AFTER_MS. */
function useSlow(active: boolean) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (!active) return;
    const t = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(t);
  }, [active]);
  return slow;
}

function Header({
  icon,
  tone,
  title,
  text,
  live = 'polite',
  pop = false,
}: {
  icon: IconName | 'spinner';
  tone: keyof typeof TONES;
  title: string;
  text?: string;
  live?: 'polite' | 'assertive';
  pop?: boolean;
}) {
  const scale = useRef(new Animated.Value(pop ? 0.85 : 1)).current;

  useEffect(() => {
    if (!pop) return;
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled || reduce) return scale.setValue(1);
      Animated.spring(scale, {
        toValue: 1,
        friction: 6,
        tension: 120,
        useNativeDriver: true,
      }).start();
    });
    return () => {
      cancelled = true;
    };
  }, [pop, scale]);

  return (
    <View style={styles.headerRow}>
      <Animated.View
        style={[styles.tile, { backgroundColor: TONES[tone], transform: [{ scale }] }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {icon === 'spinner' ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Ionicons name={icon} size={34} color={colors.white} />
        )}
      </Animated.View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="title" accessibilityLiveRegion={live} style={{ lineHeight: 30 }}>
          {title}
        </AppText>
        {text ? <AppText variant="muted">{text}</AppText> : null}
      </View>
    </View>
  );
}

function Progress({ checking, slow }: { checking: boolean; slow: boolean }) {
  const title = checking ? copy.scan.checkingTitle : copy.scan.sendingTitle;
  const text = slow
    ? copy.scan.slowText
    : checking
      ? copy.scan.checkingText
      : copy.scan.sendingText;
  return <Header icon="spinner" tone="info" title={title} text={text} />;
}

function Success({
  state,
  onDone,
}: {
  state: Extract<ScanSheetState, { kind: 'success' }>;
  onDone: () => void;
}) {
  const { result, reconciled } = state;
  const { session, attendance, alreadyRecorded } = result;
  return (
    <>
      <Header
        icon="checkmark"
        tone="success"
        title={copy.scan.successTitle}
        text={reconciled ? copy.scan.successReconciled : copy.scan.successText}
        live="assertive"
        pop
      />
      <View style={styles.details}>
        <Row label="Class">
          <AppText style={styles.value}>
            {session.subjectName} · {session.sectionName}
          </AppText>
        </Row>
        {attendance.checkInTime ? (
          <Row label={alreadyRecorded ? 'Recorded at' : 'Time'}>
            <AppText style={styles.value}>{formatTime(attendance.checkInTime)}</AppText>
          </Row>
        ) : null}
        <Row label="Status">
          <StatusBadge status={attendance.status} />
        </Row>
      </View>
      <Button title="Done" size="lg" onPress={onDone} />
    </>
  );
}

function Failure({
  state,
  onRetry,
}: {
  state: Extract<ScanSheetState, { kind: 'error' }>;
  onRetry: () => void;
}) {
  return (
    <>
      <Header
        icon="close"
        tone="danger"
        title={copy.scan.failureTitle}
        text={state.title}
        live="assertive"
      />
      <AppText>{state.message}</AppText>
      <Button title={copy.scan.scanAgain} icon="scan-outline" size="lg" onPress={onRetry} />
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <AppText variant="muted" style={{ flex: 1 }}>
        {label}
      </AppText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.lg,
  },
  grab: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  tile: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  details: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  value: { flexShrink: 1, textAlign: 'right' },
});
