import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';

import { classesApi, studentAttendanceApi } from '@/api/endpoints';
import { AttendanceBadge, QueryView, ScheduleCard } from '@/components/common';
import { AppText, Card, EmptyState, Row, Screen, Section, Stat } from '@/components/ui';
import { formatDate, formatTime, percent } from '@/lib/format';
import { colors } from '@/theme';

export default function StudentClassDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const cls = useQuery({ queryKey: ['class', id], queryFn: () => classesApi.get(id) });
  const summary = useQuery({
    queryKey: ['my', 'summary', id],
    queryFn: () => studentAttendanceApi.summary(id),
  });
  const history = useQuery({
    queryKey: ['my', 'class', id],
    queryFn: () => studentAttendanceApi.my({ classId: id, limit: 50 }),
  });

  const s = summary.data?.[0];

  return (
    <Screen
      onRefresh={() => {
        void cls.refetch();
        void summary.refetch();
        void history.refetch();
      }}
      refreshing={cls.isRefetching}
    >
      <Stack.Screen options={{ title: cls.data?.classCode ?? 'Class' }} />
      <QueryView query={cls}>
        {(c) => (
          <>
            <Card>
              <AppText variant="title">{c.subject.subjectName}</AppText>
              <AppText variant="muted">
                {c.subject.subjectCode} · {c.classCode} · {c.sectionName}
              </AppText>
              <AppText variant="small">
                {c.teacher.fullName} · {c.semester.name} {c.semester.academicYear}
              </AppText>
            </Card>

            {s ? (
              <Row>
                <Stat label="Attendance" value={percent(s.percentage)} tone={colors.primary} />
                <Stat label="Present" value={s.counts.PRESENT} tone={colors.success} />
                <Stat label="Late" value={s.counts.LATE} tone={colors.warning} />
                <Stat label="Absent" value={s.counts.ABSENT} tone={colors.danger} />
              </Row>
            ) : null}

            <Section title="Schedule">
              {c.schedules.length === 0 ? (
                <EmptyState icon="calendar-outline" title="No schedule yet" />
              ) : (
                c.schedules.map((sch) => <ScheduleCard key={sch.id} schedule={sch} showDay />)
              )}
            </Section>
          </>
        )}
      </QueryView>

      <Section title="My attendance">
        <QueryView
          query={history}
          isEmpty={(d) => d.items.length === 0}
          empty={<EmptyState title="No sessions yet" />}
        >
          {(page) =>
            page.items.map((a) => (
              <Card key={a.id}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <AppText>{formatDate(a.session.startedAt)}</AppText>
                  <AttendanceBadge status={a.status} />
                </Row>
                {a.checkInTime ? (
                  <AppText variant="small">Scanned at {formatTime(a.checkInTime)}</AppText>
                ) : null}
                {a.remarks ? <AppText variant="small">“{a.remarks}”</AppText> : null}
              </Card>
            ))
          }
        </QueryView>
      </Section>
    </Screen>
  );
}
