import { useQuery } from '@tanstack/react-query';

import { schedulesApi } from '@/api/endpoints';
import { QueryView } from '@/components/common';
import { Screen } from '@/components/ui';
import { WeekSchedule } from '@/components/WeekSchedule';

export default function StudentScheduleTab() {
  const schedules = useQuery({ queryKey: ['schedules'], queryFn: () => schedulesApi.list() });
  return (
    <Screen onRefresh={() => schedules.refetch()} refreshing={schedules.isRefetching}>
      <QueryView query={schedules}>{(list) => <WeekSchedule schedules={list} />}</QueryView>
    </Screen>
  );
}
