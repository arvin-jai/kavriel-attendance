import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';

import { sessionsApi } from '@/api/endpoints';
import { QueryView, SessionCard } from '@/components/common';
import { Button, Chips, EmptyState, ErrorState, LoadingState, Screen } from '@/components/ui';
import { errorMessage } from '@/api/errors';

export default function AttendanceTab() {
  const [tab, setTab] = useState<'active' | 'history'>('active');
  const active = useQuery({
    queryKey: ['sessions', 'ACTIVE'],
    queryFn: () => sessionsApi.list({ status: 'ACTIVE', limit: 20 }),
    refetchInterval: 15_000,
  });
  const history = useInfiniteQuery({
    queryKey: ['sessions', 'history'],
    queryFn: ({ pageParam }) => sessionsApi.list({ cursor: pageParam, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: tab === 'history',
  });

  const open = (id: string) => router.push({ pathname: '/teacher/session/[id]', params: { id } });
  const historyItems =
    history.data?.pages.flatMap((p) => p.items).filter((s) => s.status !== 'ACTIVE') ?? [];

  return (
    <Screen
      onRefresh={() => (tab === 'active' ? active.refetch() : history.refetch())}
      refreshing={
        tab === 'active' ? active.isRefetching : history.isRefetching && !history.isFetchingNextPage
      }
    >
      <Button title="Start attendance" icon="play" onPress={() => router.push('/teacher/start')} />
      <Button
        title="Reports & export"
        variant="secondary"
        icon="bar-chart-outline"
        onPress={() => router.push('/teacher/reports')}
      />
      <Chips
        options={[
          { value: 'active', label: 'Active' },
          { value: 'history', label: 'History' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'active' ? (
        <QueryView
          query={active}
          isEmpty={(d) => d.items.length === 0}
          empty={
            <EmptyState
              icon="radio-button-off-outline"
              title="No active attendance"
              message="Start attendance from Home or a class."
            />
          }
        >
          {(page) =>
            page.items.map((s) => <SessionCard key={s.id} session={s} onPress={() => open(s.id)} />)
          }
        </QueryView>
      ) : history.isPending ? (
        <LoadingState />
      ) : history.isError ? (
        <ErrorState message={errorMessage(history.error)} onRetry={() => history.refetch()} />
      ) : historyItems.length === 0 ? (
        <EmptyState icon="time-outline" title="No past sessions yet" />
      ) : (
        <>
          {historyItems.map((s) => (
            <SessionCard key={s.id} session={s} onPress={() => open(s.id)} />
          ))}
          {history.hasNextPage ? (
            <Button
              title="Load more"
              variant="ghost"
              loading={history.isFetchingNextPage}
              onPress={() => history.fetchNextPage()}
            />
          ) : null}
        </>
      )}
    </Screen>
  );
}
