/**
 * Teacher attendance reports. Only closed sessions (ENDED / LOCKED) are counted: an active
 * session has no ABSENT rows yet, so including it would inflate percentages.
 */
import {
  attendancePercentage,
  emptyCounts,
  type AttendanceReportDto,
  type ReportQuery,
  type SessionReportRowDto,
  type StudentReportRowDto,
} from '@kavriel/shared';

import { prisma } from '../../config/database';
import { env } from '../../config/env';
import type { Prisma } from '../../generated/prisma/client';
import { localDateEnd, localDateStart, localParts } from '../../lib/time';
import type { TeacherActor } from '../../types/actor';
import { recordAudit } from '../audit/audit.service';
import { classRefSelect, studentSummarySelect, toClassRef, toStudentSummary } from '../mappers';
import { toCsv } from './csv';

function sessionWhere(actor: TeacherActor, q: ReportQuery): Prisma.AttendanceSessionWhereInput {
  return {
    status: { in: ['ENDED', 'LOCKED'] },
    classId: q.classId,
    class: { teacherId: actor.teacherId, subjectId: q.subjectId },
    ...(q.from || q.to
      ? {
          startedAt: {
            ...(q.from ? { gte: localDateStart(q.from) } : {}),
            ...(q.to ? { lt: localDateEnd(q.to) } : {}),
          },
        }
      : {}),
  };
}

function recordWhere(actor: TeacherActor, q: ReportQuery): Prisma.AttendanceWhereInput {
  return { session: sessionWhere(actor, q), studentId: q.studentId, status: q.status };
}

async function byStudent(actor: TeacherActor, q: ReportQuery): Promise<StudentReportRowDto[]> {
  const records = await prisma.attendance.findMany({
    where: recordWhere(actor, q),
    select: { status: true, student: { select: studentSummarySelect } },
  });
  const rows = new Map<string, StudentReportRowDto>();
  for (const r of records) {
    let row = rows.get(r.student.id);
    if (!row) {
      row = {
        student: toStudentSummary(r.student),
        counts: emptyCounts(),
        totalSessions: 0,
        percentage: null,
      };
      rows.set(r.student.id, row);
    }
    row.counts[r.status] += 1;
    row.totalSessions += 1;
  }
  return [...rows.values()]
    .map((row) => ({ ...row, percentage: attendancePercentage(row.counts) }))
    .sort(
      (a, b) =>
        a.student.lastName.localeCompare(b.student.lastName) ||
        a.student.firstName.localeCompare(b.student.firstName),
    );
}

async function bySession(actor: TeacherActor, q: ReportQuery): Promise<SessionReportRowDto[]> {
  const sessions = await prisma.attendanceSession.findMany({
    where: {
      ...sessionWhere(actor, q),
      ...(q.studentId ? { records: { some: { studentId: q.studentId } } } : {}),
    },
    select: { id: true, startedAt: true, status: true, class: { select: classRefSelect } },
    orderBy: { startedAt: 'desc' },
  });
  const grouped = await prisma.attendance.groupBy({
    by: ['sessionId', 'status'],
    where: {
      sessionId: { in: sessions.map((s) => s.id) },
      studentId: q.studentId,
      status: q.status,
    },
    _count: { _all: true },
  });
  return sessions.map((s) => {
    const counts = emptyCounts();
    for (const g of grouped) if (g.sessionId === s.id) counts[g.status] += g._count._all;
    return {
      session: { id: s.id, startedAt: s.startedAt?.toISOString() ?? null, status: s.status },
      class: toClassRef(s.class),
      counts,
      enrolledCount: counts.PRESENT + counts.LATE + counts.ABSENT + counts.EXCUSED,
    };
  });
}

export async function report(actor: TeacherActor, q: ReportQuery): Promise<AttendanceReportDto> {
  return q.groupBy === 'session'
    ? { groupBy: 'session', rows: await bySession(actor, q) }
    : { groupBy: 'student', rows: await byStudent(actor, q) };
}

function localDateTime(iso: string | null): string {
  if (!iso) return '';
  const p = localParts(new Date(iso), env.SCHOOL_TIMEZONE);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`;
}

export async function reportCsv(
  actor: TeacherActor,
  q: ReportQuery,
  ip?: string | null,
): Promise<{ filename: string; csv: string }> {
  const data = await report(actor, q);
  const csv =
    data.groupBy === 'student'
      ? toCsv(
          [
            'Student Number',
            'Last Name',
            'First Name',
            'Year Level',
            'Present',
            'Late',
            'Absent',
            'Excused',
            'Total',
            'Attendance %',
          ],
          data.rows.map((r) => [
            r.student.studentNumber,
            r.student.lastName,
            r.student.firstName,
            r.student.yearLevel,
            r.counts.PRESENT,
            r.counts.LATE,
            r.counts.ABSENT,
            r.counts.EXCUSED,
            r.totalSessions,
            r.percentage,
          ]),
        )
      : toCsv(
          [
            'Started',
            'Class Code',
            'Section',
            'Subject',
            'Status',
            'Present',
            'Late',
            'Absent',
            'Excused',
            'Roster',
          ],
          data.rows.map((r) => [
            localDateTime(r.session.startedAt),
            r.class.classCode,
            r.class.sectionName,
            r.class.subject.subjectName,
            r.session.status,
            r.counts.PRESENT,
            r.counts.LATE,
            r.counts.ABSENT,
            r.counts.EXCUSED,
            r.enrolledCount,
          ]),
        );

  await recordAudit(prisma, {
    userId: actor.userId,
    action: 'REPORT_EXPORTED',
    entityType: 'Report',
    entityId: data.groupBy,
    metadata: { ...q },
    ipAddress: ip,
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return { filename: `attendance-${data.groupBy}-${stamp}.csv`, csv };
}
