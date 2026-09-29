import { createScheduleSchema, DAYS_OF_WEEK, type DayOfWeek } from '@kavriel/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { ApiError } from '@/api/client';
import { errorMessage, fieldErrors } from '@/api/errors';
import { classesApi, schedulesApi } from '@/api/endpoints';
import {
  AppText,
  Banner,
  Button,
  Card,
  Chips,
  LoadingState,
  Screen,
  TextField,
} from '@/components/ui';
import { confirm } from '@/lib/confirm';
import { DAY_SHORT, formatClock } from '@/lib/format';
import { validate } from '@/lib/validation';

interface ConflictDetail {
  classCode: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  type: 'CLASS' | 'TEACHER';
}

/** Create a weekly schedule (optionally for `classId`), or edit/delete one when `id` is given. */
export default function ScheduleForm() {
  const params = useLocalSearchParams<{ id?: string; classId?: string }>();
  const id = params.id;
  const qc = useQueryClient();
  const existing = useQuery({
    queryKey: ['schedule', id],
    queryFn: () => schedulesApi.get(id!),
    enabled: !!id,
  });
  const classes = useQuery({
    queryKey: ['classes', { status: 'ACTIVE' }],
    queryFn: () => classesApi.list({ status: 'ACTIVE' }),
  });

  const [classId, setClassId] = useState<string | undefined>(params.classId);
  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeek | undefined>();
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [room, setRoom] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ConflictDetail[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const s = existing.data;
    if (!s) return;
    setClassId(s.class.id);
    setDayOfWeek(s.dayOfWeek);
    setStartTime(s.startTime);
    setEndTime(s.endTime);
    setRoom(s.room ?? '');
  }, [existing.data]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['schedules'] });
    void qc.invalidateQueries({ queryKey: ['today'] });
    if (classId) void qc.invalidateQueries({ queryKey: ['class', classId] });
  };

  async function onSave() {
    setFormError(null);
    setConflicts([]);
    const v = validate(createScheduleSchema, {
      classId,
      dayOfWeek,
      startTime: startTime.trim(),
      endTime: endTime.trim(),
      room: room.trim() || undefined,
    });
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setBusy(true);
    try {
      if (id) {
        const { classId: _ignored, ...rest } = v.data;
        await schedulesApi.update(id, { ...rest, room: rest.room ?? null });
      } else {
        await schedulesApi.create(v.data);
      }
      invalidate();
      router.back();
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.code === 'SCHEDULE_CONFLICT' &&
        Array.isArray(err.details)
      ) {
        setConflicts(err.details as ConflictDetail[]);
      }
      setErrors(fieldErrors(err));
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (
      !id ||
      !(await confirm(
        'Delete schedule?',
        'Past attendance sessions keep their history.',
        'Delete',
        true,
      ))
    )
      return;
    setBusy(true);
    try {
      await schedulesApi.remove(id);
      invalidate();
      router.back();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if ((id && existing.isPending) || classes.isPending) return <LoadingState />;

  return (
    <Screen>
      <Stack.Screen options={{ title: id ? 'Edit schedule' : 'New schedule' }} />
      {formError ? <Banner tone="danger" message={formError} /> : null}
      {conflicts.map((c, i) => (
        <Card key={i}>
          <AppText variant="small">
            {c.type === 'CLASS' ? 'Same class' : 'Your other class'} {c.classCode}:{' '}
            {DAY_SHORT[c.dayOfWeek]} {formatClock(c.startTime)} – {formatClock(c.endTime)}
          </AppText>
        </Card>
      ))}

      <AppText variant="label">Class</AppText>
      {id ? (
        <AppText>
          {existing.data?.class.classCode} · {existing.data?.class.subject.subjectName}
        </AppText>
      ) : (
        <Chips
          options={(classes.data ?? []).map((c) => ({ value: c.id, label: c.classCode }))}
          value={classId}
          onChange={setClassId}
        />
      )}
      {errors.classId ? <Banner tone="danger" message="Choose a class" /> : null}

      <AppText variant="label">Day</AppText>
      <Chips
        options={DAYS_OF_WEEK.map((d) => ({ value: d, label: DAY_SHORT[d] }))}
        value={dayOfWeek}
        onChange={setDayOfWeek}
      />
      {errors.dayOfWeek ? <Banner tone="danger" message="Choose a day" /> : null}

      <TextField
        label="Start time (24h, HH:mm)"
        placeholder="09:00"
        value={startTime}
        onChangeText={setStartTime}
        keyboardType="numbers-and-punctuation"
        error={errors.startTime}
      />
      <TextField
        label="End time (24h, HH:mm)"
        placeholder="10:30"
        value={endTime}
        onChangeText={setEndTime}
        keyboardType="numbers-and-punctuation"
        error={errors.endTime}
      />
      <TextField
        label="Room (optional)"
        placeholder="Room 201"
        value={room}
        onChangeText={setRoom}
        error={errors.room}
      />

      <Button title={id ? 'Save changes' : 'Add schedule'} onPress={onSave} loading={busy} />
      {id ? (
        <Button title="Delete schedule" variant="danger" onPress={onDelete} disabled={busy} />
      ) : null}
    </Screen>
  );
}
