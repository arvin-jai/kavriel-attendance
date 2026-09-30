import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';

import { sessionsApi } from '@/api/endpoints';
import { QueryView, SessionCard } from '@/components/common';
import { ActionRow, ListGroup, SegmentedControl } from '@/components/patterns';
import { Button, EmptyState, ErrorState, LoadingState, Screen } from '@/components/ui';
import { errorMessage } from '@/api/errors';
import { copy } from '@/copy';

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
      footer={
        <Button
          title="Start attendance"
          icon="play"
          size="lg"
          onPress={() => router.push('/teacher/start')}
        />
      }
      onRefresh={() => (tab === 'active' ? active.refetch() : history.refetch())}
      refreshing={
        tab === 'active' ? active.isRefetching : history.isRefetching && !history.isFetchingNextPage
      }
    >
      <SegmentedControl
        options={[
          { value: 'active', label: 'Active' },
          { value: 'history', label: 'History' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <ListGroup>
        <ActionRow
          icon="bar-chart-outline"
          title="Reports and export"
          onPress={() => router.push('/teacher/reports')}
        />
      </ListGroup>

      {tab === 'active' ? (
        <QueryView
          query={active}
          isEmpty={(d) => d.items.length === 0}
          empty={
            <EmptyState
              icon="radio-button-off-outline"
              title={copy.empty.activeSessions}
              message={copy.empty.activeSessionsText}
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
