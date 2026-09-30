import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { errorMessage } from '@/api/errors';
import { sessionsApi } from '@/api/endpoints';
import { SegmentedBar, TimerBar } from '@/components/patterns';
import { SessionQR } from '@/components/SessionQR';
import { AppText, Badge, Banner, Button, Row } from '@/components/ui';
import { useLiveRecords } from '@/features/attendance/useLiveRecords';
import { useRotatingQr } from '@/features/attendance/useRotatingQr';
import { useScreenAwake } from '@/features/attendance/useScreenAwake';
import { copy } from '@/copy';
import { confirm, notify } from '@/lib/confirm';
import { formatTime } from '@/lib/format';
import { colors, font, spacing } from '@/theme';

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
  // Bigger QR: hide the counts and draw the code as wide as the phone, for the back row.
  const [big, setBig] = useState(false);
  const { width } = useWindowDimensions();
  const bigSize = Math.min(width - spacing.lg * 2 - spacing.lg * 2, 420);

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
    const message = pending > 0 ? copy.qr.endPending(pending) : copy.qr.endAll;
    if (await confirm(copy.qr.endTitle, message, 'End attendance', true)) end.mutate();
  }

  const s = session.data;
  const attended = (counts?.PRESENT ?? 0) + (counts?.LATE ?? 0);
  const waiting = Math.max(0, enrolled - checkedIn);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top', 'bottom']}>
      <View style={{ flex: 1, padding: spacing.lg, gap: spacing.md }}>
        <View style={{ gap: 2 }}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <AppText variant="title" style={{ flex: 1 }} numberOfLines={2}>
              {s?.class.subject.subjectName ?? 'Attendance'}
            </AppText>
            <AppText variant="muted">{formatTime(clock)}</AppText>
          </Row>
          <Row style={{ gap: spacing.sm }}>
            <AppText variant="muted">
              {s ? `${s.class.classCode} · ${s.class.sectionName}` : ''}
            </AppText>
            <Badge
              label={isActive ? 'Live' : s ? 'Closed' : 'Loading'}
              fg={isActive ? colors.presentFg : colors.textMuted}
              bg={isActive ? colors.presentBg : colors.border}
              icon={isActive ? 'radio-outline' : undefined}
            />
          </Row>
        </View>

        {session.isError ? <Banner tone="danger" message={errorMessage(session.error)} /> : null}
        {qr.error && qr.error.code !== 'SESSION_NOT_ACTIVE' && !qr.token ? (
          <Banner tone="warning" message={errorMessage(qr.error)} />
        ) : null}

        {big ? (
          <AppText variant="subtitle" accessibilityLiveRegion="polite">
            {attended} of {enrolled} in
          </AppText>
        ) : (
          <View style={{ gap: spacing.sm }} accessible accessibilityLiveRegion="polite">
            <Row style={{ alignItems: 'baseline', gap: spacing.sm }}>
              <AppText
                style={{
                  fontSize: font.time,
                  lineHeight: font.time + 6,
                  fontWeight: '700',
                  color: colors.primaryDark,
                }}
              >
                {attended}
              </AppText>
              <AppText variant="subtitle">of {enrolled} in</AppText>
            </Row>
            <SegmentedBar
              parts={[
                { value: counts?.PRESENT ?? 0, color: colors.presentFg, label: 'present' },
                { value: counts?.LATE ?? 0, color: colors.warning, label: 'late' },
                { value: waiting, color: colors.border, label: 'waiting' },
              ]}
            />
            <Row style={{ gap: spacing.xs, flexWrap: 'wrap' }}>
              <Badge
                label={`${counts?.LATE ?? 0} Late`}
                fg={colors.lateFg}
                bg={colors.lateBg}
                icon="time-outline"
              />
              <Badge
                label={`${waiting} Waiting`}
                fg={colors.textMuted}
                bg={colors.border}
                icon="ellipsis-horizontal"
              />
            </Row>
          </View>
        )}

        {isActive ? (
          <View style={{ alignItems: 'center', gap: spacing.md }}>
            <SessionQR token={qr.token} size={big ? bigSize : undefined} />
            <TimerBar
              secondsLeft={qr.secondsLeft}
              rotationSeconds={qr.rotationSeconds}
              active={!!qr.token}
            />
            <Button
              title={big ? copy.qr.smaller : copy.qr.bigger}
              variant="tonal"
              icon={big ? 'contract-outline' : 'expand-outline'}
              style={{ alignSelf: 'stretch' }}
              onPress={() => setBig((b) => !b)}
            />
          </View>
        ) : null}

        <View style={{ flex: 1 }} />
        <Row style={{ alignSelf: 'stretch' }}>
          <Button
            title="View list"
            variant="secondary"
            icon="list-outline"
            size="lg"
            style={{ flex: 1 }}
            onPress={() => router.push({ pathname: '/teacher/session/[id]', params: { id } })}
          />
          {isActive ? (
            <Button
              title="End attendance"
              variant="danger"
              size="lg"
              style={{ flex: 1 }}
              loading={end.isPending}
              onPress={onEnd}
            />
          ) : (
            <Button
              title="Close"
              variant="secondary"
              size="lg"
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
