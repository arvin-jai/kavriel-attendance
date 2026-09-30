import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';

import { classesApi } from '@/api/endpoints';
import { useStudent } from '@/auth/AuthProvider';
import { QueryView } from '@/components/common';
import { InitialTile, ListGroup, ListRow } from '@/components/patterns';
import { EmptyState, Screen } from '@/components/ui';
import { copy } from '@/copy';

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
            title={copy.empty.studentClasses}
            message={copy.empty.studentClassesText(student.profile.studentNumber)}
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
                subtitle={`${c.teacher.fullName} · ${c.classCode}`}
                meta={`${c.sectionName} · ${c.semester.name} ${c.semester.academicYear}`}
                onPress={() =>
                  router.push({ pathname: '/student/class/[id]', params: { id: c.id } })
                }
              />
            ))}
          </ListGroup>
        )}
      </QueryView>
    </Screen>
  );
}
