import { describe, expect, it } from 'vitest';

import {
  durationError,
  findConflicts,
  overlaps,
  withinStartWindow,
  type TimeSlot,
} from '../../src/modules/schedules/schedule-rules';

const slot = (start: number, end: number, extra: Partial<TimeSlot> = {}): TimeSlot => ({
  classId: 'class-a',
  dayOfWeek: 'MON',
  start,
  end,
  ...extra,
});

describe('overlaps', () => {
  it('treats touching intervals as free', () => {
    expect(overlaps(slot(540, 600), slot(600, 660))).toBe(false);
  });
  it('detects partial, contained and identical overlaps', () => {
    expect(overlaps(slot(540, 600), slot(570, 630))).toBe(true);
    expect(overlaps(slot(540, 720), slot(600, 630))).toBe(true);
    expect(overlaps(slot(540, 600), slot(540, 600))).toBe(true);
  });
  it('ignores other days', () => {
    expect(overlaps(slot(540, 600), slot(540, 600, { dayOfWeek: 'TUE' }))).toBe(false);
  });
});

describe('findConflicts', () => {
  it('classifies same-class and other-class clashes and skips itself', () => {
    const candidate = slot(540, 600, { id: 'self' });
    const others = [
      slot(540, 600, { id: 'self' }),
      slot(570, 630, { id: 'same-class' }),
      slot(560, 620, { id: 'other', classId: 'class-b' }),
      slot(600, 660, { id: 'after' }),
    ];
    expect(findConflicts(candidate, others)).toEqual([
      { scheduleId: 'same-class', classId: 'class-a', type: 'CLASS' },
      { scheduleId: 'other', classId: 'class-b', type: 'TEACHER' },
    ]);
  });
});

describe('durationError', () => {
  it('enforces order and bounds', () => {
    expect(durationError(600, 540)).toMatch(/after/);
    expect(durationError(540, 550)).toMatch(/at least/);
    expect(durationError(0, 7 * 60)).toMatch(/6 hours/);
    expect(durationError(540, 630)).toBeNull();
  });
});

describe('withinStartWindow', () => {
  const s = { dayOfWeek: 'MON' as const, start: 540, end: 630 }; // 09:00–10:30
  it('opens 15 minutes early and closes at the end', () => {
    expect(withinStartWindow(s, { dayOfWeek: 'MON', minutes: 524 }, 15)).toBe(false);
    expect(withinStartWindow(s, { dayOfWeek: 'MON', minutes: 525 }, 15)).toBe(true);
    expect(withinStartWindow(s, { dayOfWeek: 'MON', minutes: 630 }, 15)).toBe(true);
    expect(withinStartWindow(s, { dayOfWeek: 'MON', minutes: 631 }, 15)).toBe(false);
    expect(withinStartWindow(s, { dayOfWeek: 'TUE', minutes: 560 }, 15)).toBe(false);
  });
});
