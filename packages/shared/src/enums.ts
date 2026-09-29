/** Enum values shared by the API, the mobile app and (later) the admin web. Mirrors prisma/schema.prisma. */

export const ROLES = ['TEACHER', 'STUDENT'] as const;
export type Role = (typeof ROLES)[number];

export const RECORD_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type RecordStatus = (typeof RECORD_STATUSES)[number];

export const ENROLLMENT_STATUSES = ['ACTIVE', 'DROPPED'] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const DAYS_OF_WEEK = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

export const SESSION_STATUSES = ['PENDING', 'ACTIVE', 'ENDED', 'LOCKED'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const ATTENDANCE_STATUSES = ['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_SOURCES = ['QR_SCAN', 'MANUAL', 'SYSTEM'] as const;
export type AttendanceSource = (typeof ATTENDANCE_SOURCES)[number];
