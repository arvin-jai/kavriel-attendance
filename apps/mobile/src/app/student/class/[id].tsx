import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { classesApi, studentAttendanceApi } from '@/api/endpoints';
import { AttendanceBadge, QueryView, ScheduleCard } from '@/components/common';
import { ListGroup, ListRow, SegmentedBar } from '@/components/patterns';
import { AppText, Badge, EmptyState, Row, Screen, Section } from '@/components/ui';
import { formatDate, formatTime, percent } from '@/lib/format';
import { attendanceTone, colors, radius, spacing } from '@/theme';

const ORDER = ['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'] as const;
const BAR = {
  PRESENT: colors.presentFg,
  LATE: colors.warning,
  ABSENT: colors.absentFg,
  EXCUSED: colors.excusedFg,
} as const;

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
            <View
              style={{
                backgroundColor: colors.sky,
                borderRadius: radius.xl,
                padding: spacing.xl,
                gap: spacing.md,
              }}
            >
              <View style={{ gap: 2 }}>
                <AppText variant="title" style={{ color: colors.onSky }}>
                  {c.subject.subjectName}
                </AppText>
                <AppText style={{ color: colors.onSky }}>
                  {c.classCode} · {c.sectionName}
                </AppText>
                <AppText variant="small" style={{ color: colors.onSky }}>
                  {c.teacher.fullName} · {c.semester.name}
                </AppText>
              </View>
              {s ? (
                <>
                  <Row style={{ alignItems: 'baseline', gap: spacing.sm }}>
                    <AppText style={{ color: colors.onSky, fontSize: 40, fontWeight: '700' }}>
                      {percent(s.percentage)}
                    </AppText>
                    <AppText style={{ color: colors.onSky }}>attendance</AppText>
                  </Row>
                  <SegmentedBar
                    parts={ORDER.map((k) => ({
                      value: s.counts[k],
                      color: BAR[k],
                      label: attendanceTone[k].label.toLowerCase(),
                    }))}
                  />
                  <Row style={{ gap: spacing.xs, flexWrap: 'wrap' }}>
                    {ORDER.map((k) => (
                      <Badge
                        key={k}
                        label={`${s.counts[k]} ${attendanceTone[k].label}`}
                        fg={attendanceTone[k].fg}
                        bg={attendanceTone[k].bg}
                        icon={attendanceTone[k].icon}
                      />
                    ))}
                  </Row>
                </>
              ) : null}
            </View>

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
          {(page) => (
            <ListGroup>
              {page.items.map((a) => (
                <ListRow
                  key={a.id}
                  title={formatDate(a.session.startedAt)}
                  subtitle={a.checkInTime ? `Scanned at ${formatTime(a.checkInTime)}` : undefined}
                  meta={a.remarks ? `“${a.remarks}”` : undefined}
                  right={<AttendanceBadge status={a.status} />}
                />
              ))}
            </ListGroup>
          )}
        </QueryView>
      </Section>
    </Screen>
  );
}
