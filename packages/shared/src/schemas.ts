/**
 * Request schemas shared by the API (validation middleware) and the mobile app (forms).
 * Server-side business rules (ownership, state transitions, conflicts) live in the API services.
 */
import { z } from 'zod';

import {
  ATTENDANCE_STATUSES,
  DAYS_OF_WEEK,
  ENROLLMENT_STATUSES,
  RECORD_STATUSES,
  SESSION_STATUSES,
} from './enums';

// ───────────── Primitives ─────────────

export const idParam = z.object({ id: z.uuid() });

/** Local school time, 24h "HH:mm". */
export const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:mm');

const name = z.string().trim().min(1).max(100);
const optionalName = z.string().trim().max(100).optional();
const contactNumber = z
  .string()
  .trim()
  .max(30)
  .regex(/^[0-9+()\-\s]*$/, 'Digits, spaces and + ( ) - only')
  .optional();
const email = z
  .email()
  .max(254)
  .transform((v) => v.toLowerCase());
export const password = z.string().min(8, 'At least 8 characters').max(128);

export const pagination = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.uuid().optional(),
});

const isoDate = z.iso.date(); // YYYY-MM-DD

// ───────────── Auth ─────────────

const registerBase = z.object({
  email,
  password,
  firstName: name,
  middleName: optionalName,
  lastName: name,
  contactNumber,
});

export const registerTeacherSchema = registerBase.extend({
  role: z.literal('TEACHER'),
  employeeNumber: z.string().trim().min(1).max(50).optional(),
  teacherCode: z.string().min(1, 'Teacher registration code is required'),
});

export const registerStudentSchema = registerBase.extend({
  role: z.literal('STUDENT'),
  studentNumber: z.string().trim().min(1).max(50),
  yearLevelId: z.number().int().positive().optional(),
});

export const registerSchema = z.discriminatedUnion('role', [
  registerTeacherSchema,
  registerStudentSchema,
]);
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({ email, password: z.string().min(1).max(128) });
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({ refreshToken: z.string().min(20).max(200) });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: password,
});

export const updateProfileSchema = z
  .object({
    firstName: name.optional(),
    middleName: z.string().trim().max(100).nullable().optional(),
    lastName: name.optional(),
    contactNumber: contactNumber.nullable(),
    yearLevelId: z.number().int().positive().nullable().optional(),
  })
  .strict();

// ───────────── Subjects ─────────────

export const createSubjectSchema = z.object({
  subjectCode: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9-]+$/, 'Letters, digits and dashes only')),
  subjectName: z.string().trim().min(1).max(150),
  description: z.string().trim().max(1000).optional(),
  yearLevelId: z.number().int().positive().optional(),
  units: z.number().min(0.5).max(10).optional(),
});
export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;

export const updateSubjectSchema = createSubjectSchema
  .partial()
  .extend({ status: z.enum(RECORD_STATUSES).optional() });

export const listSubjectsQuery = z.object({
  status: z.enum(RECORD_STATUSES).optional(),
  q: z.string().trim().max(100).optional(),
});

// ───────────── Classes ─────────────

export const createClassSchema = z.object({
  subjectId: z.uuid(),
  semesterId: z.number().int().positive(),
  sectionName: z.string().trim().min(1).max(50),
  classCode: z
    .string()
    .trim()
    .min(1)
    .max(30)
    .transform((v) => v.toUpperCase()),
});
export type CreateClassInput = z.infer<typeof createClassSchema>;

export const updateClassSchema = createClassSchema
  .omit({ subjectId: true })
  .partial()
  .extend({ status: z.enum(RECORD_STATUSES).optional() });

export const listClassesQuery = z.object({
  status: z.enum(RECORD_STATUSES).optional(),
  semesterId: z.coerce.number().int().positive().optional(),
  subjectId: z.uuid().optional(),
});

// ───────────── Enrollment ─────────────

export const enrollStudentSchema = z.object({
  studentNumber: z.string().trim().min(1).max(50),
});

export const classStudentParams = z.object({ id: z.uuid(), studentId: z.uuid() });

export const listEnrollmentsQuery = z.object({
  status: z.enum(ENROLLMENT_STATUSES).optional(),
});

export const studentLookupQuery = z.object({
  studentNumber: z.string().trim().min(1).max(50),
});

// ───────────── Schedules ─────────────

export const createScheduleSchema = z
  .object({
    classId: z.uuid(),
    dayOfWeek: z.enum(DAYS_OF_WEEK),
    startTime: timeOfDay,
    endTime: timeOfDay,
    room: z.string().trim().max(50).optional(),
  })
  .refine((s) => s.endTime > s.startTime, {
    message: 'End time must be after start time',
    path: ['endTime'],
  });
export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;

export const updateScheduleSchema = z.object({
  dayOfWeek: z.enum(DAYS_OF_WEEK).optional(),
  startTime: timeOfDay.optional(),
  endTime: timeOfDay.optional(),
  room: z.string().trim().max(50).nullable().optional(),
});

export const listSchedulesQuery = z.object({
  classId: z.uuid().optional(),
  day: z.enum(DAYS_OF_WEEK).optional(),
});

// ───────────── Attendance sessions ─────────────

export const createSessionSchema = z.object({
  classId: z.uuid(),
  scheduleId: z.uuid().optional(),
  startNow: z.boolean().default(true),
  lateAfterMinutes: z.number().int().min(0).max(120).default(15),
  qrRotationSeconds: z.number().int().min(10).max(60).default(15),
});
export type CreateSessionInput = z.input<typeof createSessionSchema>;

export const listSessionsQuery = pagination.extend({
  classId: z.uuid().optional(),
  status: z.enum(SESSION_STATUSES).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export const recordsQuery = z.object({
  since: z.iso.datetime().optional(),
});

// ───────────── Check-in & records ─────────────

export const checkInSchema = z.object({
  qrToken: z.string().trim().min(1).max(200),
  clientRequestId: z.uuid().optional(),
});
export type CheckInInput = z.infer<typeof checkInSchema>;

export const myAttendanceQuery = pagination.extend({
  classId: z.uuid().optional(),
  sessionId: z.uuid().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export const updateAttendanceSchema = z
  .object({
    status: z.enum(ATTENDANCE_STATUSES).optional(),
    remarks: z.string().trim().max(500).nullable().optional(),
  })
  .refine((v) => v.status !== undefined || v.remarks !== undefined, 'Nothing to update');

export const markAttendanceSchema = z.object({
  status: z.enum(ATTENDANCE_STATUSES),
  remarks: z.string().trim().max(500).optional(),
});

export const sessionStudentParams = z.object({ id: z.uuid(), studentId: z.uuid() });

// ───────────── Reports ─────────────

export const reportQuery = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  subjectId: z.uuid().optional(),
  classId: z.uuid().optional(),
  studentId: z.uuid().optional(),
  status: z.enum(ATTENDANCE_STATUSES).optional(),
  groupBy: z.enum(['student', 'session']).default('student'),
});
export type ReportQuery = z.infer<typeof reportQuery>;
