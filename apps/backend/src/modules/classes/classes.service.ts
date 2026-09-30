import type { ClassDetailDto, ClassDto, CreateClassInput } from '@kavriel/shared';
import type { listClassesQuery, updateClassSchema } from '@kavriel/shared';
import type { z } from 'zod';

import { prisma } from '../../config/database';
import type { Prisma } from '../../generated/prisma/client';
import { conflict, notFound, unprocessable } from '../../lib/http-errors';
import { clock } from '../../lib/time';
import { enrolledClass, ownedClass } from '../../policies/ownership';
import type { Actor, TeacherActor } from '../../types/actor';
import { diff, recordAudit } from '../audit/audit.service';
import { fullName, scheduleInclude, toClassRef, toScheduleDto } from '../mappers';
import { assertUsableSubject } from '../subjects/subjects.service';

const classInclude = {
  subject: { select: { id: true, subjectCode: true, subjectName: true } },
  teacher: { select: { id: true, firstName: true, middleName: true, lastName: true } },
  semester: { include: { academicYear: { select: { name: true } } } },
  _count: { select: { enrollments: { where: { status: 'ACTIVE' } } } },
} satisfies Prisma.ClassSectionInclude;

type ClassRow = Prisma.ClassSectionGetPayload<{ include: typeof classInclude }>;

export function toClassDto(c: ClassRow): ClassDto {
  return {
    ...toClassRef(c),
    status: c.status,
    archivedAt: c.archivedAt?.toISOString() ?? null,
    teacher: { id: c.teacher.id, fullName: fullName(c.teacher) },
    semester: {
      id: c.semester.id,
      name: c.semester.name,
      academicYear: c.semester.academicYear.name,
    },
    enrolledCount: c._count.enrollments,
  };
}

async function assertCodeFree(
  teacherId: string,
  semesterId: number,
  classCode: string,
  exceptId?: string,
) {
  const clash = await prisma.classSection.findFirst({
    where: { teacherId, semesterId, classCode, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
  });
  if (clash) {
    throw conflict('CLASS_CODE_TAKEN', `You already have a class ${classCode} this semester`);
  }
}

async function assertSemester(semesterId: number) {
  if (!(await prisma.semester.findUnique({ where: { id: semesterId } })))
    throw notFound('Term');
}

export async function list(
  actor: Actor,
  query: z.output<typeof listClassesQuery>,
): Promise<ClassDto[]> {
  const scope: Prisma.ClassSectionWhereInput =
    actor.role === 'TEACHER'
      ? { teacherId: actor.teacherId! }
      : { enrollments: { some: { studentId: actor.studentId!, status: 'ACTIVE' } } };

  const rows = await prisma.classSection.findMany({
    where: {
      ...scope,
      status: query.status,
      semesterId: query.semesterId,
      subjectId: query.subjectId,
    },
    include: classInclude,
    orderBy: [{ status: 'asc' }, { classCode: 'asc' }],
  });
  return rows.map(toClassDto);
}

export async function get(actor: Actor, id: string): Promise<ClassDetailDto> {
  if (actor.role === 'TEACHER') await ownedClass(prisma, actor.teacherId!, id);
  else await enrolledClass(prisma, actor.studentId!, id);

  const cls = await prisma.classSection.findUniqueOrThrow({ where: { id }, include: classInclude });
  const schedules = await prisma.schedule.findMany({
    where: { classId: id, status: 'ACTIVE' },
    include: scheduleInclude,
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  });
  return { ...toClassDto(cls), schedules: schedules.map(toScheduleDto) };
}

export async function create(actor: TeacherActor, input: CreateClassInput): Promise<ClassDto> {
  await assertUsableSubject(actor.teacherId, input.subjectId);
  await assertSemester(input.semesterId);
  await assertCodeFree(actor.teacherId, input.semesterId, input.classCode);

  const cls = await prisma.$transaction(async (tx) => {
    const created = await tx.classSection.create({
      data: { ...input, teacherId: actor.teacherId },
      include: classInclude,
    });
    await recordAudit(tx, {
      userId: actor.userId,
      action: 'CLASS_CREATED',
      entityType: 'ClassSection',
      entityId: created.id,
      metadata: { classCode: created.classCode, subjectId: created.subjectId },
    });
    return created;
  });
  return toClassDto(cls);
}

export async function update(
  actor: TeacherActor,
  id: string,
  input: z.output<typeof updateClassSchema>,
): Promise<ClassDto> {
  const before = await ownedClass(prisma, actor.teacherId, id);
  if (input.semesterId) await assertSemester(input.semesterId);
  if (input.classCode || input.semesterId) {
    await assertCodeFree(
      actor.teacherId,
      input.semesterId ?? before.semesterId,
      input.classCode ?? before.classCode,
      id,
    );
  }

  const archiving = input.status === 'ARCHIVED' && before.status !== 'ARCHIVED';
  const restoring = input.status === 'ACTIVE' && before.status === 'ARCHIVED';
  if (archiving) {
    const active = await prisma.attendanceSession.count({
      where: { classId: id, status: 'ACTIVE' },
    });
    if (active > 0) throw conflict('SESSION_ACTIVE', 'End the active attendance session first');
  }

  const cls = await prisma.$transaction(async (tx) => {
    const updated = await tx.classSection.update({
      where: { id },
      data: {
        ...input,
        ...(archiving ? { archivedAt: clock.now() } : {}),
        ...(restoring ? { archivedAt: null } : {}),
      },
      include: classInclude,
    });
    await recordAudit(tx, {
      userId: actor.userId,
      action: archiving ? 'CLASS_ARCHIVED' : 'CLASS_UPDATED',
      entityType: 'ClassSection',
      entityId: id,
      metadata: diff(before, input),
    });
    return updated;
  });
  return toClassDto(cls);
}

/** Hard delete only an unused class; anything with history must be archived. */
export async function remove(actor: TeacherActor, id: string): Promise<void> {
  const cls = await ownedClass(prisma, actor.teacherId, id);
  const [enrollments, schedules, sessions] = await Promise.all([
    prisma.enrollment.count({ where: { classId: id } }),
    prisma.schedule.count({ where: { classId: id } }),
    prisma.attendanceSession.count({ where: { classId: id } }),
  ]);
  if (enrollments + schedules + sessions > 0) {
    throw conflict(
      'CLASS_IN_USE',
      'This class has students, schedules or sessions. Archive it instead.',
    );
  }
  await prisma.$transaction(async (tx) => {
    await tx.classSection.delete({ where: { id } });
    await recordAudit(tx, {
      userId: actor.userId,
      action: 'CLASS_DELETED',
      entityType: 'ClassSection',
      entityId: id,
      metadata: { classCode: cls.classCode },
    });
  });
}

/** Used by enrollment, schedules and sessions: class must be owned and not archived. */
export async function assertActiveOwnedClass(teacherId: string, classId: string) {
  const cls = await ownedClass(prisma, teacherId, classId);
  if (cls.status === 'ARCHIVED') throw unprocessable('CLASS_ARCHIVED', 'This class is archived');
  return cls;
}
