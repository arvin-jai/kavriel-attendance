import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';

import { classesApi, schedulesApi, studentAttendanceApi } from '@/api/endpoints';
import { useStudent } from '@/auth/AuthProvider';
import { AttendanceBadge, QueryView, ScheduleCard } from '@/components/common';
import { AppText, Button, Card, EmptyState, Row, Screen, Section } from '@/components/ui';
import { formatDate, formatTime, greeting, nowClock, percent } from '@/lib/format';
import { colors } from '@/theme';

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

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <AppText variant="title">
        {greeting()}, {student.profile.firstName}
      </AppText>

      <Section title="Next class">
        <QueryView
          query={today}
          isEmpty={() => !next}
          empty={<EmptyState icon="sunny-outline" title="No more classes today" />}
        >
          {() =>
            next ? (
              <ScheduleCard
                schedule={next}
                footer={
                  next.activeSessionId ? (
                    <AppText style={{ color: colors.success, fontWeight: '600' }}>
                      Attendance is open now
                    </AppText>
                  ) : null
                }
              />
            ) : null
          }
        </QueryView>
        <Button title="Scan QR" icon="scan" onPress={() => router.push('/student/scan')} />
      </Section>

      <Section title="Attendance summary">
        <QueryView
          query={summary}
          empty={
            <EmptyState
              icon="stats-chart-outline"
              title="No classes yet"
              message="Your teacher adds you to classes using your student number."
            />
          }
        >
          {(rows) =>
            rows.map((r) => (
              <Card
                key={r.class.id}
                onPress={() =>
                  router.push({ pathname: '/student/class/[id]', params: { id: r.class.id } })
                }
              >
                <Row style={{ justifyContent: 'space-between' }}>
                  <AppText variant="subtitle" style={{ flex: 1 }}>
                    {r.class.subject.subjectName}
                  </AppText>
                  <AppText variant="subtitle" style={{ color: colors.primary }}>
                    {percent(r.percentage)}
                  </AppText>
                </Row>
                <AppText variant="small">
                  {r.class.classCode} · {r.totalSessions} session{r.totalSessions === 1 ? '' : 's'}
                </AppText>
              </Card>
            ))
          }
        </QueryView>
      </Section>

      <Section title="Recent attendance">
        <QueryView
          query={recent}
          isEmpty={(d) => d.items.length === 0}
          empty={<EmptyState icon="time-outline" title="No attendance yet" />}
        >
          {(page) =>
            page.items.map((a) => (
              <Card key={a.id}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <AppText style={{ flex: 1 }}>{a.session.class.subject.subjectName}</AppText>
                  <AttendanceBadge status={a.status} />
                </Row>
                <AppText variant="small">
                  {formatDate(a.session.startedAt)}
                  {a.checkInTime ? ` · ${formatTime(a.checkInTime)}` : ''}
                </AppText>
              </Card>
            ))
          }
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
