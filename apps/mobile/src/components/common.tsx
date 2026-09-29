import type { AttendanceStatus, ScheduleDto, SessionDto, SessionStatus } from '@kavriel/shared';
import { Ionicons } from '@expo/vector-icons';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { errorMessage } from '@/api/errors';
import { DAY_SHORT, formatClock, formatDateTime } from '@/lib/format';
import { attendanceTone, colors, sessionTone, spacing } from '@/theme';

import { AppText, Badge, Card, EmptyState, ErrorState, LoadingState, Row } from './ui';

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
  if (query.isPending) return <LoadingState />;
  if (query.isError && query.data === undefined) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;
  }
  const data = query.data as T;
  if (empty && isEmpty(data)) return <>{empty}</>;
  return <>{children(data)}</>;
}

export function AttendanceBadge({ status }: { status: AttendanceStatus | null }) {
  if (!status) return <Badge label="Not yet" fg={colors.textMuted} bg={colors.border} />;
  const t = attendanceTone[status];
  return <Badge label={t.label} fg={t.fg} bg={t.bg} />;
}

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
      <Row style={{ justifyContent: 'space-between' }}>
        <AppText variant="subtitle">
          {showDay ? `${DAY_SHORT[schedule.dayOfWeek]} · ` : ''}
          {formatClock(schedule.startTime)} – {formatClock(schedule.endTime)}
        </AppText>
        {schedule.room ? (
          <Row style={{ gap: spacing.xs }}>
            <Ionicons name="location-outline" size={14} color={colors.textMuted} />
            <AppText variant="small">{schedule.room}</AppText>
          </Row>
        ) : null}
      </Row>
      <AppText>{schedule.class.subject.subjectName}</AppText>
      <AppText variant="small">
        {schedule.class.classCode} · {schedule.class.sectionName}
      </AppText>
      {footer}
    </Card>
  );
}

export function SessionCard({ session, onPress }: { session: SessionDto; onPress?: () => void }) {
  const { counts } = session;
  return (
    <Card onPress={onPress}>
      <Row style={{ justifyContent: 'space-between' }}>
        <AppText variant="subtitle" style={{ flex: 1 }} numberOfLines={1}>
          {session.class.subject.subjectName}
        </AppText>
        <SessionBadge status={session.status} />
      </Row>
      <AppText variant="small">
        {session.class.classCode} · {session.class.sectionName} ·{' '}
        {formatDateTime(session.startedAt)}
      </AppText>
      <Row style={{ gap: spacing.md }}>
        <AppText variant="small">Present {counts.PRESENT}</AppText>
        <AppText variant="small">Late {counts.LATE}</AppText>
        <AppText variant="small">Absent {counts.ABSENT}</AppText>
        <AppText variant="small">Excused {counts.EXCUSED}</AppText>
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
