import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { classesApi, schedulesApi, studentAttendanceApi } from '@/api/endpoints';
import { useStudent } from '@/auth/AuthProvider';
import { NowCard } from '@/components/NowCard';
import { AttendanceBadge, QueryView } from '@/components/common';
import { InitialTile, ListGroup, ListRow, SegmentedBar } from '@/components/patterns';
import { AppText, Badge, EmptyState, Row, Screen, Section } from '@/components/ui';
import { formatClock, formatDate, formatTime, greeting, nowClock, percent } from '@/lib/format';
import { attendanceTone, colors, font, radius, spacing } from '@/theme';

const COUNT_ORDER = ['present', 'late', 'absent', 'excused'] as const;
const KEY = { present: 'PRESENT', late: 'LATE', absent: 'ABSENT', excused: 'EXCUSED' } as const;

/** A word for the percentage, so it never rests on colour: 85+ on track, 70+ watch, below low. */
function LevelBadge({ pct }: { pct: number }) {
  if (pct >= 85)
    return <Badge label="On track" fg={colors.presentFg} bg={colors.presentBg} icon="checkmark" />;
  if (pct >= 70) return <Badge label="Watch" fg={colors.lateFg} bg={colors.lateBg} icon="alert" />;
  return <Badge label="Low" fg={colors.absentFg} bg={colors.absentBg} icon="close" />;
}

const styles = StyleSheet.create({
  overall: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
});

export default function StudentHome() {
  const student = useStudent();
  const today = useQuery({ queryKey: ['today'], queryFn: schedulesApi.today });
  const classes = useQuery({ queryKey: ['classes', {}], queryFn: () => classesApi.list() });
  const recent = useQuery({
    queryKey: ['my', 'recent'],
    queryFn: () => studentAttendanceApi.my({ limit: 5 }),
  });
  const summary = useQuery({
    queryKey: ['my', 'summary'],
    queryFn: () => studentAttendanceApi.summary(),
  });

  const refreshing = today.isRefetching || recent.isRefetching || summary.isRefetching;
  const refresh = () => {
    void today.refetch();
    void classes.refetch();
    void recent.refetch();
    void summary.refetch();
  };

  // Next class: first of today's classes that hasn't ended yet.
  const nowHHMM = nowClock();
  const next = today.data?.find((s) => s.endTime >= nowHHMM);

  // Overall figures across all classes, using the same rule as the server percentage.
  const rows = summary.data ?? [];
  const totals = rows.reduce(
    (acc, r) => {
      acc.present += r.counts.PRESENT;
      acc.late += r.counts.LATE;
      acc.absent += r.counts.ABSENT;
      acc.excused += r.counts.EXCUSED;
      return acc;
    },
    { present: 0, late: 0, absent: 0, excused: 0 },
  );
  const counted = totals.present + totals.late + totals.absent;
  const overall = counted ? Math.round(((totals.present + totals.late) / counted) * 100) : null;

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <NowCard
        greeting={`${greeting()}, ${student.profile.firstName}`}
        date={formatDate(new Date().toISOString())}
        label={next ? (next.activeSessionId ? 'Open now' : 'Next class') : undefined}
        time={next ? formatClock(next.startTime) : undefined}
        title={next?.class.subject.subjectName}
        meta={
          next
            ? `Until ${formatClock(next.endTime)}${next.room ? ` · ${next.room}` : ''}`
            : undefined
        }
        message={next ? undefined : 'No more classes today.'}
        action={{
          title: 'Scan QR to check in',
          icon: 'scan',
          onPress: () => router.push('/student/scan'),
        }}
      />

      <View style={styles.overall}>
        <Row style={{ alignItems: 'baseline', gap: spacing.sm }}>
          <AppText
            style={{ fontSize: font.display, fontWeight: '700', color: colors.primaryDark }}
            accessibilityLabel={`Overall attendance ${percent(overall)}`}
          >
            {percent(overall)}
          </AppText>
          <AppText variant="subtitle" style={{ flex: 1 }}>
            overall
          </AppText>
          {overall !== null ? <LevelBadge pct={overall} /> : null}
        </Row>
        <SegmentedBar
          parts={[
            { value: totals.present, color: colors.presentFg, label: 'present' },
            { value: totals.late, color: colors.warning, label: 'late' },
            { value: totals.absent, color: colors.absentFg, label: 'absent' },
            { value: totals.excused, color: colors.excusedFg, label: 'excused' },
          ]}
        />
        <Row style={{ gap: spacing.xs, flexWrap: 'wrap' }}>
          {COUNT_ORDER.map((k) => (
            <Badge
              key={k}
              label={`${totals[k]} ${attendanceTone[KEY[k]].label}`}
              fg={attendanceTone[KEY[k]].fg}
              bg={attendanceTone[KEY[k]].bg}
              icon={attendanceTone[KEY[k]].icon}
            />
          ))}
        </Row>
        <AppText variant="small">
          {overall === null
            ? 'Your percentage appears after your first class session.'
            : overall >= 85
              ? 'Great work, keep it up.'
              : overall >= 70
                ? 'Try not to miss more classes.'
                : 'Your attendance is low. Talk to your teacher if you need help.'}
        </AppText>
      </View>

      <Section title="My classes">
        <QueryView
          query={summary}
          empty={
            <EmptyState
              icon="stats-chart-outline"
              title="You're not in a class yet"
              message="Your teacher adds you with your student number. Nothing to do until then."
            />
          }
        >
          {(list) => (
            <ListGroup>
              {list.map((r) => (
                <ListRow
                  key={r.class.id}
                  leading={<InitialTile label={r.class.subject.subjectName} />}
                  title={r.class.subject.subjectName}
                  subtitle={`${r.class.classCode} · ${r.totalSessions} session${r.totalSessions === 1 ? '' : 's'}`}
                  right={
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <AppText variant="subtitle" style={{ color: colors.primaryDark }}>
                        {percent(r.percentage)}
                      </AppText>
                      {r.percentage !== null ? <LevelBadge pct={r.percentage} /> : null}
                    </View>
                  }
                  onPress={() =>
                    router.push({ pathname: '/student/class/[id]', params: { id: r.class.id } })
                  }
                />
              ))}
            </ListGroup>
          )}
        </QueryView>
      </Section>

      <Section title="Recent activity">
        <QueryView
          query={recent}
          isEmpty={(d) => d.items.length === 0}
          empty={
            <EmptyState
              icon="time-outline"
              title="No attendance yet"
              message="Your records show up after your first class."
            />
          }
        >
          {(page) => (
            <ListGroup>
              {page.items.map((a) => (
                <ListRow
                  key={a.id}
                  title={a.session.class.subject.subjectName}
                  subtitle={`${formatDate(a.session.startedAt)}${a.checkInTime ? ` · ${formatTime(a.checkInTime)}` : ''}`}
                  right={<AttendanceBadge status={a.status} />}
                />
              ))}
            </ListGroup>
          )}
        </QueryView>
      </Section>

      {classes.data?.length === 0 ? (
        <AppText variant="small">
          Not seeing your classes? Give your teacher your student number:{' '}
          {student.profile.studentNumber}
        </AppText>
      ) : null}
    </Screen>
  );
}
