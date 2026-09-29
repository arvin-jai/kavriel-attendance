/** Integration-test helpers: an in-process app, DB reset, and fixtures built through the real API. */
import request from 'supertest';

import { createApp } from '../../src/app';
import { prisma } from '../../src/config/database';

export const app = createApp();
export { prisma };

export const API = '/api/v1';
export const TEACHER_CODE = 'teach-2026';
export const PASSWORD = 'correct-horse-battery';

/** Remove everything except reference data (roles, year levels, academic years, semesters). */
export async function resetDb() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE "AuditLog", "Attendance", "AttendanceSession", "Schedule", "Enrollment",
             "ClassSection", "Subject", "RefreshToken", "Teacher", "Student", "User"
    RESTART IDENTITY CASCADE
  `);
}

let seq = 0;
const next = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

export interface Session {
  token: string;
  refreshToken: string;
  userId: string;
  profileId: string;
}

function asSession(body: {
  data: {
    accessToken: string;
    refreshToken: string;
    user: { id: string; profile: { id: string } };
  };
}): Session {
  return {
    token: body.data.accessToken,
    refreshToken: body.data.refreshToken,
    userId: body.data.user.id,
    profileId: body.data.user.profile.id,
  };
}

export async function registerTeacher(overrides: Record<string, unknown> = {}): Promise<Session> {
  const res = await request(app)
    .post(`${API}/auth/register`)
    .send({
      role: 'TEACHER',
      email: `teacher-${next()}@test.local`,
      password: PASSWORD,
      firstName: 'Tess',
      lastName: 'Teacher',
      teacherCode: TEACHER_CODE,
      ...overrides,
    });
  if (res.status !== 201)
    throw new Error(`registerTeacher failed: ${res.status} ${JSON.stringify(res.body)}`);
  return asSession(res.body);
}

export async function registerStudent(
  overrides: Record<string, unknown> = {},
): Promise<Session & { studentNumber: string }> {
  const studentNumber = (overrides.studentNumber as string) ?? `S-${next()}`;
  const res = await request(app)
    .post(`${API}/auth/register`)
    .send({
      role: 'STUDENT',
      email: `student-${next()}@test.local`,
      password: PASSWORD,
      firstName: 'Sam',
      lastName: `Student${next()}`,
      studentNumber,
      ...overrides,
    });
  if (res.status !== 201)
    throw new Error(`registerStudent failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { ...asSession(res.body), studentNumber };
}

/** Authenticated supertest calls. */
export function as(token: string) {
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  return {
    get: (url: string) => auth(request(app).get(`${API}${url}`)),
    post: (url: string, body?: object) => auth(request(app).post(`${API}${url}`)).send(body ?? {}),
    put: (url: string, body?: object) => auth(request(app).put(`${API}${url}`)).send(body ?? {}),
    patch: (url: string, body?: object) =>
      auth(request(app).patch(`${API}${url}`)).send(body ?? {}),
    delete: (url: string) => auth(request(app).delete(`${API}${url}`)),
  };
}

/** Date the time-sensitive tests pretend it is (a Monday in 1st Semester 2026-2027). */
export const TEST_DAY = '2026-09-28';

/** Semester containing `day` (defaults to TEST_DAY), from the seeded reference data. */
export async function currentSemesterId(day = TEST_DAY): Promise<number> {
  const date = new Date(`${day}T00:00:00Z`);
  const semester = await prisma.semester.findFirstOrThrow({
    where: { startDate: { lte: date }, endDate: { gte: date } },
  });
  return semester.id;
}

/** Subject + class owned by `teacher`, with the given students enrolled. */
export async function classWithStudents(
  teacher: Session,
  students: Array<{ studentNumber: string }> = [],
  code = next().toUpperCase().slice(-6),
) {
  const t = as(teacher.token);
  const subject = await t.post('/subjects', {
    subjectCode: `SUB-${code}`,
    subjectName: 'Test Subject',
  });
  if (subject.status !== 201) throw new Error(`subject: ${JSON.stringify(subject.body)}`);
  const cls = await t.post('/classes', {
    subjectId: subject.body.data.id,
    semesterId: await currentSemesterId(),
    sectionName: 'Section A',
    classCode: `CLS-${code}`,
  });
  if (cls.status !== 201) throw new Error(`class: ${JSON.stringify(cls.body)}`);
  for (const s of students) {
    const e = await t.post(`/classes/${cls.body.data.id}/students`, {
      studentNumber: s.studentNumber,
    });
    if (e.status !== 201) throw new Error(`enroll: ${JSON.stringify(e.body)}`);
  }
  return { subjectId: subject.body.data.id as string, classId: cls.body.data.id as string };
}

/** Start an ad-hoc session and fetch its current QR token. */
export async function startSession(teacher: Session, classId: string, extra: object = {}) {
  const t = as(teacher.token);
  const session = await t.post('/attendance/sessions', { classId, ...extra });
  if (session.status !== 201) throw new Error(`session: ${JSON.stringify(session.body)}`);
  const qr = await t.get(`/attendance/sessions/${session.body.data.id}/qr`);
  return { sessionId: session.body.data.id as string, qrToken: qr.body.data.token as string };
}
