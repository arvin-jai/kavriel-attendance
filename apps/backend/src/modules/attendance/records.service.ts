import {
  attendancePercentage,
  emptyCounts,
  type AttendanceRecordDto,
  type AttendanceSummaryDto,
  type MyAttendanceItemDto,
  type RosterEntryDto,
  type SessionRecordsDto,
} from '@kavriel/shared';
import type {
  markAttendanceSchema,
  myAttendanceQuery,
  updateAttendanceSchema,
} from '@kavriel/shared';
import type { z } from 'zod';

import { prisma } from '../../config/database';
import type { Prisma } from '../../generated/prisma/client';
import { conflict, notFound } from '../../lib/http-errors';
import { localDateEnd, localDateStart } from '../../lib/time';
import { enrolledClass, ownedAttendance, ownedSession } from '../../policies/ownership';
import type { StudentActor, TeacherActor } from '../../types/actor';
import { diff, recordAudit, type DbClient } from '../audit/audit.service';
import {
  classRefSelect,
  countsFrom,
  studentSummarySelect,
  toClassRef,
  toStudentSummary,
} from '../mappers';

function toRecordDto(r: {
  id: string;
  status: AttendanceRecordDto['status'];
  source: AttendanceRecordDto['source'];
  checkInTime: Date | null;
  remarks: string | null;
  updatedAt: Date;
}): AttendanceRecordDto {
  return {
    id: r.id,
    status: r.status,
    source: r.source,
    checkInTime: r.checkInTime?.toISOString() ?? null,
    remarks: r.remarks,
    updatedAt: r.updatedAt.toISOString(),
  };
}

function assertEditable(status: string) {
  if (status === 'LOCKED') throw conflict('SESSION_LOCKED', 'This session is locked');
  if (status === 'PENDING') throw conflict('SESSION_NOT_ACTIVE', 'This session has not started');
}

/**
 * Roster for the teacher's live view. Open sessions list every actively enrolled student
 * (record or null). With `since`, only records changed after that instant are returned,
 * which keeps 3-second polling cheap; the client merges them.
 */
export async function sessionRecords(
  actor: TeacherActor,
  sessionId: string,
  since?: string,
): Promise<SessionRecordsDto> {
  // The polling cursor is compared with `updatedAt`, which Prisma stamps from the wall clock,
  // so it must come from the same clock (not the injectable business clock). Taken before the
  // reads: a change landing mid-request shows up again next poll, which the client merges.
  const serverTime = new Date();
  const session = await ownedSession(prisma, actor.teacherId, sessionId);

  const [records, grouped, enrollments] = await Promise.all([
    prisma.attendance.findMany({
      where: { sessionId, ...(since ? { updatedAt: { gt: new Date(since) } } : {}) },
      include: { student: { select: studentSummarySelect } },
    }),
    prisma.attendance.groupBy({ by: ['status'], where: { sessionId }, _count: { _all: true } }),
    since || session.status === 'ENDED' || session.status === 'LOCKED'
      ? Promise.resolve([])
      : prisma.enrollment.findMany({
          where: { classId: session.classId, status: 'ACTIVE' },
          include: { student: { select: studentSummarySelect } },
        }),
  ]);

  const entries = new Map<string, RosterEntryDto>();
  for (const e of enrollments) {
    entries.set(e.studentId, { student: toStudentSummary(e.student), record: null });
  }
  for (const r of records) {
    entries.set(r.studentId, { student: toStudentSummary(r.student), record: toRecordDto(r) });
  }

  const counts = countsFrom(grouped);
  const enrolledCount =
    session.status === 'ACTIVE' || session.status === 'PENDING'
      ? await prisma.enrollment.count({ where: { classId: session.classId, status: 'ACTIVE' } })
      : counts.PRESENT + counts.LATE + counts.ABSENT + counts.EXCUSED;

  return {
    serverTime: serverTime.toISOString(),
    session: { id: session.id, status: session.status },
    counts,
    enrolledCount,
    entries: [...entries.values()].sort(
      (a, b) =>
        a.student.lastName.localeCompare(b.student.lastName) ||
        a.student.firstName.localeCompare(b.student.firstName),
    ),
  };
}

/**
 * Session status read with FOR SHARE inside the caller's transaction. A concurrent end/lock
 * (an UPDATE of that row) must wait until this transaction finishes, so an edit can never
 * land after the session was locked.
 */
async function lockedSessionStatus(tx: DbClient, sessionId: string): Promise<string> {
  const rows = await tx.$queryRaw<{ status: string }[]>`
    SELECT status::text AS status FROM "AttendanceSession" WHERE id = ${sessionId}::uuid FOR SHARE`;
  if (!rows[0]) throw notFound('Attendance session');
  return rows[0].status;
}

/** Teacher correction of an existing record (status and/or remarks). Audited with before/after. */
export async function updateRecord(
  actor: TeacherActor,
  attendanceId: string,
  input: z.output<typeof updateAttendanceSchema>,
): Promise<AttendanceRecordDto> {
  const before = await ownedAttendance(prisma, actor.teacherId, attendanceId);
  assertEditable(before.session.status);

  const updated = await prisma.$transaction(async (tx) => {
    assertEditable(await lockedSessionStatus(tx, before.sessionId));
    const row = await tx.attendance.update({
      where: { id: attendanceId },
      data: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.remarks !== undefined ? { remarks: input.remarks || null } : {}),
      },
    });
    await recordAudit(tx, {
      userId: actor.userId,
      action: 'ATTENDANCE_UPDATED',
      entityType: 'Attendance',
      entityId: attendanceId,
      metadata: {
        sessionId: before.sessionId,
        studentId: before.studentId,
        ...diff(before, input),
      },
    });
    return row;
  });
  return toRecordDto(updated);
}

/** Teacher marks a student who has no record yet (or updates the existing one). */
export async function markStudent(
  actor: TeacherActor,
  sessionId: string,
  studentId: string,
  input: z.output<typeof markAttendanceSchema>,
): Promise<{ record: AttendanceRecordDto; created: boolean }> {
  const session = await ownedSession(prisma, actor.teacherId, sessionId);
  assertEditable(session.status);

  const existing = await prisma.attendance.findUnique({
    where: { sessionId_studentId: { sessionId, studentId } },
  });
  if (existing) {
    const record = await updateRecord(actor, existing.id, input);
    return { record, created: false };
  }

  const enrollment = await prisma.enrollment.findFirst({
    where: { classId: session.classId, studentId, status: 'ACTIVE' },
  });
  if (!enrollment) throw notFound('Enrolled student');

  const created = await prisma.$transaction(async (tx) => {
    assertEditable(await lockedSessionStatus(tx, sessionId));
    const row = await tx.attendance.create({
      data: {
        sessionId,
        studentId,
        status: input.status,
        source: 'MANUAL',
        remarks: input.remarks || null,
      },
    });
    await recordAudit(tx, {
      userId: actor.userId,
      action: 'ATTENDANCE_CREATED',
      entityType: 'Attendance',
      entityId: row.id,
      metadata: { source: 'MANUAL', sessionId, studentId, status: input.status },
    });
    return row;
  });
  return { record: toRecordDto(created), created: true };
}

// ───────────── Student views ─────────────

export async function myAttendance(
  actor: StudentActor,
  query: z.output<typeof myAttendanceQuery>,
): Promise<{ data: MyAttendanceItemDto[]; nextCursor: string | null }> {
  const where: Prisma.AttendanceWhereInput = {
    studentId: actor.studentId,
    sessionId: query.sessionId,
    session: {
      classId: query.classId,
      ...(query.from || query.to
        ? {
            startedAt: {
              ...(query.from ? { gte: localDateStart(query.from) } : {}),
              ...(query.to ? { lt: localDateEnd(query.to) } : {}),
            },
          }
        : {}),
    },
  };
  const rows = await prisma.attendance.findMany({
    where,
    include: {
      session: { select: { id: true, startedAt: true, class: { select: classRefSelect } } },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
  const page = rows.slice(0, query.limit);
  return {
    data: page.map((r) => ({
      id: r.id,
      status: r.status,
      checkInTime: r.checkInTime?.toISOString() ?? null,
      remarks: r.remarks,
      session: {
        id: r.session.id,
        startedAt: r.session.startedAt?.toISOString() ?? null,
        class: toClassRef(r.session.class),
      },
    })),
    nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
  };
}

/** Per-class totals and percentage for the student's active enrollments. */
export async function mySummary(
  actor: StudentActor,
  classId?: string,
): Promise<AttendanceSummaryDto[]> {
  if (classId) await enrolledClass(prisma, actor.studentId, classId);
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId: actor.studentId, status: 'ACTIVE', classId },
    include: { class: { select: classRefSelect } },
    orderBy: { class: { classCode: 'asc' } },
  });
  const grouped = await prisma.attendance.findMany({
    where: {
      studentId: actor.studentId,
      session: { classId: { in: enrollments.map((e) => e.classId) } },
    },
    select: { status: true, session: { select: { classId: true } } },
  });

  return enrollments.map((e) => {
    const counts = emptyCounts();
    for (const r of grouped) if (r.session.classId === e.classId) counts[r.status] += 1;
    return {
      class: toClassRef(e.class),
      counts,
      totalSessions: counts.PRESENT + counts.LATE + counts.ABSENT + counts.EXCUSED,
      percentage: attendancePercentage(counts),
    };
  });
}
