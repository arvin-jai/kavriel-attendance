import type { StatusCounts } from './types';

export function emptyCounts(): StatusCounts {
  return { PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 0 };
}

/**
 * Attendance percentage: (PRESENT + LATE) / (total − EXCUSED) × 100, one decimal.
 * Returns null when no session counts yet (e.g. all excused).
 */
export function attendancePercentage(counts: StatusCounts): number | null {
  const total = counts.PRESENT + counts.LATE + counts.ABSENT;
  if (total === 0) return null;
  return Math.round(((counts.PRESENT + counts.LATE) / total) * 1000) / 10;
}
