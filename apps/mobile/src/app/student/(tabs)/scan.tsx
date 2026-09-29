/**
 * Student check-in. The app never claims success on its own: "Attendance recorded" is shown
 * only for a 200/201 from the API, or when a follow-up lookup finds the server's record.
 */
import type { CheckInResultDto } from '@kavriel/shared';
import { useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Platform, View } from 'react-native';

import { studentAttendanceApi } from '@/api/endpoints';
import { AttendanceBadge } from '@/components/common';
import { QRScanner } from '@/components/QRScanner';
import { AppText, Button, Card, LoadingState, Screen } from '@/components/ui';
import { runCheckIn } from '@/features/attendance/checkInFlow';
import { formatTime } from '@/lib/format';
import { colors, spacing } from '@/theme';

type ScanState =
  | { kind: 'scanning'; hint?: string }
  | { kind: 'validating' }
  | { kind: 'checking' }
  | { kind: 'success'; result: CheckInResultDto }
  | { kind: 'error'; title: string; message: string };

const RETRY_HINT_MS = 1_800;

function haptic(type: 'success' | 'error') {
  if (Platform.OS === 'web') return;
  void Haptics.notificationAsync(
    type === 'success'
      ? Haptics.NotificationFeedbackType.Success
      : Haptics.NotificationFeedbackType.Error,
  );
}

export default function ScanScreen() {
  const qc = useQueryClient();
  const [state, setState] = useState<ScanState>({ kind: 'scanning' });
  const [focused, setFocused] = useState(false);
  const busy = useRef(false);

  // Only run the camera while this tab is visible.
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const resumeWithHint = (hint: string) => {
    setState({ kind: 'scanning', hint });
    setTimeout(
      () => setState((s) => (s.kind === 'scanning' ? { kind: 'scanning' } : s)),
      RETRY_HINT_MS * 2,
    );
  };

  async function onScan(data: string) {
    if (busy.current) return;
    busy.current = true;
    setState({ kind: 'validating' });
    try {
      const outcome = await runCheckIn(data, {
        checkIn: (token) => studentAttendanceApi.checkIn(token, Crypto.randomUUID()),
        findRecord: async (sessionId) =>
          (await studentAttendanceApi.my({ sessionId, limit: 1 })).items[0],
        onReconciling: () => setState({ kind: 'checking' }),
      });
      if (outcome.kind === 'success') {
        haptic('success');
        setState({ kind: 'success', result: outcome.result });
        void qc.invalidateQueries({ queryKey: ['my'] });
      } else if (outcome.kind === 'retry') {
        haptic('error');
        resumeWithHint(outcome.hint);
      } else {
        haptic('error');
        setState({ kind: 'error', title: outcome.title, message: outcome.message });
      }
    } finally {
      busy.current = false;
    }
  }

  const scanning = state.kind === 'scanning';

  return (
    <Screen>
      {focused && (scanning || state.kind === 'validating' || state.kind === 'checking') ? (
        <QRScanner onScan={onScan} paused={!scanning} />
      ) : null}

      {state.kind === 'scanning' ? (
        <Card>
          <AppText variant="subtitle">Scanning…</AppText>
          <AppText variant="muted" accessibilityLiveRegion="polite">
            {state.hint ?? "Point your camera at the QR code on your teacher's screen."}
          </AppText>
        </Card>
      ) : null}

      {state.kind === 'validating' ? <LoadingState label="Validating…" /> : null}
      {state.kind === 'checking' ? (
        <LoadingState label="Connection problem. Checking if you were recorded…" />
      ) : null}

      {state.kind === 'success' ? (
        <Card style={{ borderColor: colors.success, alignItems: 'center', gap: spacing.md }}>
          <AppText
            variant="title"
            style={{ color: colors.success }}
            accessibilityLiveRegion="assertive"
          >
            ✓ Attendance recorded!
          </AppText>
          <AppText variant="subtitle">{state.result.session.subjectName}</AppText>
          <AppText variant="muted">
            {state.result.session.classCode} · {state.result.session.sectionName}
          </AppText>
          <View style={{ alignItems: 'center', gap: spacing.xs }}>
            <AttendanceBadge status={state.result.attendance.status} />
            {state.result.attendance.checkInTime ? (
              <AppText variant="small">
                {state.result.alreadyRecorded ? 'Already recorded at ' : 'Recorded at '}
                {formatTime(state.result.attendance.checkInTime)}
              </AppText>
            ) : null}
          </View>
          <Button title="Done" variant="secondary" onPress={() => setState({ kind: 'scanning' })} />
        </Card>
      ) : null}

      {state.kind === 'error' ? (
        <Card style={{ borderColor: colors.danger, gap: spacing.md }}>
          <AppText
            variant="subtitle"
            style={{ color: colors.danger }}
            accessibilityLiveRegion="assertive"
          >
            {state.title}
          </AppText>
          <AppText>{state.message}</AppText>
          <Button
            title="Scan again"
            icon="scan-outline"
            onPress={() => setState({ kind: 'scanning' })}
          />
        </Card>
      ) : null}
    </Screen>
  );
}
