import type { TodayScheduleDto } from '@kavriel/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';

import { errorMessage } from '@/api/errors';
import { schedulesApi, sessionsApi } from '@/api/endpoints';
import { useTeacher } from '@/auth/AuthProvider';
import { QueryView, ScheduleCard, SessionCard } from '@/components/common';
import {
  AppText,
  Banner,
  Button,
  Card,
  EmptyState,
  Row,
  Screen,
  Section,
  Stat,
} from '@/components/ui';
import { notify } from '@/lib/confirm';
import { greeting } from '@/lib/format';
import { colors } from '@/theme';

export default function TeacherHome() {
  const teacher = useTeacher();
  const qc = useQueryClient();
  const today = useQuery({ queryKey: ['today'], queryFn: schedulesApi.today });
  const active = useQuery({
    queryKey: ['sessions', 'ACTIVE'],
    queryFn: () => sessionsApi.list({ status: 'ACTIVE', limit: 10 }),
  });
  const recent = useQuery({
    queryKey: ['sessions', 'recent'],
    queryFn: () => sessionsApi.list({ limit: 5 }),
  });

  const start = useMutation({
    mutationFn: (s: TodayScheduleDto) =>
      sessionsApi.create({ classId: s.class.id, scheduleId: s.id }),
    onSuccess: (session) => {
      void qc.invalidateQueries({ queryKey: ['sessions'] });
      void qc.invalidateQueries({ queryKey: ['today'] });
      router.push({ pathname: '/teacher/session/[id]/qr', params: { id: session.id } });
    },
    onError: (err) => notify("Couldn't start attendance", errorMessage(err)),
  });

  const refreshing = today.isRefetching || active.isRefetching || recent.isRefetching;
  const refresh = () => {
    void today.refetch();
    void active.refetch();
    void recent.refetch();
  };

  // Basic statistics over the recent closed sessions.
  const closed = (recent.data?.items ?? []).filter(
    (s) => s.status !== 'ACTIVE' && s.status !== 'PENDING',
  );
  const totals = closed.reduce(
    (acc, s) => {
      acc.attended += s.counts.PRESENT + s.counts.LATE;
      acc.counted += s.counts.PRESENT + s.counts.LATE + s.counts.ABSENT;
      return acc;
    },
    { attended: 0, counted: 0 },
  );
  const rate = totals.counted ? `${Math.round((totals.attended / totals.counted) * 100)}%` : '—';

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <AppText variant="title">
        {greeting()}, {teacher.profile.firstName}
      </AppText>

      {active.data?.items.map((s) => (
        <Card
          key={s.id}
          onPress={() =>
            router.push({ pathname: '/teacher/session/[id]/qr', params: { id: s.id } })
          }
        >
          <Banner
            tone="success"
            message={`Attendance active · ${s.class.subject.subjectName} (${s.class.classCode})`}
          />
          <AppText variant="small">
            Present {s.counts.PRESENT} · Late {s.counts.LATE} of {s.enrolledCount}. Tap to show the
            QR code.
          </AppText>
        </Card>
      ))}

      <Section title="Today's schedule">
        <QueryView
          query={today}
          empty={
            <EmptyState
              icon="sunny-outline"
              title="No classes today"
              message="Enjoy the break, or start an ad-hoc session below."
            />
          }
        >
          {(schedules) =>
            schedules.map((s) => (
              <ScheduleCard
                key={s.id}
                schedule={s}
                footer={
                  s.activeSessionId ? (
                    <Button
                      title="Open active attendance"
                      icon="qr-code-outline"
                      variant="secondary"
                      onPress={() =>
                        router.push({
                          pathname: '/teacher/session/[id]/qr',
                          params: { id: s.activeSessionId! },
                        })
                      }
                    />
                  ) : s.canStart ? (
                    <Button
                      title="Start Attendance"
                      icon="play"
                      loading={start.isPending && start.variables?.id === s.id}
                      onPress={() => start.mutate(s)}
                    />
                  ) : (
                    <AppText variant="small">Attendance opens 15 minutes before class.</AppText>
                  )
                }
              />
            ))
          }
        </QueryView>
        <Button
          title="Start ad-hoc attendance"
          variant="secondary"
          icon="add"
          onPress={() => router.push('/teacher/start')}
        />
      </Section>

      <Section title="Recent attendance">
        <Row>
          <Stat label="Sessions" value={closed.length} />
          <Stat label="Attendance rate" value={rate} tone={colors.success} />
        </Row>
        <QueryView
          query={recent}
          isEmpty={(d) => d.items.length === 0}
          empty={
            <EmptyState
              icon="time-outline"
              title="No sessions yet"
              message="Sessions you run will show here."
            />
          }
        >
          {(page) =>
            page.items.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                onPress={() =>
                  router.push({ pathname: '/teacher/session/[id]', params: { id: s.id } })
                }
              />
            ))
          }
        </QueryView>
        <Button
          title="Reports"
          variant="ghost"
          icon="bar-chart-outline"
          onPress={() => router.push('/teacher/reports')}
        />
      </Section>
    </Screen>
  );
}
