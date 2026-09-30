import type { TodayScheduleDto } from '@kavriel/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';

import { errorMessage } from '@/api/errors';
import { schedulesApi, sessionsApi } from '@/api/endpoints';
import { useTeacher } from '@/auth/AuthProvider';
import { QueryView, ScheduleCard, SessionCard } from '@/components/common';
import { NowCard, type NowProps } from '@/components/NowCard';
import { InsightStrip, TimelineRow } from '@/components/patterns';
import { AppText, Button, EmptyState, Screen, Section } from '@/components/ui';
import { notify } from '@/lib/confirm';
import { formatClock, formatDate, greeting } from '@/lib/format';

const openQr = (id: string) =>
  router.push({ pathname: '/teacher/session/[id]/qr', params: { id } });

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
    queryFn: () => sessionsApi.list({ limit: 10 }),
  });

  const start = useMutation({
    mutationFn: (s: TodayScheduleDto) =>
      sessionsApi.create({ classId: s.class.id, scheduleId: s.id }),
    onSuccess: (session) => {
      void qc.invalidateQueries({ queryKey: ['sessions'] });
      void qc.invalidateQueries({ queryKey: ['today'] });
      openQr(session.id);
    },
    onError: (err) => notify("Couldn't start attendance", errorMessage(err)),
  });

  const refreshing = today.isRefetching || active.isRefetching || recent.isRefetching;
  const refresh = () => {
    void today.refetch();
    void active.refetch();
    void recent.refetch();
  };

  // Dashboard numbers, from the most recent sessions.
  const sessions = recent.data?.items ?? [];
  const closed = sessions.filter((s) => s.status === 'ENDED' || s.status === 'LOCKED');
  const totals = closed.reduce(
    (acc, s) => {
      acc.attended += s.counts.PRESENT + s.counts.LATE;
      acc.counted += s.counts.PRESENT + s.counts.LATE + s.counts.ABSENT;
      return acc;
    },
    { attended: 0, counted: 0 },
  );
  const rate = totals.counted ? `${Math.round((totals.attended / totals.counted) * 100)}%` : '—';
  const toLock = sessions.filter((s) => s.status === 'ENDED').length;

  const live = active.data?.items[0];
  const startable = today.data?.find((s) => s.canStart && !s.activeSessionId);

  const now: NowProps = live
    ? {
        label: 'Live now',
        title: `${live.class.subject.subjectName} · ${live.class.classCode}`,
        meta: `${live.counts.PRESENT + live.counts.LATE} of ${live.enrolledCount} checked in`,
        action: { title: 'Show QR code', icon: 'qr-code-outline', onPress: () => openQr(live.id) },
      }
    : startable
      ? {
          label: 'Up next',
          time: formatClock(startable.startTime),
          title: `${startable.class.subject.subjectName} · ${startable.class.classCode}`,
          meta: `Until ${formatClock(startable.endTime)}${startable.room ? ` · ${startable.room}` : ''}`,
          action: {
            title: 'Start attendance',
            icon: 'play',
            loading: start.isPending,
            onPress: () => start.mutate(startable),
          },
        }
      : {
          message: 'No class is ready to start. You can still take attendance any time.',
          action: {
            title: 'Start attendance',
            icon: 'play',
            onPress: () => router.push('/teacher/start'),
          },
        };

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <NowCard
        greeting={`${greeting()}, ${teacher.profile.firstName}`}
        date={formatDate(new Date().toISOString())}
        {...now}
      />

      <InsightStrip
        items={[
          { value: today.data?.length ?? '—', label: 'classes today' },
          { value: rate, label: 'attendance' },
          { value: toLock, label: toLock === 1 ? 'session to lock' : 'sessions to lock' },
        ]}
        onPress={() => router.push('/teacher/attendance')}
      />

      <Section title="Today's schedule">
        <QueryView
          query={today}
          empty={
            <EmptyState
              icon="sunny-outline"
              title="No classes today"
              message="Enjoy the break, or start an ad-hoc session."
            />
          }
        >
          {(schedules) =>
            schedules.map((s, i) => (
              <TimelineRow
                key={s.id}
                time={formatClock(s.startTime)}
                last={i === schedules.length - 1}
                current={!!s.activeSessionId || s.canStart}
              >
                <ScheduleCard
                  schedule={s}
                  footer={
                    s.activeSessionId ? (
                      <Button
                        title="Open active attendance"
                        icon="qr-code-outline"
                        variant="secondary"
                        onPress={() => openQr(s.activeSessionId!)}
                      />
                    ) : s.canStart ? (
                      <Button
                        title="Start attendance"
                        icon="play"
                        loading={start.isPending && start.variables?.id === s.id}
                        onPress={() => start.mutate(s)}
                      />
                    ) : (
                      <AppText variant="small">Attendance opens 15 minutes before class.</AppText>
                    )
                  }
                />
              </TimelineRow>
            ))
          }
        </QueryView>
      </Section>

      <Section
        title="Recent sessions"
        action={
          <Button
            title="See all"
            variant="ghost"
            onPress={() => router.push('/teacher/attendance')}
          />
        }
      >
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
            page.items
              .slice(0, 4)
              .map((s) => (
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
      </Section>
    </Screen>
  );
}
