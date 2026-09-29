import type { RecordStatus } from '@kavriel/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';

import { classesApi } from '@/api/endpoints';
import { QueryView } from '@/components/common';
import { AppText, Badge, Button, Card, Chips, EmptyState, Row, Screen } from '@/components/ui';
import { colors } from '@/theme';

export default function ClassesTab() {
  const [status, setStatus] = useState<RecordStatus>('ACTIVE');
  const classes = useQuery({
    queryKey: ['classes', { status }],
    queryFn: () => classesApi.list({ status }),
  });

  return (
    <Screen onRefresh={() => classes.refetch()} refreshing={classes.isRefetching}>
      <Button title="New class" icon="add" onPress={() => router.push('/teacher/class-form')} />
      <Chips
        options={[
          { value: 'ACTIVE', label: 'Active' },
          { value: 'ARCHIVED', label: 'Archived' },
        ]}
        value={status}
        onChange={setStatus}
      />
      <QueryView
        query={classes}
        empty={
          <EmptyState
            icon="people-outline"
            title={status === 'ACTIVE' ? 'No classes yet' : 'No archived classes'}
            message={
              status === 'ACTIVE' ? 'Create a class (section) for one of your subjects.' : undefined
            }
          />
        }
      >
        {(list) =>
          list.map((c) => (
            <Card
              key={c.id}
              onPress={() => router.push({ pathname: '/teacher/class/[id]', params: { id: c.id } })}
            >
              <Row style={{ justifyContent: 'space-between' }}>
                <AppText variant="subtitle">{c.classCode}</AppText>
                {c.status === 'ARCHIVED' ? (
                  <Badge label="Archived" fg={colors.textMuted} bg={colors.border} />
                ) : null}
              </Row>
              <AppText>{c.subject.subjectName}</AppText>
              <AppText variant="small">
                {c.sectionName} · {c.semester.name} {c.semester.academicYear} · {c.enrolledCount}{' '}
                students
              </AppText>
            </Card>
          ))
        }
      </QueryView>
    </Screen>
  );
}
