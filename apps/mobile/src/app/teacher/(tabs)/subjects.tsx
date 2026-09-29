import type { RecordStatus } from '@kavriel/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';

import { subjectsApi } from '@/api/endpoints';
import { QueryView } from '@/components/common';
import { AppText, Badge, Button, Card, Chips, EmptyState, Row, Screen } from '@/components/ui';
import { colors } from '@/theme';

export default function SubjectsTab() {
  const [status, setStatus] = useState<RecordStatus>('ACTIVE');
  const subjects = useQuery({
    queryKey: ['subjects', status],
    queryFn: () => subjectsApi.list(status),
  });

  return (
    <Screen onRefresh={() => subjects.refetch()} refreshing={subjects.isRefetching}>
      <Button title="New subject" icon="add" onPress={() => router.push('/teacher/subject-form')} />
      <Chips
        options={[
          { value: 'ACTIVE', label: 'Active' },
          { value: 'ARCHIVED', label: 'Archived' },
        ]}
        value={status}
        onChange={setStatus}
      />
      <QueryView
        query={subjects}
        empty={
          <EmptyState
            icon="book-outline"
            title={status === 'ACTIVE' ? 'No subjects yet' : 'No archived subjects'}
            message={status === 'ACTIVE' ? 'Create a subject, then add classes for it.' : undefined}
          />
        }
      >
        {(list) =>
          list.map((s) => (
            <Card
              key={s.id}
              onPress={() =>
                router.push({ pathname: '/teacher/subject/[id]', params: { id: s.id } })
              }
            >
              <Row style={{ justifyContent: 'space-between' }}>
                <AppText variant="subtitle">{s.subjectCode}</AppText>
                {s.status === 'ARCHIVED' ? (
                  <Badge label="Archived" fg={colors.textMuted} bg={colors.border} />
                ) : null}
              </Row>
              <AppText>{s.subjectName}</AppText>
              <AppText variant="small">
                {[
                  s.yearLevel?.name,
                  s.units ? `${s.units} units` : null,
                  `${s.classCount} class${s.classCount === 1 ? '' : 'es'}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </AppText>
            </Card>
          ))
        }
      </QueryView>
    </Screen>
  );
}
