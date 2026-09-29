/** Typed wrappers for every API route the app uses. Shapes come from @kavriel/shared. */
import type {
  AttendanceRecordDto,
  AttendanceReportDto,
  AttendanceStatus,
  AttendanceSummaryDto,
  AuthResultDto,
  CheckInResultDto,
  ClassDetailDto,
  ClassDto,
  CreateClassInput,
  CreateScheduleInput,
  CreateSessionInput,
  CreateSubjectInput,
  DayOfWeek,
  EnrollmentDto,
  LoginInput,
  MyAttendanceItemDto,
  QrTokenDto,
  RecordStatus,
  RegisterInput,
  ReportQuery,
  ScheduleDto,
  SemesterDto,
  SessionDto,
  SessionRecordsDto,
  SessionStatus,
  StudentSummaryDto,
  SubjectDto,
  TodayScheduleDto,
  UserDto,
  YearLevelDto,
} from '@kavriel/shared';

import { api, apiText, requestEnvelope } from './client';

// ───────────── Auth ─────────────

export const authApi = {
  register: (input: RegisterInput) =>
    api<AuthResultDto>('/auth/register', { method: 'POST', body: input, auth: false }),
  login: (input: LoginInput) =>
    api<AuthResultDto>('/auth/login', { method: 'POST', body: input, auth: false }),
  logout: (refreshToken: string) =>
    api<void>('/auth/logout', { method: 'POST', body: { refreshToken } }),
  me: () => api<UserDto>('/auth/me'),
  updateMe: (input: {
    firstName?: string;
    middleName?: string | null;
    lastName?: string;
    contactNumber?: string | null;
    yearLevelId?: number | null;
  }) => api<UserDto>('/auth/me', { method: 'PATCH', body: input }),
  changePassword: (currentPassword: string, newPassword: string) =>
    api<void>('/auth/password', { method: 'PATCH', body: { currentPassword, newPassword } }),
};

// ───────────── Reference ─────────────

export const referenceApi = {
  yearLevels: () => api<YearLevelDto[]>('/reference/year-levels', { auth: false }),
  semesters: () => api<SemesterDto[]>('/reference/semesters'),
  currentSemester: () => api<SemesterDto | null>('/reference/semesters/current'),
};

// ───────────── Subjects / classes / enrollment ─────────────

export const subjectsApi = {
  list: (status?: RecordStatus) => api<SubjectDto[]>('/subjects', { query: { status } }),
  get: (id: string) => api<SubjectDto>(`/subjects/${id}`),
  create: (input: CreateSubjectInput) =>
    api<SubjectDto>('/subjects', { method: 'POST', body: input }),
  update: (id: string, input: Partial<CreateSubjectInput> & { status?: RecordStatus }) =>
    api<SubjectDto>(`/subjects/${id}`, { method: 'PATCH', body: input }),
  remove: (id: string) => api<void>(`/subjects/${id}`, { method: 'DELETE' }),
};

export const classesApi = {
  list: (query: { status?: RecordStatus; subjectId?: string } = {}) =>
    api<ClassDto[]>('/classes', { query }),
  get: (id: string) => api<ClassDetailDto>(`/classes/${id}`),
  create: (input: CreateClassInput) => api<ClassDto>('/classes', { method: 'POST', body: input }),
  update: (
    id: string,
    input: { sectionName?: string; classCode?: string; semesterId?: number; status?: RecordStatus },
  ) => api<ClassDto>(`/classes/${id}`, { method: 'PATCH', body: input }),
  remove: (id: string) => api<void>(`/classes/${id}`, { method: 'DELETE' }),
  students: (id: string) =>
    api<EnrollmentDto[]>(`/classes/${id}/students`, { query: { status: 'ACTIVE' } }),
  enroll: (id: string, studentNumber: string) =>
    api<EnrollmentDto>(`/classes/${id}/students`, { method: 'POST', body: { studentNumber } }),
  drop: (id: string, studentId: string) =>
    api<void>(`/classes/${id}/students/${studentId}`, { method: 'DELETE' }),
  lookupStudent: (studentNumber: string) =>
    api<StudentSummaryDto>('/students/lookup', { query: { studentNumber } }),
};

// ───────────── Schedules ─────────────

export const schedulesApi = {
  list: (query: { classId?: string; day?: DayOfWeek } = {}) =>
    api<ScheduleDto[]>('/schedules', { query }),
  today: () => api<TodayScheduleDto[]>('/schedules/today'),
  get: (id: string) => api<ScheduleDto>(`/schedules/${id}`),
  create: (input: CreateScheduleInput) =>
    api<ScheduleDto>('/schedules', { method: 'POST', body: input }),
  update: (
    id: string,
    input: { dayOfWeek?: DayOfWeek; startTime?: string; endTime?: string; room?: string | null },
  ) => api<ScheduleDto>(`/schedules/${id}`, { method: 'PATCH', body: input }),
  remove: (id: string) =>
    api<{ archived: boolean } | undefined>(`/schedules/${id}`, { method: 'DELETE' }),
};

// ───────────── Attendance ─────────────

export const sessionsApi = {
  create: (input: CreateSessionInput) =>
    api<SessionDto>('/attendance/sessions', { method: 'POST', body: input }),
  list: async (
    query: { classId?: string; status?: SessionStatus; cursor?: string; limit?: number } = {},
  ) => {
    const res = await requestEnvelope<SessionDto[]>('/attendance/sessions', { query });
    return { items: res.data, nextCursor: res.meta?.nextCursor ?? null };
  },
  get: (id: string) => api<SessionDto>(`/attendance/sessions/${id}`),
  end: (id: string) =>
    api<{ session: SessionDto; absentMarked: number }>(`/attendance/sessions/${id}/end`, {
      method: 'POST',
    }),
  lock: (id: string) => api<SessionDto>(`/attendance/sessions/${id}/lock`, { method: 'POST' }),
  qr: (id: string) => api<QrTokenDto>(`/attendance/sessions/${id}/qr`, { timeoutMs: 6_000 }),
  records: (id: string, since?: string) =>
    api<SessionRecordsDto>(`/attendance/sessions/${id}/records`, { query: { since } }),
  updateRecord: (
    attendanceId: string,
    input: { status?: AttendanceStatus; remarks?: string | null },
  ) => api<AttendanceRecordDto>(`/attendance/${attendanceId}`, { method: 'PATCH', body: input }),
  markStudent: (
    sessionId: string,
    studentId: string,
    input: { status: AttendanceStatus; remarks?: string },
  ) =>
    api<AttendanceRecordDto>(`/attendance/sessions/${sessionId}/records/${studentId}`, {
      method: 'PUT',
      body: input,
    }),
};

export const studentAttendanceApi = {
  checkIn: (qrToken: string, clientRequestId: string) =>
    api<CheckInResultDto>('/attendance/check-in', {
      method: 'POST',
      body: { qrToken, clientRequestId },
      timeoutMs: 12_000,
    }),
  my: async (
    query: { classId?: string; sessionId?: string; cursor?: string; limit?: number } = {},
  ) => {
    const res = await requestEnvelope<MyAttendanceItemDto[]>('/attendance/my', { query });
    return { items: res.data, nextCursor: res.meta?.nextCursor ?? null };
  },
  summary: (classId?: string) =>
    api<AttendanceSummaryDto[]>('/attendance/my/summary', { query: { classId } }),
};

// ───────────── Reports ─────────────

type ReportFilters = Partial<ReportQuery>;

export const reportsApi = {
  get: (q: ReportFilters) => api<AttendanceReportDto>('/reports/attendance', { query: q }),
  csv: (q: ReportFilters) => apiText('/reports/attendance.csv', q),
};
