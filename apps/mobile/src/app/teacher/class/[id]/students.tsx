import type { StudentSummaryDto } from '@kavriel/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { errorMessage } from '@/api/errors';
import { classesApi } from '@/api/endpoints';
import { QueryView } from '@/components/common';
import {
  AppText,
  Banner,
  Button,
  Card,
  EmptyState,
  Row,
  Screen,
  Section,
  TextField,
} from '@/components/ui';
import { confirm, notify } from '@/lib/confirm';
import { spacing } from '@/theme';

export default function ClassStudents() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const students = useQuery({
    queryKey: ['classStudents', id],
    queryFn: () => classesApi.students(id),
  });

  const [studentNumber, setStudentNumber] = useState('');
  const [found, setFound] = useState<StudentSummaryDto | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['classStudents', id] });
    void qc.invalidateQueries({ queryKey: ['class', id] });
    void qc.invalidateQueries({ queryKey: ['classes'] });
  };

  const lookup = useMutation({
    mutationFn: () => classesApi.lookupStudent(studentNumber.trim()),
    onMutate: () => {
      setFound(null);
      setLookupError(null);
    },
    onSuccess: setFound,
    onError: (err) => setLookupError(errorMessage(err)),
  });

  const enroll = useMutation({
    mutationFn: (s: StudentSummaryDto) => classesApi.enroll(id, s.studentNumber),
    onSuccess: () => {
      setFound(null);
      setStudentNumber('');
      invalidate();
    },
    onError: (err) => setLookupError(errorMessage(err)),
  });

  const drop = useMutation({
    mutationFn: (studentId: string) => classesApi.drop(id, studentId),
    onSuccess: invalidate,
    onError: (err) => notify('Could not remove student', errorMessage(err)),
  });

  return (
    <Screen onRefresh={() => students.refetch()} refreshing={students.isRefetching}>
      <Stack.Screen options={{ title: 'Students' }} />

      <Section title="Add a student">
        <AppText variant="small">
          Students register in the app first. Enter their exact student number, check the name, then
          add.
        </AppText>
        <Row style={{ alignItems: 'flex-end' }}>
          <TextField
            label="Student number"
            value={studentNumber}
            onChangeText={(v) => {
              setStudentNumber(v);
              setFound(null);
            }}
            autoCapitalize="characters"
            onSubmitEditing={() => studentNumber.trim() && lookup.mutate()}
            containerStyle={{ flex: 1 }}
          />
          <Button
            title="Find"
            variant="secondary"
            disabled={!studentNumber.trim()}
            loading={lookup.isPending}
            onPress={() => lookup.mutate()}
          />
        </Row>
        {lookupError ? <Banner tone="danger" message={lookupError} /> : null}
        {found ? (
          <Card>
            <AppText variant="subtitle">{found.fullName}</AppText>
            <AppText variant="small">
              {found.studentNumber}
              {found.yearLevel ? ` · ${found.yearLevel}` : ''}
            </AppText>
            <Button
              title="Enroll in this class"
              icon="person-add-outline"
              loading={enroll.isPending}
              onPress={() => enroll.mutate(found)}
            />
          </Card>
        ) : null}
      </Section>

      <Section title={`Enrolled (${students.data?.length ?? 0})`}>
        <QueryView
          query={students}
          empty={<EmptyState icon="people-outline" title="No students enrolled yet" />}
        >
          {(list) =>
            list.map((e) => (
              <Card key={e.id} style={{ paddingVertical: spacing.md }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <AppText style={{ flex: 1 }}>
                    {e.student.lastName}, {e.student.firstName}
                  </AppText>
                  <Button
                    title="Remove"
                    variant="ghost"
                    onPress={async () => {
                      if (
                        await confirm(
                          'Remove student?',
                          `${e.student.fullName} will leave this class. Past attendance is kept.`,
                          'Remove',
                          true,
                        )
                      ) {
                        drop.mutate(e.student.id);
                      }
                    }}
                  />
                </Row>
                <AppText variant="small">{e.student.studentNumber}</AppText>
              </Card>
            ))
          }
        </QueryView>
      </Section>
    </Screen>
  );
}
