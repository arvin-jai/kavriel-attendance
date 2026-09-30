import { ATTENDANCE_STATUSES, type AttendanceStatus, type RosterEntryDto } from '@kavriel/shared';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { errorMessage } from '@/api/errors';
import { sessionsApi } from '@/api/endpoints';
import { BottomSheet } from '@/components/BottomSheet';
import { AttendanceBadge, SessionBadge, SkeletonList } from '@/components/common';
import { InitialTile, ListGroup, ListRow, SegmentedBar } from '@/components/patterns';
import { useSnackbar } from '@/components/Snackbar';
import {
  AppText,
  Badge,
  Banner,
  Button,
  ErrorState,
  Row,
  Screen,
  Section,
  TextField,
} from '@/components/ui';
import { useLiveRecords } from '@/features/attendance/useLiveRecords';
import { confirm, notify } from '@/lib/confirm';
import { formatDateTime, formatTime } from '@/lib/format';
import { attendanceTone, colors, radius, spacing } from '@/theme';

const ORDER = ['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'] as const;
const BAR = {
  PRESENT: colors.presentFg,
  LATE: colors.warning,
  ABSENT: colors.absentFg,
  EXCUSED: colors.excusedFg,
} as const;

/** Review and correct one session. Corrections save from a bottom sheet and can be undone. */
export default function SessionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const snack = useSnackbar();
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

  const undo = useMutation({
    mutationFn: (v: { recordId: string; status: AttendanceStatus; remarks: string | null }) =>
      sessionsApi.updateRecord(v.recordId, { status: v.status, remarks: v.remarks }),
    onSuccess: refreshAll,
    onError: (err) => snack({ message: `Couldn't undo. ${errorMessage(err)}` }),
  });

  if (session.isPending) {
    return (
      <Screen>
        <SkeletonList />
      </Screen>
    );
  }
  if (session.isError)
    return <ErrorState message={errorMessage(session.error)} onRetry={() => session.refetch()} />;

  const s = session.data;
  const counts = live.data?.counts ?? s.counts;
  const editable = s.status === 'ACTIVE' || s.status === 'ENDED';

  return (
    <Screen onRefresh={refreshAll} refreshing={session.isRefetching}>
      <Stack.Screen options={{ title: s.class.classCode }} />

      <View style={styles.hero}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="title" style={{ color: colors.onSky }}>
              {s.class.subject.subjectName}
            </AppText>
            <AppText variant="small" style={{ color: colors.onSky }}>
              {s.class.classCode} · {s.class.sectionName}
            </AppText>
            <AppText variant="small" style={{ color: colors.onSky }}>
              Started {formatDateTime(s.startedAt)}
              {s.endedAt ? ` · ended ${formatTime(s.endedAt)}` : ''}
            </AppText>
          </View>
          <SessionBadge status={s.status} />
        </Row>
        <SegmentedBar
          parts={ORDER.map((k) => ({
            value: counts[k],
            color: BAR[k],
            label: attendanceTone[k].label.toLowerCase(),
          }))}
        />
        <Row style={{ gap: spacing.xs, flexWrap: 'wrap' }}>
          {ORDER.map((k) => (
            <Badge
              key={k}
              label={`${counts[k]} ${attendanceTone[k].label}`}
              fg={attendanceTone[k].fg}
              bg={attendanceTone[k].bg}
              icon={attendanceTone[k].icon}
            />
          ))}
        </Row>
      </View>

      {s.status === 'ACTIVE' ? (
        <Row>
          <Button
            title="Show QR"
            icon="qr-code-outline"
            size="lg"
            style={{ flex: 1 }}
            onPress={() => router.push({ pathname: '/teacher/session/[id]/qr', params: { id } })}
          />
          <Button
            title="End"
            variant="secondary"
            size="lg"
            style={{ flex: 1 }}
            loading={end.isPending}
            onPress={async () => {
              if (
                await confirm(
                  'End attendance?',
                  'Students without a record will be marked absent. You can still correct records before locking.',
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
            message="Tap a student to correct their record. Lock attendance when you are done."
          />
          <Button
            title="Lock attendance"
            icon="lock-closed-outline"
            size="lg"
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
        {live.loading && !live.data ? <SkeletonList /> : null}
        {live.data ? (
          <ListGroup>
            {live.data.entries.map((e) => (
              <ListRow
                key={e.student.id}
                leading={
                  <InitialTile label={`${e.student.firstName} ${e.student.lastName}`} size={40} />
                }
                title={`${e.student.lastName}, ${e.student.firstName}`}
                subtitle={`${e.student.studentNumber}${e.record?.checkInTime ? ` · scanned ${formatTime(e.record.checkInTime)}` : ''}${e.record?.source === 'MANUAL' ? ' · marked by you' : ''}`}
                meta={e.record?.remarks ? `“${e.record.remarks}”` : undefined}
                right={<AttendanceBadge status={e.record?.status ?? null} />}
                onPress={editable ? () => setEditing(e) : undefined}
              />
            ))}
          </ListGroup>
        ) : null}
      </Section>

      <EditRecordSheet
        sessionId={id}
        entry={editing}
        onClose={() => setEditing(null)}
        onSaved={(result) => {
          setEditing(null);
          void refreshAll();
          const label = attendanceTone[result.status].label;
          const before = result.before;
          snack({
            message: `${result.name} set to ${label}`,
            // A record that did not exist yet cannot be un-created, so only edits get Undo.
            actionLabel: before ? 'Undo' : undefined,
            onAction: before ? () => undo.mutate(before) : undefined,
          });
        }}
      />
    </Screen>
  );
}

interface SavedResult {
  name: string;
  status: AttendanceStatus;
  before: { recordId: string; status: AttendanceStatus; remarks: string | null } | null;
}

function EditRecordSheet({
  sessionId,
  entry,
  onClose,
  onSaved,
}: {
  sessionId: string;
  entry: RosterEntryDto | null;
  onClose: () => void;
  onSaved: (result: SavedResult) => void;
}) {
  const [status, setStatus] = useState<AttendanceStatus | undefined>();
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Reset the form whenever a different student is opened.
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
    onSuccess: () => {
      if (!entry || !status) return;
      onSaved({
        name: entry.student.fullName,
        status,
        before: entry.record
          ? {
              recordId: entry.record.id,
              status: entry.record.status,
              remarks: entry.record.remarks ?? null,
            }
          : null,
      });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <BottomSheet visible={entry !== null} onClose={onClose}>
      <Row style={{ gap: spacing.md }}>
        <InitialTile
          label={entry ? `${entry.student.firstName} ${entry.student.lastName}` : ''}
          size={44}
        />
        <View style={{ flex: 1 }}>
          <AppText variant="subtitle">{entry?.student.fullName}</AppText>
          <AppText variant="small">
            {entry?.student.studentNumber}
            {entry?.record
              ? ` · now ${attendanceTone[entry.record.status].label}`
              : ' · no record yet'}
          </AppText>
        </View>
      </Row>
      {error ? <Banner tone="danger" message={error} /> : null}
      <View style={styles.options}>
        {ATTENDANCE_STATUSES.map((k) => {
          const t = attendanceTone[k];
          const on = status === k;
          return (
            <Pressable
              key={k}
              onPress={() => setStatus(k)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={[styles.option, on && styles.optionOn]}
            >
              <Ionicons name={t.icon} size={20} color={on ? colors.primaryDark : t.fg} />
              <AppText style={{ fontWeight: on ? '700' : '400' }}>{t.label}</AppText>
            </Pressable>
          );
        })}
      </View>
      <TextField
        label="Remarks (optional)"
        value={remarks}
        onChangeText={setRemarks}
        placeholder="e.g. Medical certificate"
      />
      <Button
        title="Save"
        size="lg"
        disabled={!status}
        loading={save.isPending}
        onPress={() => save.mutate()}
      />
      <Button title="Cancel" variant="ghost" onPress={onClose} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.sky,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.md,
  },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: {
    flexBasis: '48%',
    flexGrow: 1,
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionOn: { borderColor: colors.primary, backgroundColor: colors.primaryContainer },
});
