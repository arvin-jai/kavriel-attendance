import { describe, expect, it } from 'vitest';

import {
  dbToTime,
  localDateStart,
  localDayOfWeek,
  localMinutes,
  timeToDb,
  timeToMinutes,
} from '../../src/lib/time';

describe('school timezone (Asia/Manila, UTC+8)', () => {
  it('maps a UTC instant to local day and minutes', () => {
    // 2026-09-28T23:30Z is Tuesday 07:30 in Manila.
    const d = new Date('2026-09-28T23:30:00Z');
    expect(localDayOfWeek(d)).toBe('TUE');
    expect(localMinutes(d)).toBe(7 * 60 + 30);
  });

  it('finds local midnight as a UTC instant', () => {
    expect(localDateStart('2026-09-29').toISOString()).toBe('2026-09-28T16:00:00.000Z');
  });

  it('round-trips HH:mm through the time column representation', () => {
    expect(dbToTime(timeToDb('09:05'))).toBe('09:05');
    expect(timeToMinutes('13:45')).toBe(825);
  });
});
