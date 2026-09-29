/** Row → DTO mappers shared across modules. Names are always read through relations, never copied. */
import {
  emptyCounts,
  type ClassSummaryRefDto,
  type ScheduleDto,
  type StatusCounts,
  type StudentSummaryDto,
  type SubjectDto,
} from '@kavriel/shared';

import type { AttendanceStatus } from '../generated/prisma/enums';
import { dbToTime } from '../lib/time';

interface NameParts {
  firstName: string;
  middleName?: string | null;
  lastName: string;
}

export function fullName(p: NameParts): string {
  const middleInitial = p.middleName ? ` ${p.middleName.charAt(0)}.` : '';
  return `${p.firstName}${middleInitial} ${p.lastName}`;
}

export const studentSummarySelect = {
  id: true,
  studentNumber: true,
  firstName: true,
  middleName: true,
  lastName: true,
  yearLevel: { select: { name: true } },
} as const;

export function toStudentSummary(s: {
  id: string;
  studentNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  yearLevel: { name: string } | null;
}): StudentSummaryDto {
  return {
    id: s.id,
    studentNumber: s.studentNumber,
    firstName: s.firstName,
    lastName: s.lastName,
    fullName: fullName(s),
    yearLevel: s.yearLevel?.name ?? null,
  };
}

export const classRefSelect = {
  id: true,
  classCode: true,
  sectionName: true,
  subject: { select: { id: true, subjectCode: true, subjectName: true } },
} as const;

export function toClassRef(c: {
  id: string;
  classCode: string;
  sectionName: string;
  subject: { id: string; subjectCode: string; subjectName: string };
}): ClassSummaryRefDto {
  return {
    id: c.id,
    classCode: c.classCode,
    sectionName: c.sectionName,
    subject: { ...c.subject },
  };
}

export const scheduleInclude = { class: { select: classRefSelect } } as const;

export function toScheduleDto(s: {
  id: string;
  dayOfWeek: ScheduleDto['dayOfWeek'];
  startTime: Date;
  endTime: Date;
  room: string | null;
  status: ScheduleDto['status'];
  class: Parameters<typeof toClassRef>[0];
}): ScheduleDto {
  return {
    id: s.id,
    dayOfWeek: s.dayOfWeek,
    startTime: dbToTime(s.startTime),
    endTime: dbToTime(s.endTime),
    room: s.room,
    status: s.status,
    class: toClassRef(s.class),
  };
}

export function toSubjectDto(s: {
  id: string;
  subjectCode: string;
  subjectName: string;
  description: string | null;
  units: { toNumber(): number } | null;
  status: SubjectDto['status'];
  archivedAt: Date | null;
  yearLevel: { id: number; name: string } | null;
  _count?: { classes: number };
}): SubjectDto {
  return {
    id: s.id,
    subjectCode: s.subjectCode,
    subjectName: s.subjectName,
    description: s.description,
    units: s.units ? s.units.toNumber() : null,
    status: s.status,
    archivedAt: s.archivedAt?.toISOString() ?? null,
    yearLevel: s.yearLevel ? { id: s.yearLevel.id, name: s.yearLevel.name } : null,
    classCount: s._count?.classes ?? 0,
  };
}

/** Fold `groupBy` rows of `{ status, _count }` into a full status count object. */
export function countsFrom(
  rows: Array<{ status: AttendanceStatus; _count: { _all: number } | number }>,
): StatusCounts {
  const counts = emptyCounts();
  for (const row of rows) {
    counts[row.status] += typeof row._count === 'number' ? row._count : row._count._all;
  }
  return counts;
}

export const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
