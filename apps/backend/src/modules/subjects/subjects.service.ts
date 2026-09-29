import type { CreateSubjectInput, SubjectDto } from '@kavriel/shared';
import type { listSubjectsQuery, updateSubjectSchema } from '@kavriel/shared';
import type { z } from 'zod';

import { prisma } from '../../config/database';
import { conflict, notFound, unprocessable } from '../../lib/http-errors';
import { clock } from '../../lib/time';
import { ownedSubject } from '../../policies/ownership';
import type { TeacherActor } from '../../types/actor';
import { diff, recordAudit } from '../audit/audit.service';
import { toSubjectDto } from '../mappers';

const include = { yearLevel: true, _count: { select: { classes: true } } } as const;

async function assertCodeFree(teacherId: string, subjectCode: string, exceptId?: string) {
  const clash = await prisma.subject.findFirst({
    where: {
      ownerTeacherId: teacherId,
      subjectCode,
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
  });
  if (clash)
    throw conflict('SUBJECT_CODE_TAKEN', `You already have a subject with code ${subjectCode}`);
}

async function assertYearLevel(yearLevelId: number | undefined) {
  if (yearLevelId && !(await prisma.yearLevel.findUnique({ where: { id: yearLevelId } }))) {
    throw notFound('Year level');
  }
}

export async function list(
  actor: TeacherActor,
  query: z.output<typeof listSubjectsQuery>,
): Promise<SubjectDto[]> {
  const rows = await prisma.subject.findMany({
    where: {
      ownerTeacherId: actor.teacherId,
      status: query.status,
      ...(query.q
        ? {
            OR: [
              { subjectCode: { contains: query.q, mode: 'insensitive' } },
              { subjectName: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    include,
    orderBy: [{ status: 'asc' }, { subjectCode: 'asc' }],
  });
  return rows.map(toSubjectDto);
}

export async function get(actor: TeacherActor, id: string): Promise<SubjectDto> {
  await ownedSubject(prisma, actor.teacherId, id);
  return toSubjectDto(await prisma.subject.findUniqueOrThrow({ where: { id }, include }));
}

export async function create(actor: TeacherActor, input: CreateSubjectInput): Promise<SubjectDto> {
  await assertCodeFree(actor.teacherId, input.subjectCode);
  await assertYearLevel(input.yearLevelId);

  const subject = await prisma.$transaction(async (tx) => {
    const created = await tx.subject.create({
      data: { ...input, ownerTeacherId: actor.teacherId },
      include,
    });
    await recordAudit(tx, {
      userId: actor.userId,
      action: 'SUBJECT_CREATED',
      entityType: 'Subject',
      entityId: created.id,
      metadata: { subjectCode: created.subjectCode },
    });
    return created;
  });
  return toSubjectDto(subject);
}

export async function update(
  actor: TeacherActor,
  id: string,
  input: z.output<typeof updateSubjectSchema>,
): Promise<SubjectDto> {
  const before = await ownedSubject(prisma, actor.teacherId, id);
  if (input.subjectCode) await assertCodeFree(actor.teacherId, input.subjectCode, id);
  await assertYearLevel(input.yearLevelId);

  const archiving = input.status === 'ARCHIVED' && before.status !== 'ARCHIVED';
  const restoring = input.status === 'ACTIVE' && before.status === 'ARCHIVED';

  const subject = await prisma.$transaction(async (tx) => {
    const updated = await tx.subject.update({
      where: { id },
      data: {
        ...input,
        ...(archiving ? { archivedAt: clock.now() } : {}),
        ...(restoring ? { archivedAt: null } : {}),
      },
      include,
    });
    await recordAudit(tx, {
      userId: actor.userId,
      action: archiving ? 'SUBJECT_ARCHIVED' : 'SUBJECT_UPDATED',
      entityType: 'Subject',
      entityId: id,
      metadata: diff(before, { ...input, units: input.units }),
    });
    return updated;
  });
  return toSubjectDto(subject);
}

/** Hard delete only when no class uses the subject; otherwise the client should archive. */
export async function remove(actor: TeacherActor, id: string): Promise<void> {
  const subject = await ownedSubject(prisma, actor.teacherId, id);
  const inUse = await prisma.classSection.count({ where: { subjectId: id } });
  if (inUse > 0) {
    throw conflict('SUBJECT_IN_USE', 'This subject has classes. Archive it instead.');
  }
  await prisma.$transaction(async (tx) => {
    await tx.subject.delete({ where: { id } });
    await recordAudit(tx, {
      userId: actor.userId,
      action: 'SUBJECT_DELETED',
      entityType: 'Subject',
      entityId: id,
      metadata: { subjectCode: subject.subjectCode },
    });
  });
}

/** Used by classes: the subject must be owned and active. */
export async function assertUsableSubject(teacherId: string, subjectId: string) {
  const subject = await ownedSubject(prisma, teacherId, subjectId);
  if (subject.status === 'ARCHIVED') {
    throw unprocessable('SUBJECT_ARCHIVED', 'This subject is archived');
  }
  return subject;
}
