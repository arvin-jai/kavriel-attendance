import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { errorMessage } from '@/api/errors';
import { classesApi, subjectsApi } from '@/api/endpoints';
import { QueryView } from '@/components/common';
import { ActionRow, InitialTile, ListGroup, ListRow } from '@/components/patterns';
import { AppText, Badge, Button, EmptyState, Row, Screen, Section } from '@/components/ui';
import { confirm, notify } from '@/lib/confirm';
import { colors, radius, spacing } from '@/theme';

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
            <View
              style={{
                backgroundColor: colors.sky,
                borderRadius: radius.xl,
                padding: spacing.xl,
                gap: spacing.xs,
              }}
            >
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="title" style={{ color: colors.onSky }}>
                    {s.subjectName}
                  </AppText>
                  <AppText style={{ color: colors.onSky }}>{s.subjectCode}</AppText>
                </View>
                {s.status === 'ARCHIVED' ? (
                  <Badge label="Archived" fg={colors.textMuted} bg={colors.surface} />
                ) : null}
              </Row>
              {s.description ? (
                <AppText style={{ color: colors.onSky }}>{s.description}</AppText>
              ) : null}
              <AppText variant="small" style={{ color: colors.onSky }}>
                {[s.yearLevel?.name, s.units ? `${s.units} units` : null]
                  .filter(Boolean)
                  .join(' · ') || 'No year level or units set'}
              </AppText>
            </View>

            <Section
              title="Classes"
              action={
                s.status === 'ACTIVE' ? (
                  <Button
                    title="Add class"
                    variant="ghost"
                    icon="add"
                    onPress={() =>
                      router.push({ pathname: '/teacher/class-form', params: { subjectId: id } })
                    }
                  />
                ) : undefined
              }
            >
              <QueryView query={classes} empty={<EmptyState title="No classes for this subject" />}>
                {(list) => (
                  <ListGroup>
                    {list.map((c) => (
                      <ListRow
                        key={c.id}
                        leading={<InitialTile label={c.sectionName} />}
                        title={c.sectionName}
                        subtitle={c.classCode}
                        meta={`${c.semester.name} · ${c.enrolledCount} students`}
                        onPress={() =>
                          router.push({ pathname: '/teacher/class/[id]', params: { id: c.id } })
                        }
                      />
                    ))}
                  </ListGroup>
                )}
              </QueryView>
            </Section>

            <Section title="Manage">
              <ListGroup>
                <ActionRow
                  icon="create-outline"
                  title="Edit subject"
                  onPress={() => router.push({ pathname: '/teacher/subject-form', params: { id } })}
                />
                {s.status === 'ACTIVE' ? (
                  <ActionRow
                    icon="archive-outline"
                    title="Archive subject"
                    busy={setStatus.isPending}
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
                  <ActionRow
                    icon="arrow-undo-outline"
                    title="Restore subject"
                    busy={setStatus.isPending}
                    onPress={() => setStatus.mutate('ACTIVE')}
                  />
                )}
                {s.classCount === 0 ? (
                  <ActionRow
                    icon="trash-outline"
                    title="Delete subject"
                    tone="danger"
                    busy={remove.isPending}
                    onPress={async () => {
                      if (
                        await confirm('Delete subject?', 'This cannot be undone.', 'Delete', true)
                      )
                        remove.mutate();
                    }}
                  />
                ) : null}
              </ListGroup>
              {s.classCount > 0 ? (
                <AppText variant="small">
                  Subjects with classes can't be deleted; archive them instead.
                </AppText>
              ) : null}
            </Section>
          </>
        )}
      </QueryView>
    </Screen>
  );
}
