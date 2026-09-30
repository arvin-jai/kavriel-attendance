import type { AttendanceStatus, ScheduleDto, SessionDto, SessionStatus } from '@kavriel/shared';
import { Ionicons } from '@expo/vector-icons';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { errorMessage } from '@/api/errors';
import { DAY_SHORT, formatClock, formatDateTime } from '@/lib/format';
import { attendanceTone, colors, sessionTone, spacing } from '@/theme';

import { AppText, Badge, Card, EmptyState, ErrorState, Row, Skeleton } from './ui';

/** Placeholder rows shaped like the lists they stand in for. */
export function SkeletonList({ rows = 3, height = 76 }: { rows?: number; height?: number }) {
  return (
    <View style={{ gap: spacing.md }} accessibilityLabel="Loading" accessibilityLiveRegion="polite">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={height} />
      ))}
    </View>
  );
}

/**
 * Render loading / error / empty / data states for a query in one place, so every screen
 * handles all of them consistently.
 */
export function QueryView<T>({
  query,
  empty,
  isEmpty = (d) => Array.isArray(d) && d.length === 0,
  children,
}: {
  query: UseQueryResult<T>;
  empty?: ReactNode;
  isEmpty?: (data: T) => boolean;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) return <SkeletonList />;
  if (query.isError && query.data === undefined) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;
  }
  const data = query.data as T;
  if (empty && isEmpty(data)) return <>{empty}</>;
  return <>{children(data)}</>;
}

/** Icon plus word for every attendance status, so it never relies on colour alone. */
export function StatusBadge({ status }: { status: AttendanceStatus | null }) {
  if (!status) {
    return (
      <Badge label="Not yet" fg={colors.textMuted} bg={colors.border} icon="ellipsis-horizontal" />
    );
  }
  const t = attendanceTone[status];
  return <Badge label={t.label} fg={t.fg} bg={t.bg} icon={t.icon} />;
}

/** @deprecated Use StatusBadge. Kept so existing screens keep compiling. */
export const AttendanceBadge = StatusBadge;

export function SessionBadge({ status }: { status: SessionStatus }) {
  const t = sessionTone[status];
  return <Badge label={t.label} fg={t.fg} bg={t.bg} />;
}

export function ScheduleCard({
  schedule,
  showDay = false,
  footer,
  onPress,
}: {
  schedule: ScheduleDto;
  showDay?: boolean;
  footer?: ReactNode;
  onPress?: () => void;
}) {
  return (
    <Card onPress={onPress}>
      <View style={{ gap: 2 }}>
        <AppText variant="small">
          {showDay ? `${DAY_SHORT[schedule.dayOfWeek]} · ` : ''}
          {formatClock(schedule.startTime)} – {formatClock(schedule.endTime)}
        </AppText>
        <AppText variant="subtitle">{schedule.class.subject.subjectName}</AppText>
        <Row style={{ gap: spacing.xs, flexWrap: 'wrap' }}>
          <AppText variant="small">
            {schedule.class.classCode} · {schedule.class.sectionName}
          </AppText>
          {schedule.room ? (
            <Row style={{ gap: 2 }}>
              <Ionicons name="location-outline" size={14} color={colors.textMuted} />
              <AppText variant="small">{schedule.room}</AppText>
            </Row>
          ) : null}
        </Row>
      </View>
      {footer}
    </Card>
  );
}

const COUNT_ORDER = ['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'] as const;

export function SessionCard({ session, onPress }: { session: SessionDto; onPress?: () => void }) {
  const { counts } = session;
  return (
    <Card onPress={onPress}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="subtitle" numberOfLines={1}>
            {session.class.subject.subjectName}
          </AppText>
          <AppText variant="small">
            {session.class.classCode} · {session.class.sectionName} ·{' '}
            {formatDateTime(session.startedAt)}
          </AppText>
        </View>
        <SessionBadge status={session.status} />
      </Row>
      <Row style={{ gap: spacing.xs, flexWrap: 'wrap' }}>
        {COUNT_ORDER.map((k) => {
          const t = attendanceTone[k];
          return (
            <Badge key={k} label={`${counts[k]} ${t.label}`} fg={t.fg} bg={t.bg} icon={t.icon} />
          );
        })}
      </Row>
    </Card>
  );
}

export function EmptyHint({ title, message }: { title: string; message?: string }) {
  return (
    <View>
      <EmptyState title={title} message={message} />
    </View>
  );
}
