import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';

import { classesApi } from '@/api/endpoints';
import { useStudent } from '@/auth/AuthProvider';
import { QueryView } from '@/components/common';
import { AppText, Card, EmptyState, Screen } from '@/components/ui';

export default function MyClasses() {
  const student = useStudent();
  const classes = useQuery({ queryKey: ['classes', {}], queryFn: () => classesApi.list() });

  return (
    <Screen onRefresh={() => classes.refetch()} refreshing={classes.isRefetching}>
      <QueryView
        query={classes}
        empty={
          <EmptyState
            icon="people-outline"
            title="You're not in any class yet"
            message={`Ask your teacher to enroll you with your student number ${student.profile.studentNumber}.`}
          />
        }
      >
        {(list) =>
          list.map((c) => (
            <Card
              key={c.id}
              onPress={() => router.push({ pathname: '/student/class/[id]', params: { id: c.id } })}
            >
              <AppText variant="subtitle">{c.subject.subjectName}</AppText>
              <AppText variant="small">
                {c.classCode} · {c.sectionName} · {c.teacher.fullName}
              </AppText>
              <AppText variant="small">
                {c.semester.name} {c.semester.academicYear}
              </AppText>
            </Card>
          ))
        }
      </QueryView>
    </Screen>
  );
}
