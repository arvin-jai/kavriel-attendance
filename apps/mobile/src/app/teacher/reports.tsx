import { ATTENDANCE_STATUSES, type AttendanceStatus } from '@kavriel/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';

import { errorMessage } from '@/api/errors';
import { classesApi, reportsApi } from '@/api/endpoints';
import { QueryView } from '@/components/common';
import { InitialTile, ListGroup, ListRow } from '@/components/patterns';
import {
  AppText,
  Banner,
  Button,
  Chips,
  EmptyState,
  Row,
  Screen,
  Section,
  TextField,
} from '@/components/ui';
import { shareCsv } from '@/features/reports/shareCsv';
import { formatDateTime, percent } from '@/lib/format';
import { attendanceTone, colors } from '@/theme';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default function ReportsScreen() {
  const classes = useQuery({ queryKey: ['classes', {}], queryFn: () => classesApi.list() });
  const [classId, setClassId] = useState<string | undefined>();
  const [groupBy, setGroupBy] = useState<'student' | 'session'>('student');
  const [status, setStatus] = useState<AttendanceStatus | undefined>();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const dateError = (from && !DATE.test(from)) || (to && !DATE.test(to)) ? 'Use YYYY-MM-DD' : null;
  const filters = {
    classId,
    groupBy,
    status,
    from: DATE.test(from) ? from : undefined,
    to: DATE.test(to) ? to : undefined,
  };

  const report = useQuery({
    queryKey: ['report', filters],
    queryFn: () => reportsApi.get(filters),
    enabled: !dateError,
  });

  const exportCsv = useMutation({
    mutationFn: async () => {
      const csv = await reportsApi.csv(filters);
      await shareCsv(csv, `attendance-${groupBy}-${new Date().toISOString().slice(0, 10)}.csv`);
    },
  });

  return (
    <Screen onRefresh={() => report.refetch()} refreshing={report.isRefetching}>
      <Stack.Screen options={{ title: 'Reports' }} />
      <AppText variant="small">Counts closed (ended or locked) sessions only.</AppText>

      <Section title="Filters">
        <AppText variant="label">Class</AppText>
        <Chips
          options={[
            { value: 'all', label: 'All classes' },
            ...(classes.data ?? []).map((c) => ({ value: c.id, label: c.classCode })),
          ]}
          value={classId ?? 'all'}
          onChange={(v) => setClassId(v === 'all' ? undefined : v)}
        />
        <AppText variant="label">Group by</AppText>
        <Chips
          options={[
            { value: 'student', label: 'Student' },
            { value: 'session', label: 'Session (daily)' },
          ]}
          value={groupBy}
          onChange={setGroupBy}
        />
        <AppText variant="label">Status</AppText>
        <Chips
          options={[
            { value: 'ALL', label: 'All' },
            ...ATTENDANCE_STATUSES.map((s) => ({ value: s, label: attendanceTone[s].label })),
          ]}
          value={status ?? 'ALL'}
          onChange={(v) => setStatus(v === 'ALL' ? undefined : (v as AttendanceStatus))}
        />
        <Row>
          <TextField
            label="From"
            placeholder="2026-08-01"
            value={from}
            onChangeText={setFrom}
            containerStyle={{ flex: 1 }}
          />
          <TextField
            label="To"
            placeholder="2026-12-20"
            value={to}
            onChangeText={setTo}
            containerStyle={{ flex: 1 }}
          />
        </Row>
        {dateError ? <Banner tone="warning" message={dateError} /> : null}
      </Section>

      <Button
        title="Export CSV"
        icon="download-outline"
        variant="tonal"
        size="lg"
        loading={exportCsv.isPending}
        disabled={!!dateError}
        onPress={() => exportCsv.mutate()}
      />
      {exportCsv.isError ? <Banner tone="danger" message={errorMessage(exportCsv.error)} /> : null}

      <QueryView
        query={report}
        isEmpty={(d) => d.rows.length === 0}
        empty={<EmptyState icon="bar-chart-outline" title="No attendance matches these filters" />}
      >
        {(data) => (
          <ListGroup>
            {data.groupBy === 'student'
              ? data.rows.map((r) => (
                  <ListRow
                    key={r.student.id}
                    leading={
                      <InitialTile
                        label={`${r.student.firstName} ${r.student.lastName}`}
                        size={40}
                      />
                    }
                    title={`${r.student.lastName}, ${r.student.firstName}`}
                    subtitle={`${r.student.studentNumber}`}
                    meta={`Present ${r.counts.PRESENT} · Late ${r.counts.LATE} · Absent ${r.counts.ABSENT} · Excused ${r.counts.EXCUSED}`}
                    right={
                      <AppText variant="title" style={{ color: colors.primaryDark }}>
                        {percent(r.percentage)}
                      </AppText>
                    }
                  />
                ))
              : data.rows.map((r) => (
                  <ListRow
                    key={r.session.id}
                    title={`${r.class.classCode} · ${formatDateTime(r.session.startedAt)}`}
                    subtitle={`Present ${r.counts.PRESENT} · Late ${r.counts.LATE} · Absent ${r.counts.ABSENT} · Excused ${r.counts.EXCUSED}`}
                    meta={`of ${r.enrolledCount} enrolled`}
                  />
                ))}
          </ListGroup>
        )}
      </QueryView>
    </Screen>
  );
}
