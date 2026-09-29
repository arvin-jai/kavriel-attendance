import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';

import { schedulesApi } from '@/api/endpoints';
import { QueryView } from '@/components/common';
import { Button, Screen } from '@/components/ui';
import { WeekSchedule } from '@/components/WeekSchedule';

export default function TeacherScheduleTab() {
  const schedules = useQuery({ queryKey: ['schedules'], queryFn: () => schedulesApi.list() });
  return (
    <Screen onRefresh={() => schedules.refetch()} refreshing={schedules.isRefetching}>
      <Button
        title="Add schedule"
        icon="add"
        onPress={() => router.push('/teacher/schedule-form')}
      />
      <QueryView query={schedules}>
        {(list) => (
          <WeekSchedule
            schedules={list}
            onPressSchedule={(s) =>
              router.push({ pathname: '/teacher/schedule-form', params: { id: s.id } })
            }
          />
        )}
      </QueryView>
    </Screen>
  );
}
