/**
 * Machine-readable error codes returned as `{ error: { code, message } }`.
 * The mobile app maps these to user-facing messages.
 */
export const ERROR_CODES = [
  // Generic
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'TOKEN_EXPIRED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'IN_USE',
  'INVALID_STATE',
  'RATE_LIMITED',
  'INTERNAL',
  // Auth
  'EMAIL_TAKEN',
  'STUDENT_NUMBER_TAKEN',
  'EMPLOYEE_NUMBER_TAKEN',
  'INVALID_TEACHER_CODE',
  'INVALID_CREDENTIALS',
  'ACCOUNT_DISABLED',
  'INVALID_REFRESH_TOKEN',
  // Academic resources
  'SUBJECT_CODE_TAKEN',
  'SUBJECT_IN_USE',
  'SUBJECT_ARCHIVED',
  'CLASS_CODE_TAKEN',
  'CLASS_IN_USE',
  'CLASS_ARCHIVED',
  'STUDENT_NOT_FOUND',
  'ALREADY_ENROLLED',
  'SCHEDULE_CONFLICT',
  // Attendance
  'SESSION_ALREADY_ACTIVE',
  'SESSION_ACTIVE',
  'SESSION_NOT_ACTIVE',
  'SESSION_LOCKED',
  'OUTSIDE_SCHEDULE_WINDOW',
  'QR_INVALID',
  'QR_EXPIRED',
  'NOT_ENROLLED',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

export interface ApiSuccess<T> {
  data: T;
  meta?: { nextCursor?: string | null };
}
