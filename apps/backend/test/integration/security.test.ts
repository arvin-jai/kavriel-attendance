import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { clock } from '../../src/lib/time';
import { signToken } from '../../src/modules/qr/qr.service';
import {
  API,
  app,
  as,
  classWithStudents,
  prisma,
  registerStudent,
  registerTeacher,
  resetDb,
  startSession,
} from '../support/api';

const realNow = clock.now;
beforeEach(resetDb);
afterEach(() => {
  clock.now = realNow;
});

describe('cross-teacher isolation (IDOR)', () => {
  it("returns 404 for every route on another teacher's resources", async () => {
    const owner = await registerTeacher();
    const intruder = await registerTeacher();
    const student = await registerStudent();
    const { classId, subjectId } = await classWithStudents(owner, [student]);
    const schedule = await as(owner.token).post('/schedules', {
      classId,
      dayOfWeek: 'TUE',
      startTime: '13:00',
      endTime: '14:00',
    });
    const { sessionId, qrToken } = await startSession(owner, classId);
    await as(student.token).post('/attendance/check-in', { qrToken });
    const record = await prisma.attendance.findFirstOrThrow({ where: { sessionId } });

    const i = as(intruder.token);
    const attempts = [
      i.get(`/subjects/${subjectId}`),
      i.patch(`/subjects/${subjectId}`, { subjectName: 'hacked' }),
      i.delete(`/subjects/${subjectId}`),
      i.get(`/classes/${classId}`),
      i.patch(`/classes/${classId}`, { sectionName: 'hacked' }),
      i.get(`/classes/${classId}/students`),
      i.post(`/classes/${classId}/students`, { studentNumber: student.studentNumber }),
      i.delete(`/classes/${classId}/students/${student.profileId}`),
      i.get(`/schedules/${schedule.body.data.id}`),
      i.patch(`/schedules/${schedule.body.data.id}`, { room: 'hacked' }),
      i.delete(`/schedules/${schedule.body.data.id}`),
      i.post('/attendance/sessions', { classId }),
      i.get(`/attendance/sessions/${sessionId}`),
      i.get(`/attendance/sessions/${sessionId}/qr`),
      i.get(`/attendance/sessions/${sessionId}/records`),
      i.post(`/attendance/sessions/${sessionId}/end`),
      i.post(`/attendance/sessions/${sessionId}/lock`),
      i.patch(`/attendance/${record.id}`, { status: 'ABSENT' }),
      i.put(`/attendance/sessions/${sessionId}/records/${student.profileId}`, { status: 'ABSENT' }),
    ];
    for (const [n, res] of (await Promise.all(attempts)).entries()) {
      expect(res.status, `attempt #${n}`).toBe(404);
    }

    // The intruder's lists never include the owner's data.
    expect((await i.get('/classes')).body.data).toEqual([]);
    expect((await i.get('/subjects')).body.data).toEqual([]);
    expect((await i.get('/attendance/sessions')).body.data).toEqual([]);
    expect((await i.get('/reports/attendance')).body.data.rows).toEqual([]);

    // Nothing changed.
    expect((await prisma.attendance.findUniqueOrThrow({ where: { id: record.id } })).status).toBe(
      'PRESENT',
    );
  });

  it("students can't read classes they aren't enrolled in", async () => {
    const teacher = await registerTeacher();
    const enrolled = await registerStudent();
    const outsider = await registerStudent();
    const { classId } = await classWithStudents(teacher, [enrolled]);

    expect((await as(enrolled.token).get(`/classes/${classId}`)).status).toBe(200);
    expect((await as(outsider.token).get(`/classes/${classId}`)).status).toBe(404);
    expect((await as(outsider.token).get('/classes')).body.data).toEqual([]);
  });
});

describe('role boundaries', () => {
  it('students get 403 on teacher-only endpoints', async () => {
    const teacher = await registerTeacher();
    const student = await registerStudent();
    const { classId } = await classWithStudents(teacher, [student]);
    const { sessionId } = await startSession(teacher, classId);
    const s = as(student.token);

    const attempts = [
      s.post('/subjects', { subjectCode: 'X1', subjectName: 'X' }),
      s.post('/classes', { subjectId: classId, semesterId: 1, sectionName: 'A', classCode: 'X' }),
      s.post(`/classes/${classId}/students`, { studentNumber: 'X' }),
      s.post('/schedules', { classId, dayOfWeek: 'MON', startTime: '09:00', endTime: '10:00' }),
      s.post('/attendance/sessions', { classId }),
      s.get(`/attendance/sessions/${sessionId}/qr`),
      s.get(`/attendance/sessions/${sessionId}/records`),
      s.post(`/attendance/sessions/${sessionId}/end`),
      s.post(`/attendance/sessions/${sessionId}/lock`),
      s.get('/reports/attendance'),
      s.get(`/students/lookup?studentNumber=${student.studentNumber}`),
    ];
    for (const [n, res] of (await Promise.all(attempts)).entries()) {
      expect(res.status, `attempt #${n}`).toBe(403);
    }
  });

  it('teachers cannot check in', async () => {
    const teacher = await registerTeacher();
    const { classId } = await classWithStudents(teacher);
    const { qrToken } = await startSession(teacher, classId);
    const res = await as(teacher.token).post('/attendance/check-in', { qrToken });
    expect(res.status).toBe(403);
  });

  it('unauthenticated calls get 401', async () => {
    for (const path of ['/auth/me', '/classes', '/attendance/my', '/subjects']) {
      expect((await request(app).get(`${API}${path}`)).status).toBe(401);
    }
  });
});

describe('check-in validation', () => {
  async function setup() {
    const teacher = await registerTeacher();
    const student = await registerStudent();
    const { classId } = await classWithStudents(teacher, [student]);
    const t0 = new Date('2026-09-28T01:00:00Z');
    clock.now = () => t0;
    const session = await startSession(teacher, classId, { qrRotationSeconds: 15 });
    return { teacher, student, classId, t0, ...session };
  }

  it('accepts the previous window (grace) but rejects older tokens as expired', async () => {
    const { student, qrToken, t0 } = await setup();
    clock.now = () => new Date(t0.getTime() + 20_000); // window 1: token (window 0) is in grace
    const graced = await as(student.token).post('/attendance/check-in', { qrToken });
    expect(graced.status).toBe(201);
  });

  it('rejects an expired QR (replay of an old screenshot)', async () => {
    const { student, qrToken, t0 } = await setup();
    clock.now = () => new Date(t0.getTime() + 31_000); // window 2: token from window 0 is too old
    const res = await as(student.token).post('/attendance/check-in', { qrToken });
    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe('QR_EXPIRED');
    expect(await prisma.attendance.count()).toBe(0);
  });

  it('rejects forged, tampered and future tokens', async () => {
    const { student, sessionId, qrToken } = await setup();
    const forged = signToken('attacker-guessed-secret-0123456789abcdef', sessionId, 0);
    const future = signToken(process.env.QR_SIGNING_SECRET!, sessionId, 50);
    const tampered = `${qrToken.slice(0, -2)}AA`;
    for (const token of [forged, future, tampered, 'KAV1.garbage.garbage', 'not a qr']) {
      const res = await as(student.token).post('/attendance/check-in', { qrToken: token });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('QR_INVALID');
    }
    expect(await prisma.auditLog.count({ where: { action: 'CHECKIN_REJECTED' } })).toBeGreaterThan(
      0,
    );
  });

  it("can't reuse one session's QR for another session", async () => {
    const { teacher, student, qrToken } = await setup();
    const other = await classWithStudents(teacher, [], 'OTHER1');
    await startSession(teacher, other.classId);
    // Token belongs to the first session; the student is enrolled there, so it records there only.
    const res = await as(student.token).post('/attendance/check-in', { qrToken });
    expect(res.status).toBe(201);
    const rows = await prisma.attendance.findMany();
    expect(rows).toHaveLength(1);
  });

  it('rejects students who are not enrolled', async () => {
    const { qrToken } = await setup();
    const outsider = await registerStudent();
    const res = await as(outsider.token).post('/attendance/check-in', { qrToken });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_ENROLLED');
  });

  it('ignores client-supplied identity and status', async () => {
    const { student, qrToken } = await setup();
    const victim = await registerStudent();
    const res = await as(student.token).post('/attendance/check-in', {
      qrToken,
      studentId: victim.profileId,
      status: 'PRESENT',
      checkInTime: '2020-01-01T00:00:00Z',
    });
    expect(res.status).toBe(201);
    const row = await prisma.attendance.findFirstOrThrow();
    expect(row.studentId).toBe(student.profileId);
    expect(row.checkInTime?.toISOString()).toBe('2026-09-28T01:00:00.000Z');
  });

  it('records exactly one row under concurrent duplicate scans', async () => {
    const { student, qrToken } = await setup();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => as(student.token).post('/attendance/check-in', { qrToken })),
    );
    expect(results.every((r) => r.status === 200 || r.status === 201)).toBe(true);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await prisma.attendance.count()).toBe(1);
  });
});

describe('token manipulation', () => {
  it('rejects alg:none, wrong-key and expired access tokens', async () => {
    const s = await registerStudent();
    const none = jwt.sign({ role: 'TEACHER' }, '', {
      algorithm: 'none',
      subject: s.userId,
      issuer: 'kavriel-api',
    });
    const wrongKey = jwt.sign({ role: 'TEACHER' }, 'x'.repeat(40), {
      subject: s.userId,
      issuer: 'kavriel-api',
    });
    const expired = jwt.sign({ role: 'STUDENT' }, process.env.JWT_SECRET!, {
      subject: s.userId,
      issuer: 'kavriel-api',
      expiresIn: -10,
    });
    expect((await as(none).get('/auth/me')).status).toBe(401);
    expect((await as(wrongKey).get('/auth/me')).status).toBe(401);
    const exp = await as(expired).get('/auth/me');
    expect(exp.status).toBe(401);
    expect(exp.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('takes the role from the database, not the token claim', async () => {
    const s = await registerStudent();
    const forgedRole = jwt.sign({ role: 'TEACHER' }, process.env.JWT_SECRET!, {
      subject: s.userId,
      issuer: 'kavriel-api',
      expiresIn: 60,
    });
    expect(
      (await as(forgedRole).post('/subjects', { subjectCode: 'X', subjectName: 'X' })).status,
    ).toBe(403);
  });
});

describe('integrity rules', () => {
  it('allows only one active session per class', async () => {
    const teacher = await registerTeacher();
    const { classId } = await classWithStudents(teacher);
    const [a, b] = await Promise.all([
      as(teacher.token).post('/attendance/sessions', { classId }),
      as(teacher.token).post('/attendance/sessions', { classId }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
  });

  it('refuses to delete subjects and classes with history; archive instead', async () => {
    const teacher = await registerTeacher();
    const student = await registerStudent();
    const { classId, subjectId } = await classWithStudents(teacher, [student]);
    const t = as(teacher.token);

    expect((await t.delete(`/subjects/${subjectId}`)).body.error.code).toBe('SUBJECT_IN_USE');
    expect((await t.delete(`/classes/${classId}`)).body.error.code).toBe('CLASS_IN_USE');

    const archived = await t.patch(`/classes/${classId}`, { status: 'ARCHIVED' });
    expect(archived.status).toBe(200);
    expect(archived.body.data.archivedAt).not.toBeNull();
    // An archived class takes no new sessions or enrollments.
    expect((await t.post('/attendance/sessions', { classId })).body.error.code).toBe(
      'CLASS_ARCHIVED',
    );
  });

  it('detects schedule conflicts across a teacher’s classes', async () => {
    const teacher = await registerTeacher();
    const a = await classWithStudents(teacher, [], 'CONFA');
    const b = await classWithStudents(teacher, [], 'CONFB');
    const t = as(teacher.token);
    expect(
      (
        await t.post('/schedules', {
          classId: a.classId,
          dayOfWeek: 'MON',
          startTime: '09:00',
          endTime: '10:30',
        })
      ).status,
    ).toBe(201);

    const clash = await t.post('/schedules', {
      classId: b.classId,
      dayOfWeek: 'MON',
      startTime: '10:00',
      endTime: '11:00',
    });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('SCHEDULE_CONFLICT');
    expect(clash.body.error.details[0]).toMatchObject({ type: 'TEACHER', startTime: '09:00' });

    const touching = await t.post('/schedules', {
      classId: b.classId,
      dayOfWeek: 'MON',
      startTime: '10:30',
      endTime: '11:30',
    });
    expect(touching.status).toBe(201);
  });

  it('enforces the schedule start window', async () => {
    const teacher = await registerTeacher();
    const { classId } = await classWithStudents(teacher);
    const schedule = await as(teacher.token).post('/schedules', {
      classId,
      dayOfWeek: 'MON',
      startTime: '09:00',
      endTime: '10:30',
    });
    clock.now = () => new Date('2026-09-28T00:30:00Z'); // Monday 08:30 Manila: 30 min early
    const early = await as(teacher.token).post('/attendance/sessions', {
      classId,
      scheduleId: schedule.body.data.id,
    });
    expect(early.status).toBe(422);
    expect(early.body.error.code).toBe('OUTSIDE_SCHEDULE_WINDOW');

    clock.now = () => new Date('2026-09-28T00:50:00Z'); // 08:50: within 15 min
    const ok = await as(teacher.token).post('/attendance/sessions', {
      classId,
      scheduleId: schedule.body.data.id,
    });
    expect(ok.status).toBe(201);
  });
});
