/**
 * End-to-end MVP flow through the real API and PostgreSQL:
 * teacher + student register → subject → class → enroll → schedule → start attendance →
 * QR → student scans → teacher sees it → end (absentees) → correct → lock → student history.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { clock } from '../../src/lib/time';
import {
  as,
  classWithStudents,
  currentSemesterId,
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

describe('attendance flow', () => {
  it('runs the full teacher/student journey', async () => {
    const teacher = await registerTeacher();
    const alice = await registerStudent({ firstName: 'Alice', lastName: 'Aquino' });
    const bob = await registerStudent({ firstName: 'Bob', lastName: 'Bautista' });
    const t = as(teacher.token);

    // Subject → class → enrollment
    const subject = await t.post('/subjects', {
      subjectCode: 'math101',
      subjectName: 'Mathematics',
      units: 3,
    });
    expect(subject.status).toBe(201);
    expect(subject.body.data.subjectCode).toBe('MATH101');

    const cls = await t.post('/classes', {
      subjectId: subject.body.data.id,
      semesterId: await currentSemesterId(),
      sectionName: 'Section A',
      classCode: 'MATH101-A',
    });
    expect(cls.status).toBe(201);
    const classId = cls.body.data.id as string;

    const lookup = await t.get(`/students/lookup?studentNumber=${alice.studentNumber}`);
    expect(lookup.status).toBe(200);
    expect(lookup.body.data.fullName).toBe('Alice Aquino');

    for (const s of [alice, bob]) {
      const e = await t.post(`/classes/${classId}/students`, { studentNumber: s.studentNumber });
      expect(e.status).toBe(201);
    }

    // Schedule on a Monday, 09:00–10:30 school time
    const schedule = await t.post('/schedules', {
      classId,
      dayOfWeek: 'MON',
      startTime: '09:00',
      endTime: '10:30',
      room: 'Room 201',
    });
    expect(schedule.status).toBe(201);

    // Pretend it's Monday 2026-09-28 09:02 in Manila (01:02Z).
    const start = new Date('2026-09-28T01:02:00Z');
    clock.now = () => start;

    const today = await t.get('/schedules/today');
    expect(today.body.data).toHaveLength(1);
    expect(today.body.data[0].canStart).toBe(true);

    const session = await t.post('/attendance/sessions', {
      classId,
      scheduleId: schedule.body.data.id,
    });
    expect(session.status).toBe(201);
    expect(session.body.data.status).toBe('ACTIVE');
    const sessionId = session.body.data.id as string;

    const qr = await t.get(`/attendance/sessions/${sessionId}/qr`);
    expect(qr.status).toBe(200);
    expect(qr.headers['cache-control']).toBe('no-store');
    expect(qr.body.data.windowIndex).toBe(0);

    // Student scans → recorded PRESENT
    const checkIn = await as(alice.token).post('/attendance/check-in', {
      qrToken: qr.body.data.token,
    });
    expect(checkIn.status).toBe(201);
    expect(checkIn.body.data).toMatchObject({
      alreadyRecorded: false,
      attendance: { status: 'PRESENT' },
      session: { classCode: 'MATH101-A', subjectName: 'Mathematics' },
    });

    // Scanning again is idempotent
    const again = await as(alice.token).post('/attendance/check-in', {
      qrToken: qr.body.data.token,
    });
    expect(again.status).toBe(200);
    expect(again.body.data.alreadyRecorded).toBe(true);

    // Teacher sees the live roster (Bob still pending)
    const records = await t.get(`/attendance/sessions/${sessionId}/records`);
    expect(records.status).toBe(200);
    expect(records.body.data.counts.PRESENT).toBe(1);
    expect(records.body.data.enrolledCount).toBe(2);
    const bobEntry = records.body.data.entries.find(
      (e: { student: { firstName: string } }) => e.student.firstName === 'Bob',
    );
    expect(bobEntry.record).toBeNull();

    // `since` returns only changes after the cursor
    const delta = await t.get(
      `/attendance/sessions/${sessionId}/records?since=${records.body.data.serverTime}`,
    );
    expect(delta.body.data.entries).toHaveLength(0);

    // End → Bob marked ABSENT automatically
    const end = await t.post(`/attendance/sessions/${sessionId}/end`);
    expect(end.status).toBe(200);
    expect(end.body.data.absentMarked).toBe(1);
    expect(end.body.data.session.counts).toMatchObject({ PRESENT: 1, ABSENT: 1 });

    // Scanning after the end is refused
    const late = await as(bob.token).post('/attendance/check-in', { qrToken: qr.body.data.token });
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('SESSION_NOT_ACTIVE');

    // Teacher corrects Bob to EXCUSED with remarks (audited)
    const ended = await t.get(`/attendance/sessions/${sessionId}/records`);
    const bobRecord = ended.body.data.entries.find(
      (e: { student: { firstName: string } }) => e.student.firstName === 'Bob',
    ).record;
    const fix = await t.patch(`/attendance/${bobRecord.id}`, {
      status: 'EXCUSED',
      remarks: 'Medical certificate',
    });
    expect(fix.status).toBe(200);
    expect(fix.body.data).toMatchObject({ status: 'EXCUSED', remarks: 'Medical certificate' });
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'ATTENDANCE_UPDATED', entityId: bobRecord.id },
    });
    expect(audit?.metadata).toMatchObject({ status: { from: 'ABSENT', to: 'EXCUSED' } });

    // Lock → read-only
    const lock = await t.post(`/attendance/sessions/${sessionId}/lock`);
    expect(lock.status).toBe(200);
    expect(lock.body.data.status).toBe('LOCKED');
    const blocked = await t.patch(`/attendance/${bobRecord.id}`, { status: 'PRESENT' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('SESSION_LOCKED');

    // Student history and summary
    const history = await as(alice.token).get('/attendance/my');
    expect(history.status).toBe(200);
    expect(history.body.data).toHaveLength(1);
    expect(history.body.data[0]).toMatchObject({
      status: 'PRESENT',
      session: { class: { classCode: 'MATH101-A' } },
    });

    const summary = await as(bob.token).get('/attendance/my/summary');
    expect(summary.body.data[0]).toMatchObject({
      totalSessions: 1,
      percentage: null,
      counts: { EXCUSED: 1 },
    });

    // Reports (closed sessions only) and CSV export
    const report = await t.get(`/reports/attendance?classId=${classId}`);
    expect(report.status).toBe(200);
    expect(report.body.data.rows).toHaveLength(2);
    const csv = await t.get(`/reports/attendance.csv?classId=${classId}`);
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('Aquino');

    // Every state change left an audit trail
    const actions = (await prisma.auditLog.findMany({ select: { action: true } })).map(
      (a) => a.action,
    );
    for (const action of [
      'SUBJECT_CREATED',
      'CLASS_CREATED',
      'STUDENT_ENROLLED',
      'SCHEDULE_CREATED',
      'SESSION_CREATED',
      'SESSION_STARTED',
      'ATTENDANCE_CREATED',
      'SESSION_ENDED',
      'ATTENDANCE_UPDATED',
      'SESSION_LOCKED',
      'REPORT_EXPORTED',
    ]) {
      expect(actions).toContain(action);
    }
  });

  it('marks check-ins after the late threshold as LATE', async () => {
    const teacher = await registerTeacher();
    const student = await registerStudent();
    const { classId } = await classWithStudents(teacher, [student]);

    const t0 = new Date('2026-09-28T01:00:00Z');
    clock.now = () => t0;
    const { sessionId } = await startSession(teacher, classId, {
      lateAfterMinutes: 10,
      qrRotationSeconds: 15,
    });

    clock.now = () => new Date(t0.getTime() + 11 * 60_000);
    const qr = await as(teacher.token).get(`/attendance/sessions/${sessionId}/qr`);
    const res = await as(student.token).post('/attendance/check-in', {
      qrToken: qr.body.data.token,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.attendance.status).toBe('LATE');
  });

  it('lets the teacher mark a pending student manually', async () => {
    const teacher = await registerTeacher();
    const student = await registerStudent();
    const { classId } = await classWithStudents(teacher, [student]);
    const { sessionId } = await startSession(teacher, classId);

    const res = await as(teacher.token).put(
      `/attendance/sessions/${sessionId}/records/${student.profileId}`,
      {
        status: 'PRESENT',
        remarks: 'Phone battery died',
      },
    );
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: 'PRESENT', source: 'MANUAL' });
  });

  it('keeps history when a student is dropped', async () => {
    const teacher = await registerTeacher();
    const student = await registerStudent();
    const { classId } = await classWithStudents(teacher, [student]);
    const { qrToken } = await startSession(teacher, classId);
    await as(student.token).post('/attendance/check-in', { qrToken });

    const drop = await as(teacher.token).delete(
      `/classes/${classId}/students/${student.profileId}`,
    );
    expect(drop.status).toBe(204);
    const enrollment = await prisma.enrollment.findFirstOrThrow({ where: { classId } });
    expect(enrollment.status).toBe('DROPPED');
    expect(await prisma.attendance.count({ where: { studentId: student.profileId } })).toBe(1);

    // Re-enrolling reactivates the same row
    const again = await as(teacher.token).post(`/classes/${classId}/students`, {
      studentNumber: student.studentNumber,
    });
    expect(again.status).toBe(200);
    expect(again.body.data.id).toBe(enrollment.id);
  });

  it("lists only the current semester's classes in today's schedule", async () => {
    const teacher = await registerTeacher();
    const student = await registerStudent();
    const t = as(teacher.token);
    const now = await classWithStudents(teacher, [student], 'NOWSEM');
    // A class from the previous academic year that nobody archived.
    const oldSemester = await currentSemesterId('2026-01-15');
    const subject = await t.post('/subjects', { subjectCode: 'OLD-1', subjectName: 'Old' });
    const old = await t.post('/classes', {
      subjectId: subject.body.data.id,
      semesterId: oldSemester,
      sectionName: 'Old',
      classCode: 'OLD-1',
    });
    await t.post(`/classes/${old.body.data.id}/students`, { studentNumber: student.studentNumber });
    for (const classId of [now.classId, old.body.data.id]) {
      await t.post('/schedules', {
        classId,
        dayOfWeek: 'MON',
        startTime: '09:00',
        endTime: '10:00',
      });
    }

    clock.now = () => new Date('2026-09-28T01:05:00Z'); // Monday 09:05 Manila
    for (const token of [teacher.token, student.token]) {
      const today = await as(token).get('/schedules/today');
      expect(today.body.data.map((s: { class: { id: string } }) => s.class.id)).toEqual([
        now.classId,
      ]);
    }
  });

  it('keeps percentages over all records when a report is filtered by status', async () => {
    const teacher = await registerTeacher();
    const student = await registerStudent();
    const { classId } = await classWithStudents(teacher, [student]);

    // Session 1: present. Session 2: absent (never scanned).
    const first = await startSession(teacher, classId);
    await as(student.token).post('/attendance/check-in', { qrToken: first.qrToken });
    await as(teacher.token).post(`/attendance/sessions/${first.sessionId}/end`);
    const second = await startSession(teacher, classId);
    await as(teacher.token).post(`/attendance/sessions/${second.sessionId}/end`);

    const absent = await as(teacher.token).get(
      `/reports/attendance?classId=${classId}&status=ABSENT`,
    );
    expect(absent.body.data.rows).toHaveLength(1);
    expect(absent.body.data.rows[0]).toMatchObject({
      counts: { PRESENT: 1, ABSENT: 1 },
      totalSessions: 2,
      percentage: 50,
    });

    const bySession = await as(teacher.token).get(
      `/reports/attendance?classId=${classId}&status=ABSENT&groupBy=session`,
    );
    expect(bySession.body.data.rows).toHaveLength(1);
    expect(bySession.body.data.rows[0].session.id).toBe(second.sessionId);

    const excused = await as(teacher.token).get(
      `/reports/attendance?classId=${classId}&status=EXCUSED`,
    );
    expect(excused.body.data.rows).toEqual([]);
  });
});
