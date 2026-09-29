import { ATTENDANCE_STATUSES, type AttendanceStatus, type RosterEntryDto } from '@kavriel/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, View } from 'react-native';

import { errorMessage } from '@/api/errors';
import { sessionsApi } from '@/api/endpoints';
import { AttendanceBadge, SessionBadge } from '@/components/common';
import {
  AppText,
  Banner,
  Button,
  Card,
  Chips,
  ErrorState,
  LoadingState,
  Row,
  Screen,
  Section,
  Stat,
  TextField,
} from '@/components/ui';
import { useLiveRecords } from '@/features/attendance/useLiveRecords';
import { confirm, notify } from '@/lib/confirm';
import { formatDateTime, formatTime } from '@/lib/format';
import { attendanceTone, colors, radius, spacing } from '@/theme';

export default function SessionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const session = useQuery({ queryKey: ['session', id], queryFn: () => sessionsApi.get(id) });
  const status = session.data?.status;
  const live = useLiveRecords(id, status === 'ACTIVE' ? 3_000 : false);
  const [editing, setEditing] = useState<RosterEntryDto | null>(null);

  const refreshAll = async () => {
    await Promise.all([session.refetch(), live.reload()]);
    void qc.invalidateQueries({ queryKey: ['sessions'] });
  };

  const end = useMutation({
    mutationFn: () => sessionsApi.end(id),
    onSuccess: refreshAll,
    onError: (err) => notify("Couldn't end attendance", errorMessage(err)),
  });
  const lock = useMutation({
    mutationFn: () => sessionsApi.lock(id),
    onSuccess: refreshAll,
    onError: (err) => notify("Couldn't lock attendance", errorMessage(err)),
  });

  if (session.isPending) return <LoadingState />;
  if (session.isError)
    return <ErrorState message={errorMessage(session.error)} onRetry={() => session.refetch()} />;

  const s = session.data;
  const counts = live.data?.counts ?? s.counts;
  const editable = s.status === 'ACTIVE' || s.status === 'ENDED';

  return (
    <Screen onRefresh={refreshAll} refreshing={session.isRefetching}>
      <Stack.Screen options={{ title: s.class.classCode }} />
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <AppText variant="subtitle" style={{ flex: 1 }}>
            {s.class.subject.subjectName}
          </AppText>
          <SessionBadge status={s.status} />
        </Row>
        <AppText variant="small">
          {s.class.classCode} · {s.class.sectionName} · started {formatDateTime(s.startedAt)}
          {s.endedAt ? ` · ended ${formatTime(s.endedAt)}` : ''}
        </AppText>
      </Card>

      <Row>
        <Stat label="Present" value={counts.PRESENT} tone={colors.success} />
        <Stat label="Late" value={counts.LATE} tone={colors.warning} />
        <Stat label="Absent" value={counts.ABSENT} tone={colors.danger} />
        <Stat label="Excused" value={counts.EXCUSED} tone={colors.info} />
      </Row>

      {s.status === 'ACTIVE' ? (
        <Row>
          <Button
            title="Show QR"
            icon="qr-code-outline"
            style={{ flex: 1 }}
            onPress={() => router.push({ pathname: '/teacher/session/[id]/qr', params: { id } })}
          />
          <Button
            title="End"
            variant="danger"
            style={{ flex: 1 }}
            loading={end.isPending}
            onPress={async () => {
              if (
                await confirm(
                  'End attendance?',
                  'Students without a record will be marked absent.',
                  'End',
                  true,
                )
              )
                end.mutate();
            }}
          />
        </Row>
      ) : null}
      {s.status === 'ENDED' ? (
        <>
          <Banner
            tone="info"
            message="Review and correct records, then lock the session to make it final."
          />
          <Button
            title="Lock attendance"
            icon="lock-closed-outline"
            loading={lock.isPending}
            onPress={async () => {
              if (
                await confirm(
                  'Lock attendance?',
                  'Locked records can no longer be changed by anyone.',
                  'Lock',
                )
              )
                lock.mutate();
            }}
          />
        </>
      ) : null}
      {s.status === 'LOCKED' ? (
        <Banner tone="info" message="This session is locked and read-only." />
      ) : null}

      <Section title={`Students (${live.data?.entries.length ?? 0})`}>
        {live.error && !live.data ? (
          <ErrorState message={errorMessage(live.error)} onRetry={live.reload} />
        ) : null}
        {live.loading && !live.data ? <LoadingState /> : null}
        {live.data?.entries.map((e) => (
          <Card
            key={e.student.id}
            onPress={editable ? () => setEditing(e) : undefined}
            style={{ paddingVertical: spacing.md }}
          >
            <Row style={{ justifyContent: 'space-between' }}>
              <AppText style={{ flex: 1 }}>
                {e.student.lastName}, {e.student.firstName}
              </AppText>
              <AttendanceBadge status={e.record?.status ?? null} />
            </Row>
            <AppText variant="small">
              {e.student.studentNumber}
              {e.record?.checkInTime ? ` · scanned ${formatTime(e.record.checkInTime)}` : ''}
              {e.record?.source === 'MANUAL' ? ' · marked by you' : ''}
            </AppText>
            {e.record?.remarks ? <AppText variant="small">“{e.record.remarks}”</AppText> : null}
          </Card>
        ))}
      </Section>

      <EditRecordModal
        sessionId={id}
        entry={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void refreshAll();
        }}
      />
    </Screen>
  );
}

function EditRecordModal({
  sessionId,
  entry,
  onClose,
  onSaved,
}: {
  sessionId: string;
  entry: RosterEntryDto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<AttendanceStatus | undefined>();
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Reset the form whenever a different student is opened (before the sheet animates in).
  useEffect(() => {
    setStatus(entry?.record?.status);
    setRemarks(entry?.record?.remarks ?? '');
    setError(null);
  }, [entry]);

  const save = useMutation({
    mutationFn: () => {
      if (!entry || !status) throw new Error('Choose a status');
      return entry.record
        ? sessionsApi.updateRecord(entry.record.id, { status, remarks: remarks.trim() || null })
        : sessionsApi.markStudent(sessionId, entry.student.id, {
            status,
            remarks: remarks.trim() || undefined,
          });
    },
    onSuccess: onSaved,
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <Modal visible={entry !== null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.4)' }}>
        <View
          style={{
            backgroundColor: colors.surface,
            padding: spacing.xl,
            gap: spacing.md,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
          }}
        >
          <AppText variant="subtitle">{entry?.student.fullName}</AppText>
          <AppText variant="small">{entry?.student.studentNumber}</AppText>
          {error ? <Banner tone="danger" message={error} /> : null}
          <Chips
            options={ATTENDANCE_STATUSES.map((s) => ({ value: s, label: attendanceTone[s].label }))}
            value={status}
            onChange={setStatus}
          />
          <TextField
            label="Remarks (optional)"
            value={remarks}
            onChangeText={setRemarks}
            placeholder="e.g. Medical certificate"
          />
          <Button
            title="Save"
            disabled={!status}
            loading={save.isPending}
            onPress={() => save.mutate()}
          />
          <Button title="Cancel" variant="ghost" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}
