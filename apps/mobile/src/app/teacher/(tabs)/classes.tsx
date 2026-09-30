import type { RecordStatus } from '@kavriel/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';

import { classesApi, subjectsApi } from '@/api/endpoints';
import { QueryView } from '@/components/common';
import { InitialTile, ListGroup, ListRow, SegmentedControl } from '@/components/patterns';
import { Badge, Button, Chips, EmptyState, Screen } from '@/components/ui';
import { colors } from '@/theme';

type Kind = 'classes' | 'subjects';

const ARCHIVED = <Badge label="Archived" fg={colors.textMuted} bg={colors.border} />;

/** A subject plus a section is one "class" to a teacher, so both live here behind one switch. */
export default function ClassesTab() {
  const [kind, setKind] = useState<Kind>('classes');
  const [status, setStatus] = useState<RecordStatus>('ACTIVE');
  const classes = useQuery({
    queryKey: ['classes', { status }],
    queryFn: () => classesApi.list({ status }),
    enabled: kind === 'classes',
  });
  const subjects = useQuery({
    queryKey: ['subjects', status],
    queryFn: () => subjectsApi.list(status),
    enabled: kind === 'subjects',
  });
  const active = kind === 'classes' ? classes : subjects;

  return (
    <Screen
      onRefresh={() => active.refetch()}
      refreshing={active.isRefetching}
      footer={
        <Button
          title={kind === 'classes' ? 'New class' : 'New subject'}
          icon="add"
          size="lg"
          onPress={() =>
            router.push(kind === 'classes' ? '/teacher/class-form' : '/teacher/subject-form')
          }
        />
      }
    >
      <SegmentedControl
        options={[
          { value: 'classes', label: 'Classes' },
          { value: 'subjects', label: 'Subjects' },
        ]}
        value={kind}
        onChange={setKind}
      />
      <Chips
        options={[
          { value: 'ACTIVE', label: 'Active' },
          { value: 'ARCHIVED', label: 'Archived' },
        ]}
        value={status}
        onChange={setStatus}
      />

      {kind === 'classes' ? (
        <QueryView
          query={classes}
          empty={
            <EmptyState
              icon="people-outline"
              title={status === 'ACTIVE' ? 'No classes yet' : 'No archived classes'}
              message={
                status === 'ACTIVE'
                  ? 'Create a class (section) for one of your subjects.'
                  : undefined
              }
            />
          }
        >
          {(list) => (
            <ListGroup>
              {list.map((c) => (
                <ListRow
                  key={c.id}
                  leading={<InitialTile label={c.subject.subjectName} />}
                  title={c.subject.subjectName}
                  subtitle={`${c.classCode} · ${c.sectionName}`}
                  meta={`${c.enrolledCount} students · ${c.semester.name}`}
                  right={c.status === 'ARCHIVED' ? ARCHIVED : undefined}
                  onPress={() =>
                    router.push({ pathname: '/teacher/class/[id]', params: { id: c.id } })
                  }
                />
              ))}
            </ListGroup>
          )}
        </QueryView>
      ) : (
        <QueryView
          query={subjects}
          empty={
            <EmptyState
              icon="book-outline"
              title={status === 'ACTIVE' ? 'No subjects yet' : 'No archived subjects'}
              message={
                status === 'ACTIVE' ? 'Create a subject, then add classes for it.' : undefined
              }
            />
          }
        >
          {(list) => (
            <ListGroup>
              {list.map((s) => (
                <ListRow
                  key={s.id}
                  leading={<InitialTile label={s.subjectName} />}
                  title={s.subjectName}
                  subtitle={s.subjectCode}
                  meta={[
                    s.yearLevel?.name,
                    s.units ? `${s.units} units` : null,
                    `${s.classCount} class${s.classCount === 1 ? '' : 'es'}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  right={s.status === 'ARCHIVED' ? ARCHIVED : undefined}
                  onPress={() =>
                    router.push({ pathname: '/teacher/subject/[id]', params: { id: s.id } })
                  }
                />
              ))}
            </ListGroup>
          )}
        </QueryView>
      )}
    </Screen>
  );
}
