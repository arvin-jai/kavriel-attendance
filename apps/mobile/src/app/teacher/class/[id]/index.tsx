import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { errorMessage } from '@/api/errors';
import { classesApi, sessionsApi } from '@/api/endpoints';
import { QueryView, ScheduleCard, SessionCard } from '@/components/common';
import { ActionRow, ListGroup, ListRow } from '@/components/patterns';
import { AppText, Badge, Button, EmptyState, Row, Screen, Section } from '@/components/ui';
import { confirm, notify } from '@/lib/confirm';
import { colors, radius, spacing } from '@/theme';

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
            <View
              style={{
                backgroundColor: colors.sky,
                borderRadius: radius.xl,
                padding: spacing.xl,
                gap: spacing.md,
              }}
            >
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="title" style={{ color: colors.onSky }}>
                    {c.subject.subjectName}
                  </AppText>
                  <AppText style={{ color: colors.onSky }}>
                    {c.classCode} · {c.sectionName}
                  </AppText>
                  <AppText variant="small" style={{ color: colors.onSky }}>
                    {c.semester.name} {c.semester.academicYear} · {c.enrolledCount} students
                  </AppText>
                </View>
                {c.status === 'ARCHIVED' ? (
                  <Badge label="Archived" fg={colors.textMuted} bg={colors.surface} />
                ) : null}
              </Row>
              {c.status === 'ACTIVE' ? (
                <Button
                  title="Start attendance"
                  icon="play"
                  size="lg"
                  onPress={() =>
                    router.push({ pathname: '/teacher/start', params: { classId: id } })
                  }
                />
              ) : null}
            </View>

            <ListGroup>
              <ListRow
                leading={<Ionicons name="people-outline" size={22} color={colors.primaryDark} />}
                title="Students"
                right={<AppText variant="muted">{c.enrolledCount}</AppText>}
                onPress={() =>
                  router.push({ pathname: '/teacher/class/[id]/students', params: { id } })
                }
              />
            </ListGroup>

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

            <Section title="Manage">
              <ListGroup>
                <ActionRow
                  icon="create-outline"
                  title="Edit class"
                  onPress={() => router.push({ pathname: '/teacher/class-form', params: { id } })}
                />
                {c.status === 'ACTIVE' ? (
                  <ActionRow
                    icon="archive-outline"
                    title="Archive class"
                    busy={setStatus.isPending}
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
                  <ActionRow
                    icon="arrow-undo-outline"
                    title="Restore class"
                    busy={setStatus.isPending}
                    onPress={() => setStatus.mutate('ACTIVE')}
                  />
                )}
                <ActionRow
                  icon="trash-outline"
                  title="Delete class"
                  tone="danger"
                  busy={remove.isPending}
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
              </ListGroup>
            </Section>
          </>
        )}
      </QueryView>
    </Screen>
  );
}
