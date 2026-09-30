import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { errorMessage } from '@/api/errors';
import { studentAttendanceApi } from '@/api/endpoints';
import { AttendanceBadge, SkeletonList } from '@/components/common';
import { InitialTile, ListGroup, ListRow } from '@/components/patterns';
import { AppText, Button, EmptyState, ErrorState, Screen, Section } from '@/components/ui';
import { copy } from '@/copy';
import { formatDate, formatTime, percent } from '@/lib/format';
import { colors } from '@/theme';

export default function StudentAttendanceTab() {
  const summary = useQuery({
    queryKey: ['my', 'summary'],
    queryFn: () => studentAttendanceApi.summary(),
  });
  const history = useInfiniteQuery({
    queryKey: ['my', 'history'],
    queryFn: ({ pageParam }) => studentAttendanceApi.my({ cursor: pageParam, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = history.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <Screen
      onRefresh={() => {
        void summary.refetch();
        void history.refetch();
      }}
      refreshing={history.isRefetching && !history.isFetchingNextPage}
    >
      {summary.data && summary.data.length > 0 ? (
        <Section title="By class">
          <ListGroup>
            {summary.data.map((r) => (
              <ListRow
                key={r.class.id}
                leading={<InitialTile label={r.class.subject.subjectName} />}
                title={r.class.subject.subjectName}
                subtitle={`Present ${r.counts.PRESENT} · Late ${r.counts.LATE} · Absent ${r.counts.ABSENT} · Excused ${r.counts.EXCUSED}`}
                right={
                  <AppText variant="title" style={{ color: colors.primaryDark }}>
                    {percent(r.percentage)}
                  </AppText>
                }
              />
            ))}
          </ListGroup>
        </Section>
      ) : null}

      <Section title="History">
        {history.isPending ? (
          <SkeletonList />
        ) : history.isError ? (
          <ErrorState message={errorMessage(history.error)} onRetry={() => history.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            icon="time-outline"
            title={copy.empty.studentHistory}
            message={copy.empty.studentHistoryText}
          />
        ) : (
          <>
            <ListGroup>
              {items.map((a) => (
                <ListRow
                  key={a.id}
                  title={a.session.class.subject.subjectName}
                  subtitle={`${formatDate(a.session.startedAt)}${a.checkInTime ? ` · ${formatTime(a.checkInTime)}` : ''}`}
                  meta={a.remarks ? `“${a.remarks}”` : undefined}
                  right={<AttendanceBadge status={a.status} />}
                />
              ))}
            </ListGroup>
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
      </Section>
    </Screen>
  );
}
