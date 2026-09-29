import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';

import { errorMessage } from '@/api/errors';
import { classesApi, sessionsApi } from '@/api/endpoints';
import { QueryView, ScheduleCard, SessionCard } from '@/components/common';
import { AppText, Badge, Button, Card, EmptyState, Row, Screen, Section } from '@/components/ui';
import { confirm, notify } from '@/lib/confirm';
import { colors } from '@/theme';

export default function ClassDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const cls = useQuery({ queryKey: ['class', id], queryFn: () => classesApi.get(id) });
  const sessions = useQuery({
    queryKey: ['sessions', { classId: id }],
    queryFn: () => sessionsApi.list({ classId: id, limit: 5 }),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['classes'] });
    void qc.invalidateQueries({ queryKey: ['class', id] });
  };

  const setStatus = useMutation({
    mutationFn: (status: 'ACTIVE' | 'ARCHIVED') => classesApi.update(id, { status }),
    onSuccess: invalidate,
    onError: (err) => notify('Could not update class', errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: () => classesApi.remove(id),
    onSuccess: () => {
      invalidate();
      router.back();
    },
    onError: (err) => notify('Could not delete class', errorMessage(err)),
  });

  return (
    <Screen
      onRefresh={() => {
        void cls.refetch();
        void sessions.refetch();
      }}
      refreshing={cls.isRefetching}
    >
      <Stack.Screen options={{ title: cls.data?.classCode ?? 'Class' }} />
      <QueryView query={cls}>
        {(c) => (
          <>
            <Card>
              <Row style={{ justifyContent: 'space-between' }}>
                <AppText variant="title">{c.classCode}</AppText>
                {c.status === 'ARCHIVED' ? (
                  <Badge label="Archived" fg={colors.textMuted} bg={colors.border} />
                ) : null}
              </Row>
              <AppText variant="subtitle">{c.subject.subjectName}</AppText>
              <AppText variant="small">
                {c.sectionName} · {c.semester.name} {c.semester.academicYear}
              </AppText>
            </Card>

            {c.status === 'ACTIVE' ? (
              <Button
                title="Start attendance"
                icon="qr-code-outline"
                onPress={() => router.push({ pathname: '/teacher/start', params: { classId: id } })}
              />
            ) : null}

            <Button
              title={`Students (${c.enrolledCount})`}
              variant="secondary"
              icon="people-outline"
              onPress={() =>
                router.push({ pathname: '/teacher/class/[id]/students', params: { id } })
              }
            />

            <Section
              title="Schedule"
              action={
                c.status === 'ACTIVE' ? (
                  <Button
                    title="Add"
                    variant="ghost"
                    icon="add"
                    onPress={() =>
                      router.push({ pathname: '/teacher/schedule-form', params: { classId: id } })
                    }
                  />
                ) : undefined
              }
            >
              {c.schedules.length === 0 ? (
                <EmptyState
                  icon="calendar-outline"
                  title="No schedule yet"
                  message="Add the days and times this class meets."
                />
              ) : (
                c.schedules.map((s) => (
                  <ScheduleCard
                    key={s.id}
                    schedule={s}
                    showDay
                    onPress={() =>
                      router.push({ pathname: '/teacher/schedule-form', params: { id: s.id } })
                    }
                  />
                ))
              )}
            </Section>

            <Section title="Recent sessions">
              <QueryView
                query={sessions}
                isEmpty={(d) => d.items.length === 0}
                empty={<EmptyState icon="time-outline" title="No attendance taken yet" />}
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
            </Section>

            <Button
              title="Edit class"
              variant="secondary"
              icon="create-outline"
              onPress={() => router.push({ pathname: '/teacher/class-form', params: { id } })}
            />
            {c.status === 'ACTIVE' ? (
              <Button
                title="Archive class"
                variant="secondary"
                loading={setStatus.isPending}
                onPress={async () => {
                  if (
                    await confirm(
                      'Archive class?',
                      'Attendance history stays in reports. No new sessions or enrollments.',
                      'Archive',
                    )
                  ) {
                    setStatus.mutate('ARCHIVED');
                  }
                }}
              />
            ) : (
              <Button
                title="Restore class"
                variant="secondary"
                loading={setStatus.isPending}
                onPress={() => setStatus.mutate('ACTIVE')}
              />
            )}
            <Button
              title="Delete class"
              variant="danger"
              loading={remove.isPending}
              onPress={async () => {
                if (
                  await confirm(
                    'Delete class?',
                    'Only classes with no students, schedules or sessions can be deleted.',
                    'Delete',
                    true,
                  )
                ) {
                  remove.mutate();
                }
              }}
            />
          </>
        )}
      </QueryView>
    </Screen>
  );
}
