import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { errorMessage } from '@/api/errors';
import { studentAttendanceApi } from '@/api/endpoints';
import { AttendanceBadge } from '@/components/common';
import {
  AppText,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Row,
  Screen,
  Section,
} from '@/components/ui';
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
      <Section title="By class">
        {summary.data?.map((r) => (
          <Card key={r.class.id}>
            <Row style={{ justifyContent: 'space-between' }}>
              <AppText style={{ flex: 1 }}>{r.class.subject.subjectName}</AppText>
              <AppText variant="subtitle" style={{ color: colors.primary }}>
                {percent(r.percentage)}
              </AppText>
            </Row>
            <AppText variant="small">
              Present {r.counts.PRESENT} · Late {r.counts.LATE} · Absent {r.counts.ABSENT} · Excused{' '}
              {r.counts.EXCUSED}
            </AppText>
          </Card>
        ))}
      </Section>

      <Section title="History">
        {history.isPending ? (
          <LoadingState />
        ) : history.isError ? (
          <ErrorState message={errorMessage(history.error)} onRetry={() => history.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState icon="time-outline" title="No attendance records yet" />
        ) : (
          <>
            {items.map((a) => (
              <Card key={a.id}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <AppText style={{ flex: 1 }}>{a.session.class.subject.subjectName}</AppText>
                  <AttendanceBadge status={a.status} />
                </Row>
                <AppText variant="small">
                  {a.session.class.classCode} · {formatDate(a.session.startedAt)}
                  {a.checkInTime ? ` · ${formatTime(a.checkInTime)}` : ''}
                </AppText>
                {a.remarks ? <AppText variant="small">“{a.remarks}”</AppText> : null}
              </Card>
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
      </Section>
    </Screen>
  );
}
