/**
 * Resource-ownership checks. Every teacher query is scoped by teacherId in the WHERE clause,
 * and a missing *or foreign* resource is reported as 404 so the API never reveals that
 * another teacher's resource exists.
 */
import { notFound } from '../lib/http-errors';
import type { DbClient } from '../modules/audit/audit.service';

export async function ownedSubject(db: DbClient, teacherId: string, id: string) {
  const subject = await db.subject.findFirst({ where: { id, ownerTeacherId: teacherId } });
  if (!subject) throw notFound('Subject');
  return subject;
}

export async function ownedClass(db: DbClient, teacherId: string, id: string) {
  const cls = await db.classSection.findFirst({ where: { id, teacherId } });
  if (!cls) throw notFound('Class');
  return cls;
}

export async function ownedSchedule(db: DbClient, teacherId: string, id: string) {
  const schedule = await db.schedule.findFirst({ where: { id, class: { teacherId } } });
  if (!schedule) throw notFound('Schedule');
  return schedule;
}

export async function ownedSession(db: DbClient, teacherId: string, id: string) {
  const session = await db.attendanceSession.findFirst({ where: { id, class: { teacherId } } });
  if (!session) throw notFound('Attendance session');
  return session;
}

export async function ownedAttendance(db: DbClient, teacherId: string, id: string) {
  const record = await db.attendance.findFirst({
    where: { id, session: { class: { teacherId } } },
    include: { session: true },
  });
  if (!record) throw notFound('Attendance record');
  return record;
}

/** Student may read a class only while actively enrolled in it. */
export async function enrolledClass(db: DbClient, studentId: string, classId: string) {
  const enrollment = await db.enrollment.findFirst({
    where: { classId, studentId, status: 'ACTIVE' },
  });
  if (!enrollment) throw notFound('Class');
  return enrollment;
}
