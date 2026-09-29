import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';

import { errorMessage } from '@/api/errors';
import { classesApi, subjectsApi } from '@/api/endpoints';
import { QueryView } from '@/components/common';
import { AppText, Badge, Button, Card, EmptyState, Row, Screen, Section } from '@/components/ui';
import { confirm, notify } from '@/lib/confirm';
import { colors } from '@/theme';

export default function SubjectDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const subject = useQuery({ queryKey: ['subject', id], queryFn: () => subjectsApi.get(id) });
  const classes = useQuery({
    queryKey: ['classes', { subjectId: id }],
    queryFn: () => classesApi.list({ subjectId: id }),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['subjects'] });
    void qc.invalidateQueries({ queryKey: ['subject', id] });
  };

  const setStatus = useMutation({
    mutationFn: (status: 'ACTIVE' | 'ARCHIVED') => subjectsApi.update(id, { status }),
    onSuccess: invalidate,
    onError: (err) => notify('Could not update subject', errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: () => subjectsApi.remove(id),
    onSuccess: () => {
      invalidate();
      router.back();
    },
    onError: (err) => notify('Could not delete subject', errorMessage(err)),
  });

  return (
    <Screen onRefresh={() => subject.refetch()} refreshing={subject.isRefetching}>
      <Stack.Screen options={{ title: subject.data?.subjectCode ?? 'Subject' }} />
      <QueryView query={subject}>
        {(s) => (
          <>
            <Card>
              <Row style={{ justifyContent: 'space-between' }}>
                <AppText variant="title">{s.subjectCode}</AppText>
                {s.status === 'ARCHIVED' ? (
                  <Badge label="Archived" fg={colors.textMuted} bg={colors.border} />
                ) : null}
              </Row>
              <AppText variant="subtitle">{s.subjectName}</AppText>
              {s.description ? <AppText variant="muted">{s.description}</AppText> : null}
              <AppText variant="small">
                {[s.yearLevel?.name, s.units ? `${s.units} units` : null]
                  .filter(Boolean)
                  .join(' · ') || 'No year level or units set'}
              </AppText>
            </Card>

            <Button
              title="Edit subject"
              variant="secondary"
              icon="create-outline"
              onPress={() => router.push({ pathname: '/teacher/subject-form', params: { id } })}
            />

            <Section title="Classes">
              <QueryView query={classes} empty={<EmptyState title="No classes for this subject" />}>
                {(list) =>
                  list.map((c) => (
                    <Card
                      key={c.id}
                      onPress={() =>
                        router.push({ pathname: '/teacher/class/[id]', params: { id: c.id } })
                      }
                    >
                      <AppText variant="subtitle">{c.classCode}</AppText>
                      <AppText variant="small">
                        {c.sectionName} · {c.semester.name} {c.semester.academicYear} ·{' '}
                        {c.enrolledCount} students
                      </AppText>
                    </Card>
                  ))
                }
              </QueryView>
              {s.status === 'ACTIVE' ? (
                <Button
                  title="Add class"
                  variant="ghost"
                  icon="add"
                  onPress={() =>
                    router.push({ pathname: '/teacher/class-form', params: { subjectId: id } })
                  }
                />
              ) : null}
            </Section>

            {s.status === 'ACTIVE' ? (
              <Button
                title="Archive subject"
                variant="secondary"
                loading={setStatus.isPending}
                onPress={async () => {
                  if (
                    await confirm(
                      'Archive subject?',
                      'Its history stays in reports, but no new classes can use it.',
                      'Archive',
                    )
                  ) {
                    setStatus.mutate('ARCHIVED');
                  }
                }}
              />
            ) : (
              <Button
                title="Restore subject"
                variant="secondary"
                loading={setStatus.isPending}
                onPress={() => setStatus.mutate('ACTIVE')}
              />
            )}
            {s.classCount === 0 ? (
              <Button
                title="Delete subject"
                variant="danger"
                loading={remove.isPending}
                onPress={async () => {
                  if (await confirm('Delete subject?', 'This cannot be undone.', 'Delete', true))
                    remove.mutate();
                }}
              />
            ) : (
              <AppText variant="small">
                Subjects with classes can't be deleted; archive them instead.
              </AppText>
            )}
          </>
        )}
      </QueryView>
    </Screen>
  );
}
