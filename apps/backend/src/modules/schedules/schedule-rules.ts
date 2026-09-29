/** Pure schedule rules (no I/O) so they can be unit tested directly. */
import type { DayOfWeek } from '@kavriel/shared';

export interface TimeSlot {
  id?: string;
  classId: string;
  dayOfWeek: DayOfWeek;
  /** Minutes since local midnight. */
  start: number;
  end: number;
}

export interface ScheduleConflict {
  scheduleId: string;
  classId: string;
  type: 'CLASS' | 'TEACHER';
}

export const MIN_DURATION_MINUTES = 15;
export const MAX_DURATION_MINUTES = 6 * 60;

/** Half-open intervals: 09:00–10:00 and 10:00–11:00 touch but don't overlap. */
export function overlaps(a: TimeSlot, b: TimeSlot): boolean {
  return a.dayOfWeek === b.dayOfWeek && a.start < b.end && b.start < a.end;
}

/**
 * Conflicts between `candidate` and the teacher's other slots in the same semester.
 * A clash within the same class is reported as CLASS, otherwise TEACHER.
 */
export function findConflicts(candidate: TimeSlot, others: TimeSlot[]): ScheduleConflict[] {
  return others
    .filter((o) => o.id !== candidate.id && overlaps(candidate, o))
    .map((o) => ({
      scheduleId: o.id ?? '',
      classId: o.classId,
      type: o.classId === candidate.classId ? 'CLASS' : 'TEACHER',
    }));
}

export function durationError(start: number, end: number): string | null {
  if (end <= start) return 'End time must be after start time';
  const minutes = end - start;
  if (minutes < MIN_DURATION_MINUTES)
    return `A class must be at least ${MIN_DURATION_MINUTES} minutes`;
  if (minutes > MAX_DURATION_MINUTES) return 'A class cannot be longer than 6 hours';
  return null;
}

/**
 * MVP start-window rule: attendance for a scheduled class can start from
 * `earlyMinutes` before the start time until the scheduled end, on the scheduled day.
 * Ad-hoc sessions (no schedule) may start any time and are audited as such.
 */
export function withinStartWindow(
  slot: { dayOfWeek: DayOfWeek; start: number; end: number },
  now: { dayOfWeek: DayOfWeek; minutes: number },
  earlyMinutes: number,
): boolean {
  return (
    slot.dayOfWeek === now.dayOfWeek &&
    now.minutes >= slot.start - earlyMinutes &&
    now.minutes <= slot.end
  );
}
