/** Response DTOs: the API contract between the Express backend and its clients. */
import type {
  AttendanceSource,
  AttendanceStatus,
  DayOfWeek,
  EnrollmentStatus,
  RecordStatus,
  Role,
  SessionStatus,
} from './enums';

// ───────────── Identity ─────────────

export interface TeacherProfileDto {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  employeeNumber: string | null;
  contactNumber: string | null;
}

export interface StudentProfileDto {
  id: string;
  studentNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  contactNumber: string | null;
  yearLevel: YearLevelDto | null;
}

export type UserDto =
  | { id: string; email: string; role: 'TEACHER'; profile: TeacherProfileDto }
  | { id: string; email: string; role: 'STUDENT'; profile: StudentProfileDto };

export interface AuthTokensDto {
  accessToken: string;
  refreshToken: string;
  /** Access token lifetime in seconds. */
  expiresIn: number;
}

export interface AuthResultDto extends AuthTokensDto {
  user: UserDto;
}

// ───────────── Reference ─────────────

export interface YearLevelDto {
  id: number;
  name: string;
}

export interface SemesterDto {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  academicYear: { id: number; name: string };
}

// ───────────── Academic structure ─────────────

export interface SubjectDto {
  id: string;
  subjectCode: string;
  subjectName: string;
  description: string | null;
  units: number | null;
  status: RecordStatus;
  archivedAt: string | null;
  yearLevel: YearLevelDto | null;
  classCount: number;
}

export interface ClassSummaryRefDto {
  id: string;
  classCode: string;
  sectionName: string;
  subject: { id: string; subjectCode: string; subjectName: string };
}

export interface ClassDto extends ClassSummaryRefDto {
  status: RecordStatus;
  archivedAt: string | null;
  teacher: { id: string; fullName: string };
  semester: { id: number; name: string; academicYear: string };
  enrolledCount: number;
}

export interface ClassDetailDto extends ClassDto {
  schedules: ScheduleDto[];
}

export interface StudentSummaryDto {
  id: string;
  studentNumber: string;
  firstName: string;
  lastName: string;
  fullName: string;
  yearLevel: string | null;
}

export interface EnrollmentDto {
  id: string;
  status: EnrollmentStatus;
  enrolledAt: string;
  droppedAt: string | null;
  student: StudentSummaryDto;
}

export interface ScheduleDto {
  id: string;
  dayOfWeek: DayOfWeek;
  startTime: string; // HH:mm, school time
  endTime: string;
  room: string | null;
  status: RecordStatus;
  class: ClassSummaryRefDto;
}

export interface TodayScheduleDto extends ScheduleDto {
  /** Session currently ACTIVE for this class, if any. */
  activeSessionId: string | null;
  /** Teacher only: whether attendance can be started now under the start-window rule. */
  canStart: boolean;
}

// ───────────── Attendance ─────────────

export type StatusCounts = Record<AttendanceStatus, number>;

export interface SessionDto {
  id: string;
  status: SessionStatus;
  scheduleId: string | null;
  startedAt: string | null;
  endedAt: string | null;
  lockedAt: string | null;
  lateAfterMinutes: number;
  qrRotationSeconds: number;
  class: ClassSummaryRefDto;
  counts: StatusCounts;
  enrolledCount: number;
}

export interface QrTokenDto {
  token: string;
  windowIndex: number;
  expiresAt: string;
  serverTime: string;
  rotationSeconds: number;
}

export interface AttendanceRecordDto {
  id: string;
  status: AttendanceStatus;
  source: AttendanceSource;
  checkInTime: string | null;
  remarks: string | null;
  updatedAt: string;
}

export interface RosterEntryDto {
  student: StudentSummaryDto;
  /** null = no record yet (student hasn't checked in). */
  record: AttendanceRecordDto | null;
}

export interface SessionRecordsDto {
  serverTime: string;
  session: { id: string; status: SessionStatus };
  counts: StatusCounts;
  enrolledCount: number;
  entries: RosterEntryDto[];
}

export interface CheckInResultDto {
  alreadyRecorded: boolean;
  attendance: { id: string; status: AttendanceStatus; checkInTime: string | null };
  session: {
    id: string;
    classCode: string;
    sectionName: string;
    subjectCode: string;
    subjectName: string;
  };
}

export interface MyAttendanceItemDto {
  id: string;
  status: AttendanceStatus;
  checkInTime: string | null;
  remarks: string | null;
  session: { id: string; startedAt: string | null; class: ClassSummaryRefDto };
}

export interface AttendanceSummaryDto {
  class: ClassSummaryRefDto;
  counts: StatusCounts;
  totalSessions: number;
  /** (PRESENT + LATE) / (total − EXCUSED) × 100, rounded to 1 decimal. null when nothing counts yet. */
  percentage: number | null;
}

// ───────────── Reports ─────────────

export interface StudentReportRowDto {
  student: StudentSummaryDto;
  counts: StatusCounts;
  totalSessions: number;
  percentage: number | null;
}

export interface SessionReportRowDto {
  session: { id: string; startedAt: string | null; status: SessionStatus };
  class: ClassSummaryRefDto;
  counts: StatusCounts;
  enrolledCount: number;
}

export type AttendanceReportDto =
  | { groupBy: 'student'; rows: StudentReportRowDto[] }
  | { groupBy: 'session'; rows: SessionReportRowDto[] };

export type { Role };
