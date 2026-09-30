/**
 * Student check-in. The app never claims success on its own: "Attendance recorded" is shown
 * only for a 200/201 from the API, or when a follow-up lookup finds the server's record.
 */
import { useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { studentAttendanceApi } from '@/api/endpoints';
import { QRScanner } from '@/components/QRScanner';
import { ScanResultSheet, type ScanSheetState } from '@/components/ScanResultSheet';
import { AppText, Card, Screen } from '@/components/ui';
import { copy } from '@/copy';
import { runCheckIn } from '@/features/attendance/checkInFlow';

type ScanState = { kind: 'scanning'; hint?: string } | ScanSheetState;

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
    setState({ kind: 'sending' });
    try {
      const outcome = await runCheckIn(data, {
        checkIn: (token) => studentAttendanceApi.checkIn(token, Crypto.randomUUID()),
        findRecord: async (sessionId) =>
          (await studentAttendanceApi.my({ sessionId, limit: 1 })).items[0],
        onReconciling: () => setState({ kind: 'checking' }),
      });
      if (outcome.kind === 'success') {
        haptic('success');
        setState({ kind: 'success', result: outcome.result, reconciled: outcome.reconciled });
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
  const backToScanning = () => setState({ kind: 'scanning' });

  return (
    <Screen>
      {focused ? <QRScanner onScan={onScan} paused={!scanning} /> : null}

      {state.kind === 'scanning' ? (
        <Card>
          <AppText variant="subtitle">Scanning…</AppText>
          <AppText variant="muted" accessibilityLiveRegion="polite">
            {state.hint ?? copy.scan.hint}
          </AppText>
        </Card>
      ) : null}

      <ScanResultSheet
        state={state.kind === 'scanning' ? null : state}
        onDone={backToScanning}
        onRetry={backToScanning}
      />
    </Screen>
  );
}
