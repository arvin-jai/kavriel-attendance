import { DAYS_OF_WEEK, type DayOfWeek } from '@kavriel/shared';

import { env } from '../config/env';

/** Server clock. Tests replace `clock.now` to simulate time passing (QR expiry, late threshold). */
export const clock = {
  now: (): Date => new Date(),
};

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: DayOfWeek;
}

const WEEKDAY_MAP: Record<string, DayOfWeek> = {
  Mon: 'MON',
  Tue: 'TUE',
  Wed: 'WED',
  Thu: 'THU',
  Fri: 'FRI',
  Sat: 'SAT',
  Sun: 'SUN',
};

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Wall-clock parts of `date` in the school timezone. */
export function localParts(date: Date, timeZone = env.SCHOOL_TIMEZONE): LocalParts {
  const parts: Record<string, string> = {};
  for (const p of formatterFor(timeZone).formatToParts(date)) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAY_MAP[parts.weekday ?? ''] ?? 'MON',
  };
}

/** Minutes since local midnight in the school timezone. */
export function localMinutes(date: Date, timeZone = env.SCHOOL_TIMEZONE): number {
  const p = localParts(date, timeZone);
  return p.hour * 60 + p.minute;
}

export function localDayOfWeek(date: Date, timeZone = env.SCHOOL_TIMEZONE): DayOfWeek {
  return localParts(date, timeZone).weekday;
}

/** "HH:mm" → minutes since midnight. */
export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** "HH:mm" → Date stored in a Postgres `time` column (date part is ignored). */
export function timeToDb(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(1970, 0, 1, h ?? 0, m ?? 0));
}

/** Postgres `time` column value → "HH:mm". */
export function dbToTime(value: Date): string {
  const h = String(value.getUTCHours()).padStart(2, '0');
  const m = String(value.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/** Offset of `timeZone` from UTC at `date`, in milliseconds. */
function offsetMs(date: Date, timeZone: string): number {
  const p = localParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** The UTC instant of local midnight at the start of `yyyyMmDd` in the school timezone. */
export function localDateStart(yyyyMmDd: string, timeZone = env.SCHOOL_TIMEZONE): Date {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  const guess = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  return new Date(guess.getTime() - offsetMs(guess, timeZone));
}

/** The UTC instant of local midnight at the end of `yyyyMmDd` (exclusive upper bound). */
export function localDateEnd(yyyyMmDd: string, timeZone = env.SCHOOL_TIMEZONE): Date {
  const start = localDateStart(yyyyMmDd, timeZone);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

export { DAYS_OF_WEEK };
