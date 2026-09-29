import type { CreateScheduleInput, ScheduleDto, TodayScheduleDto } from '@kavriel/shared';
import type { listSchedulesQuery, updateScheduleSchema } from '@kavriel/shared';
import type { z } from 'zod';

import { prisma } from '../../config/database';
import { env } from '../../config/env';
import type { Prisma } from '../../generated/prisma/client';
import { badRequest, conflict, notFound } from '../../lib/http-errors';
import {
  clock,
  dbToTime,
  localDayOfWeek,
  localMinutes,
  localParts,
  timeToDb,
  timeToMinutes,
} from '../../lib/time';
import { enrolledClass, ownedSchedule } from '../../policies/ownership';
import type { Actor, TeacherActor } from '../../types/actor';
import { diff, recordAudit } from '../audit/audit.service';
import { assertActiveOwnedClass } from '../classes/classes.service';
import { scheduleInclude, toScheduleDto } from '../mappers';
import { durationError, findConflicts, withinStartWindow, type TimeSlot } from './schedule-rules';

function scopeFor(
  actor: Actor,
  extraClassWhere: Prisma.ClassSectionWhereInput = {},
): Prisma.ScheduleWhereInput {
  return actor.role === 'TEACHER'
    ? { class: { teacherId: actor.teacherId!, status: 'ACTIVE', ...extraClassWhere } }
    : {
        class: {
          status: 'ACTIVE',
          enrollments: { some: { studentId: actor.studentId!, status: 'ACTIVE' } },
          ...extraClassWhere,
        },
      };
}

/** Classes whose semester includes the given school-local date. */
function inSemesterOn(date: Date): Prisma.ClassSectionWhereInput {
  const p = localParts(date);
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = new Date(`${p.year}-${pad(p.month)}-${pad(p.day)}T00:00:00Z`);
  return { semester: { startDate: { lte: day }, endDate: { gte: day } } };
}

/** Reject overlaps with the teacher's other active schedules in the same semester. */
async function assertNoConflicts(teacherId: string, semesterId: number, candidate: TimeSlot) {
  const others = await prisma.schedule.findMany({
    where: {
      status: 'ACTIVE',
      dayOfWeek: candidate.dayOfWeek,
      class: { teacherId, semesterId, status: 'ACTIVE' },
    },
    include: { class: { select: { classCode: true } } },
  });
  const slots: TimeSlot[] = others.map((o) => ({
    id: o.id,
    classId: o.classId,
    dayOfWeek: o.dayOfWeek,
    start: timeToMinutes(dbToTime(o.startTime)),
    end: timeToMinutes(dbToTime(o.endTime)),
  }));
  const conflicts = findConflicts(candidate, slots);
  if (conflicts.length > 0) {
    throw conflict(
      'SCHEDULE_CONFLICT',
      'This time overlaps another of your classes',
      conflicts.map((c) => {
        const other = others.find((o) => o.id === c.scheduleId)!;
        return {
          ...c,
          classCode: other.class.classCode,
          dayOfWeek: other.dayOfWeek,
          startTime: dbToTime(other.startTime),
          endTime: dbToTime(other.endTime),
        };
      }),
    );
  }
}

function assertDuration(start: number, end: number) {
  const error = durationError(start, end);
  if (error) throw badRequest('VALIDATION_ERROR', error);
}

export async function list(
  actor: Actor,
  query: z.output<typeof listSchedulesQuery>,
): Promise<ScheduleDto[]> {
  if (query.classId && actor.role === 'STUDENT') {
    await enrolledClass(prisma, actor.studentId!, query.classId);
  }
  const rows = await prisma.schedule.findMany({
    where: { ...scopeFor(actor), status: 'ACTIVE', classId: query.classId, dayOfWeek: query.day },
    include: scheduleInclude,
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  });
  return rows.map(toScheduleDto);
}

/** Today's classes in the school timezone, with active-session info and the start-window flag. */
export async function today(actor: Actor): Promise<TodayScheduleDto[]> {
  const now = clock.now();
  const day = localDayOfWeek(now);
  const minutes = localMinutes(now);

  // Only the current semester's classes meet today (past terms may not have been archived).
  const rows = await prisma.schedule.findMany({
    where: { ...scopeFor(actor, inSemesterOn(now)), status: 'ACTIVE', dayOfWeek: day },
    include: scheduleInclude,
    orderBy: { startTime: 'asc' },
  });
  const active = await prisma.attendanceSession.findMany({
    where: { status: 'ACTIVE', classId: { in: rows.map((r) => r.classId) } },
    select: { id: true, classId: true },
  });
  const activeByClass = new Map(active.map((s) => [s.classId, s.id]));

  return rows.map((row) => {
    const dto = toScheduleDto(row);
    const canStart =
      actor.role === 'TEACHER' &&
      !activeByClass.has(row.classId) &&
      withinStartWindow(
        {
          dayOfWeek: row.dayOfWeek,
          start: timeToMinutes(dto.startTime),
          end: timeToMinutes(dto.endTime),
        },
        { dayOfWeek: day, minutes },
        env.SESSION_EARLY_START_MINUTES,
      );
    return { ...dto, activeSessionId: activeByClass.get(row.classId) ?? null, canStart };
  });
}

export async function get(actor: Actor, id: string): Promise<ScheduleDto> {
  const row = await prisma.schedule.findFirst({
    where: { id, ...scopeFor(actor) },
    include: scheduleInclude,
  });
  if (row) return toScheduleDto(row);

  // Outside the active scope: only the owning teacher may still read it (archived class).
  if (actor.role !== 'TEACHER') throw notFound('Schedule');
  await ownedSchedule(prisma, actor.teacherId!, id);
  return toScheduleDto(
    await prisma.schedule.findUniqueOrThrow({ where: { id }, include: scheduleInclude }),
  );
}

export async function create(
  actor: TeacherActor,
  input: CreateScheduleInput,
): Promise<ScheduleDto> {
  const cls = await assertActiveOwnedClass(actor.teacherId, input.classId);
  const start = timeToMinutes(input.startTime);
  const end = timeToMinutes(input.endTime);
  assertDuration(start, end);
  await assertNoConflicts(actor.teacherId, cls.semesterId, {
    classId: cls.id,
    dayOfWeek: input.dayOfWeek,
    start,
    end,
  });

  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.schedule.create({
      data: {
        classId: cls.id,
        dayOfWeek: input.dayOfWeek,
        startTime: timeToDb(input.startTime),
        endTime: timeToDb(input.endTime),
        room: input.room || null,
      },
      include: scheduleInclude,
    });
    await recordAudit(tx, {
      userId: actor.userId,
      action: 'SCHEDULE_CREATED',
      entityType: 'Schedule',
      entityId: created.id,
      metadata: { ...input },
    });
    return created;
  });
  return toScheduleDto(row);
}

export async function update(
  actor: TeacherActor,
  id: string,
  input: z.output<typeof updateScheduleSchema>,
): Promise<ScheduleDto> {
  const before = await ownedSchedule(prisma, actor.teacherId, id);
  const cls = await assertActiveOwnedClass(actor.teacherId, before.classId);

  const next = {
    dayOfWeek: input.dayOfWeek ?? before.dayOfWeek,
    startTime: input.startTime ?? dbToTime(before.startTime),
    endTime: input.endTime ?? dbToTime(before.endTime),
  };
  const start = timeToMinutes(next.startTime);
  const end = timeToMinutes(next.endTime);
  assertDuration(start, end);
  await assertNoConflicts(actor.teacherId, cls.semesterId, {
    id,
    classId: cls.id,
    dayOfWeek: next.dayOfWeek,
    start,
    end,
  });

  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.schedule.update({
      where: { id },
      data: {
        dayOfWeek: next.dayOfWeek,
        startTime: timeToDb(next.startTime),
        endTime: timeToDb(next.endTime),
        ...(input.room !== undefined ? { room: input.room || null } : {}),
      },
      include: scheduleInclude,
    });
    await recordAudit(tx, {
      userId: actor.userId,
      action: 'SCHEDULE_UPDATED',
      entityType: 'Schedule',
      entityId: id,
      metadata: diff(
        {
          dayOfWeek: before.dayOfWeek,
          startTime: dbToTime(before.startTime),
          endTime: dbToTime(before.endTime),
          room: before.room,
        },
        { ...next, room: input.room },
      ),
    });
    return updated;
  });
  return toScheduleDto(row);
}

/** Hard delete an unused schedule; archive one that attendance sessions reference. */
export async function remove(
  actor: TeacherActor,
  id: string,
): Promise<{ archived: boolean } | undefined> {
  await ownedSchedule(prisma, actor.teacherId, id);
  const used = await prisma.attendanceSession.count({ where: { scheduleId: id } });

  await prisma.$transaction(async (tx) => {
    if (used > 0) await tx.schedule.update({ where: { id }, data: { status: 'ARCHIVED' } });
    else await tx.schedule.delete({ where: { id } });
    await recordAudit(tx, {
      userId: actor.userId,
      action: 'SCHEDULE_DELETED',
      entityType: 'Schedule',
      entityId: id,
      metadata: { archived: used > 0 },
    });
  });
  return used > 0 ? { archived: true } : undefined;
}
