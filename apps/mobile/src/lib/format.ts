import type { DayOfWeek } from '@kavriel/shared';

import { SCHOOL_TIMEZONE } from './env';

function fmt(iso: string | null | undefined, options: Intl.DateTimeFormatOptions): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-PH', { timeZone: SCHOOL_TIMEZONE, ...options }).format(
      new Date(iso),
    );
  } catch {
    // Engines without full timezone data: fall back to device time.
    return new Intl.DateTimeFormat('en-PH', options).format(new Date(iso));
  }
}

export const formatTime = (iso: string | null | undefined) =>
  fmt(iso, { hour: 'numeric', minute: '2-digit' });
export const formatDate = (iso: string | null | undefined) =>
  fmt(iso, { weekday: 'short', month: 'short', day: 'numeric' });
export const formatDateTime = (iso: string | null | undefined) =>
  fmt(iso, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** "13:30" → "1:30 PM" */
export function formatClock(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

export const DAY_LABELS: Record<DayOfWeek, string> = {
  MON: 'Monday',
  TUE: 'Tuesday',
  WED: 'Wednesday',
  THU: 'Thursday',
  FRI: 'Friday',
  SAT: 'Saturday',
  SUN: 'Sunday',
};

export const DAY_SHORT: Record<DayOfWeek, string> = {
  MON: 'Mon',
  TUE: 'Tue',
  WED: 'Wed',
  THU: 'Thu',
  FRI: 'Fri',
  SAT: 'Sat',
  SUN: 'Sun',
};

/** Today's weekday in the school timezone. */
export function todayDay(): DayOfWeek {
  const short = fmt(new Date().toISOString(), { weekday: 'short' });
  const map: Record<string, DayOfWeek> = {
    Mon: 'MON',
    Tue: 'TUE',
    Wed: 'WED',
    Thu: 'THU',
    Fri: 'FRI',
    Sat: 'SAT',
    Sun: 'SUN',
  };
  return map[short] ?? 'MON';
}

export function greeting(): string {
  const hour = Number(fmt(new Date().toISOString(), { hour: 'numeric', hourCycle: 'h23' }));
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function percent(value: number | null): string {
  return value === null ? '—' : `${value}%`;
}

/** Current school time as "HH:mm" (24h), comparable with schedule times. */
export function nowClock(): string {
  return fmt(new Date().toISOString(), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
}
