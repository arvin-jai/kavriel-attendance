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
import { MultiDayPicker } from '@/components/patterns';
import { DAY_LABELS, DAY_SHORT, formatClock } from '@/lib/format';
import { validate } from '@/lib/validation';

interface ConflictDetail {
  classCode: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  type: 'CLASS' | 'TEACHER';
}

/**
 * Create weekly schedules (optionally for `classId`), or edit/delete one when `id` is given.
 * Adding lets the teacher pick several days; each day is saved as its own schedule, because a
 * schedule row is one day in the API. Editing changes that one row, so it stays single-day.
 */
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
  const [days, setDays] = useState<DayOfWeek[]>([]);
  const [savedNote, setSavedNote] = useState<string | null>(null);
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

  const input = (day: DayOfWeek | undefined) => ({
    classId,
    dayOfWeek: day,
    startTime: startTime.trim(),
    endTime: endTime.trim(),
    room: room.trim() || undefined,
  });

  function showError(err: unknown) {
    if (err instanceof ApiError && err.code === 'SCHEDULE_CONFLICT' && Array.isArray(err.details)) {
      setConflicts(err.details as ConflictDetail[]);
    }
    setErrors(fieldErrors(err));
    setFormError(errorMessage(err));
  }

  async function onSave() {
    setFormError(null);
    setSavedNote(null);
    setConflicts([]);
    if (id) return saveEdit();

    // Validate the shared fields once (with the first day), then require at least one day.
    const v = validate(createScheduleSchema, input(days[0] ?? 'MON'));
    const dayError: Record<string, string> =
      days.length === 0 ? { dayOfWeek: 'Choose at least one day' } : {};
    if (!v.ok || days.length === 0) return setErrors({ ...(v.ok ? {} : v.errors), ...dayError });
    setErrors({});
    setBusy(true);

    // One schedule per day, in week order. Stop at nothing: report exactly which days failed.
    const saved: DayOfWeek[] = [];
    const failed: { day: DayOfWeek; err: unknown }[] = [];
    for (const day of days) {
      try {
        await schedulesApi.create({ ...v.data, dayOfWeek: day });
        saved.push(day);
      } catch (err) {
        failed.push({ day, err });
      }
    }
    setBusy(false);
    if (saved.length > 0) invalidate();

    if (failed.length === 0) return router.back();

    // Keep only the days that still need saving, and say what happened in words.
    setDays(failed.map((f) => f.day));
    if (saved.length > 0) {
      setSavedNote(
        `Saved ${saved.map((d) => DAY_LABELS[d]).join(', ')}. ` +
          `Not saved: ${failed.map((f) => DAY_LABELS[f.day]).join(', ')}.`,
      );
    }
    showError(failed[0]!.err);
  }

  async function saveEdit() {
    const v = validate(createScheduleSchema, input(dayOfWeek));
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setBusy(true);
    try {
      const { classId: _ignored, ...rest } = v.data;
      await schedulesApi.update(id!, { ...rest, room: rest.room ?? null });
      invalidate();
      router.back();
    } catch (err) {
      showError(err);
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
      {savedNote ? <Banner tone="warning" message={savedNote} /> : null}
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

      <AppText variant="label">{id ? 'Day' : 'Days'}</AppText>
      {id ? (
        <Chips
          options={DAYS_OF_WEEK.map((d) => ({ value: d, label: DAY_SHORT[d] }))}
          value={dayOfWeek}
          onChange={setDayOfWeek}
        />
      ) : (
        <MultiDayPicker
          days={DAYS_OF_WEEK.map((d) => ({ value: d, label: DAY_SHORT[d], full: DAY_LABELS[d] }))}
          value={days}
          onChange={setDays}
        />
      )}
      {errors.dayOfWeek ? (
        <Banner tone="danger" message={id ? 'Choose a day' : 'Choose at least one day'} />
      ) : null}

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

      <Button
        title={
          id ? 'Save changes' : days.length > 1 ? `Add ${days.length} schedules` : 'Add schedule'
        }
        onPress={onSave}
        loading={busy}
        size="lg"
      />
      {id ? (
        <Button title="Delete schedule" variant="danger" onPress={onDelete} disabled={busy} />
      ) : null}
    </Screen>
  );
}
