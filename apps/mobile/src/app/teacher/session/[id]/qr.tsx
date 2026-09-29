import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { errorMessage } from '@/api/errors';
import { sessionsApi } from '@/api/endpoints';
import { SessionQR } from '@/components/SessionQR';
import { AppText, Banner, Button, Row, Stat } from '@/components/ui';
import { useLiveRecords } from '@/features/attendance/useLiveRecords';
import { useRotatingQr } from '@/features/attendance/useRotatingQr';
import { useScreenAwake } from '@/features/attendance/useScreenAwake';
import { confirm, notify } from '@/lib/confirm';
import { formatTime } from '@/lib/format';
import { colors, spacing } from '@/theme';

/** Full-screen classroom display: rotating QR, countdown and live counts. */
export default function SessionQrScreen() {
  useScreenAwake();
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const session = useQuery({ queryKey: ['session', id], queryFn: () => sessionsApi.get(id) });
  const isActive = session.data?.status === 'ACTIVE';
  const qr = useRotatingQr(id, isActive);
  const live = useLiveRecords(id, isActive ? 3_000 : false);
  const [clock, setClock] = useState(() => new Date().toISOString());

  // The session may be ended or locked from another screen or device: when the QR endpoint
  // or the roster poll says so, reload it so this screen stops showing "Attendance Active".
  const { refetch: refetchSession } = session;
  const closedElsewhere =
    qr.error?.code === 'SESSION_NOT_ACTIVE' ||
    (live.data !== null && live.data.session.status !== 'ACTIVE');
  useEffect(() => {
    if (isActive && closedElsewhere) void refetchSession();
  }, [isActive, closedElsewhere, refetchSession]);

  useEffect(() => {
    const t = setInterval(() => setClock(new Date().toISOString()), 15_000);
    return () => clearInterval(t);
  }, []);

  const end = useMutation({
    mutationFn: () => sessionsApi.end(id),
    onSuccess: ({ absentMarked }) => {
      void qc.invalidateQueries({ queryKey: ['sessions'] });
      void qc.invalidateQueries({ queryKey: ['session', id] });
      void qc.invalidateQueries({ queryKey: ['today'] });
      router.replace({ pathname: '/teacher/session/[id]', params: { id } });
      if (absentMarked > 0) notify('Attendance ended', `${absentMarked} student(s) marked absent.`);
    },
    onError: (err) => notify("Couldn't end attendance", errorMessage(err)),
  });

  const counts = live.data?.counts;
  const enrolled = live.data?.enrolledCount ?? session.data?.enrolledCount ?? 0;
  const checkedIn = counts ? counts.PRESENT + counts.LATE + counts.EXCUSED + counts.ABSENT : 0;

  async function onEnd() {
    const pending = Math.max(0, enrolled - checkedIn);
    const message =
      pending > 0
        ? `${pending} student(s) haven't checked in and will be marked absent. You can correct records afterwards.`
        : 'Everyone has a record. Students can no longer check in.';
    if (await confirm('End attendance?', message, 'End attendance', true)) end.mutate();
  }

  const s = session.data;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
      <View style={{ flex: 1, padding: spacing.lg, gap: spacing.md, alignItems: 'center' }}>
        <View style={{ alignItems: 'center', gap: 2 }}>
          <AppText variant="title" style={{ textAlign: 'center' }}>
            {s?.class.subject.subjectName ?? 'Attendance'}
          </AppText>
          <AppText variant="muted">
            {s ? `${s.class.classCode} · ${s.class.sectionName}` : ''}
          </AppText>
          <Row style={{ gap: spacing.sm }}>
            <AppText
              style={{ color: isActive ? colors.success : colors.textMuted, fontWeight: '700' }}
            >
              {isActive ? '● Attendance Active' : s ? 'Attendance closed' : 'Loading…'}
            </AppText>
            <AppText variant="muted">{formatTime(clock)}</AppText>
          </Row>
        </View>

        {session.isError ? <Banner tone="danger" message={errorMessage(session.error)} /> : null}
        {qr.error && qr.error.code !== 'SESSION_NOT_ACTIVE' && !qr.token ? (
          <Banner tone="warning" message={errorMessage(qr.error)} />
        ) : null}

        {isActive ? <SessionQR token={qr.token} /> : null}

        {isActive ? (
          <AppText variant="subtitle" accessibilityLiveRegion="polite">
            {qr.token
              ? `Refreshes in ${String(qr.secondsLeft).padStart(2, '0')} seconds`
              : 'Getting a fresh code…'}
          </AppText>
        ) : null}

        <Row style={{ alignSelf: 'stretch' }}>
          <Stat label="Present" value={counts?.PRESENT ?? 0} tone={colors.success} />
          <Stat label="Late" value={counts?.LATE ?? 0} tone={colors.warning} />
          <Stat label="Enrolled" value={enrolled} />
        </Row>

        <View style={{ flex: 1 }} />
        <Row style={{ alignSelf: 'stretch' }}>
          <Button
            title="View list"
            variant="secondary"
            icon="list-outline"
            style={{ flex: 1 }}
            onPress={() => router.push({ pathname: '/teacher/session/[id]', params: { id } })}
          />
          {isActive ? (
            <Button
              title="End Attendance"
              variant="danger"
              style={{ flex: 1 }}
              loading={end.isPending}
              onPress={onEnd}
            />
          ) : (
            <Button
              title="Close"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => router.back()}
            />
          )}
        </Row>
        {isActive ? (
          <Button title="Minimise (keep running)" variant="ghost" onPress={() => router.back()} />
        ) : null}
      </View>
    </SafeAreaView>
  );
}
