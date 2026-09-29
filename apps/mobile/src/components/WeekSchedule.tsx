import { DAYS_OF_WEEK, type DayOfWeek, type ScheduleDto } from '@kavriel/shared';
import { useState } from 'react';

import { DAY_LABELS, DAY_SHORT, todayDay } from '@/lib/format';

import { ScheduleCard } from './common';
import { Chips, EmptyState, Section } from './ui';

/** Day / week views of recurring weekly schedules. Shared by teacher and student. */
export function WeekSchedule({
  schedules,
  onPressSchedule,
}: {
  schedules: ScheduleDto[];
  onPressSchedule?: (s: ScheduleDto) => void;
}) {
  const [view, setView] = useState<'day' | 'week'>('day');
  const [day, setDay] = useState<DayOfWeek>(todayDay());

  const byDay = (d: DayOfWeek) => schedules.filter((s) => s.dayOfWeek === d);
  const activeDays = DAYS_OF_WEEK.filter((d) => byDay(d).length > 0);

  return (
    <>
      <Chips
        options={[
          { value: 'day', label: 'Day' },
          { value: 'week', label: 'Week' },
        ]}
        value={view}
        onChange={setView}
      />
      {view === 'day' ? (
        <>
          <Chips
            options={DAYS_OF_WEEK.map((d) => ({ value: d, label: DAY_SHORT[d] }))}
            value={day}
            onChange={setDay}
          />
          {byDay(day).length === 0 ? (
            <EmptyState icon="calendar-outline" title={`No classes on ${DAY_LABELS[day]}`} />
          ) : (
            byDay(day).map((s) => (
              <ScheduleCard
                key={s.id}
                schedule={s}
                onPress={onPressSchedule ? () => onPressSchedule(s) : undefined}
              />
            ))
          )}
        </>
      ) : activeDays.length === 0 ? (
        <EmptyState icon="calendar-outline" title="No weekly schedule yet" />
      ) : (
        activeDays.map((d) => (
          <Section key={d} title={DAY_LABELS[d]}>
            {byDay(d).map((s) => (
              <ScheduleCard
                key={s.id}
                schedule={s}
                onPress={onPressSchedule ? () => onPressSchedule(s) : undefined}
              />
            ))}
          </Section>
        ))
      )}
    </>
  );
}
