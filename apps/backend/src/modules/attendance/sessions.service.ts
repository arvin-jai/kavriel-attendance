import type { QrTokenDto, SessionDto } from '@kavriel/shared';
import type { createSessionSchema, listSessionsQuery } from '@kavriel/shared';
import type { z } from 'zod';

import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { Prisma } from '../../generated/prisma/client';
import type { SessionStatus } from '../../generated/prisma/enums';
import { conflict, notFound, unprocessable } from '../../lib/http-errors';
import {
  clock,
  dbToTime,
  localDateEnd,
  localDateStart,
  localDayOfWeek,
  localMinutes,
  timeToMinutes,
} from '../../lib/time';
import { ownedSession } from '../../policies/ownership';
import type { TeacherActor } from '../../types/actor';
import { recordAudit, type DbClient } from '../audit/audit.service';
import { assertActiveOwnedClass } from '../classes/classes.service';
import { classRefSelect, countsFrom, iso, toClassRef } from '../mappers';
import { currentWindow, signToken, windowExpiresAt } from '../qr/qr.service';
import { withinStartWindow } from '../schedules/schedule-rules';

const sessionInclude = { class: { select: classRefSelect } } as const;
type SessionRow = Prisma.AttendanceSessionGetPayload<{ include: typeof sessionInclude }>;

/** Build DTOs with per-status counts; one grouped query for all sessions. */
export async function toSessionDtos(db: DbClient, rows: SessionRow[]): Promise<SessionDto[]> {
  if (rows.length === 0) return [];
  const grouped = await db.attendance.groupBy({
    by: ['sessionId', 'status'],
    where: { sessionId: { in: rows.map((r) => r.id) } },
    _count: { _all: true },
  });
  const openClassIds = rows
    .filter((r) => r.status === 'ACTIVE' || r.status === 'PENDING')
    .map((r) => r.classId);
  const enrolled = openClassIds.length
    ? await db.enrollment.groupBy({
        by: ['classId'],
        where: { classId: { in: openClassIds }, status: 'ACTIVE' },
        _count: { _all: true },
      })
    : [];
  const enrolledByClass = new Map(enrolled.map((e) => [e.classId, e._count._all]));

  return rows.map((s) => {
    const counts = countsFrom(grouped.filter((g) => g.sessionId === s.id));
    const recordTotal = counts.PRESENT + counts.LATE + counts.ABSENT + counts.EXCUSED;
    return {
      id: s.id,
      status: s.status,
      scheduleId: s.scheduleId,
      startedAt: iso(s.startedAt),
      endedAt: iso(s.endedAt),
      lockedAt: iso(s.lockedAt),
      lateAfterMinutes: s.lateAfterMinutes,
      qrRotationSeconds: s.qrRotationSeconds,
      class: toClassRef(s.class),
      counts,
      // Open sessions: current roster. Closed sessions: the roster frozen by ABSENT generation.
      enrolledCount:
        s.status === 'ACTIVE' || s.status === 'PENDING'
          ? (enrolledByClass.get(s.classId) ?? 0)
          : recordTotal,
    };
  });
}

async function toSessionDto(db: DbClient, row: SessionRow): Promise<SessionDto> {
  const [dto] = await toSessionDtos(db, [row]);
  return dto!;
}

/** Enforce the start-window rule for scheduled sessions. */
async function assertStartAllowed(classId: string, scheduleId: string | null) {
  const active = await prisma.attendanceSession.count({ where: { classId, status: 'ACTIVE' } });
  if (active > 0) {
    throw conflict('SESSION_ALREADY_ACTIVE', 'This class already has an active attendance session');
  }
  if (!scheduleId) return;

  const schedule = await prisma.schedule.findFirst({
    where: { id: scheduleId, classId, status: 'ACTIVE' },
  });
  if (!schedule) throw notFound('Schedule');

  const now = clock.now();
  const ok = withinStartWindow(
    {
      dayOfWeek: schedule.dayOfWeek,
      start: timeToMinutes(dbToTime(schedule.startTime)),
      end: timeToMinutes(dbToTime(schedule.endTime)),
    },
    { dayOfWeek: localDayOfWeek(now), minutes: localMinutes(now) },
    env.SESSION_EARLY_START_MINUTES,
  );
  if (!ok) {
    throw unprocessable(
      'OUTSIDE_SCHEDULE_WINDOW',
      `Attendance can start from ${env.SESSION_EARLY_START_MINUTES} minutes before the scheduled time until it ends. Start it without a schedule instead.`,
      {
        dayOfWeek: schedule.dayOfWeek,
        startTime: dbToTime(schedule.startTime),
        endTime: dbToTime(schedule.endTime),
      },
    );
  }
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

export async function create(
  actor: TeacherActor,
  input: z.output<typeof createSessionSchema>,
): Promise<SessionDto> {
  await assertActiveOwnedClass(actor.teacherId, input.classId);
  if (input.startNow) {
    await assertStartAllowed(input.classId, input.scheduleId ?? null);
  } else if (input.scheduleId) {
    const schedule = await prisma.schedule.findFirst({
      where: { id: input.scheduleId, classId: input.classId },
    });
    if (!schedule) throw notFound('Schedule');
  }

  const now = clock.now();
  try {
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.attendanceSession.create({
        data: {
          classId: input.classId,
          scheduleId: input.scheduleId ?? null,
          status: input.startNow ? 'ACTIVE' : 'PENDING',
          startedAt: input.startNow ? now : null,
          lateAfterMinutes: input.lateAfterMinutes,
          qrRotationSeconds: input.qrRotationSeconds,
        },
        include: sessionInclude,
      });
      await recordAudit(tx, {
        userId: actor.userId,
        action: 'SESSION_CREATED',
        entityType: 'AttendanceSession',
        entityId: created.id,
        metadata: {
          classId: input.classId,
          scheduleId: input.scheduleId ?? null,
          adHoc: !input.scheduleId,
        },
      });
      if (input.startNow) {
        await recordAudit(tx, {
          userId: actor.userId,
          action: 'SESSION_STARTED',
          entityType: 'AttendanceSession',
          entityId: created.id,
        });
      }
      return created;
    });
    return toSessionDto(prisma, row);
  } catch (err) {
    // Partial unique index: one ACTIVE session per class (race between two starts).
    if (isUniqueViolation(err)) {
      throw conflict(
        'SESSION_ALREADY_ACTIVE',
        'This class already has an active attendance session',
      );
    }
    throw err;
  }
}

export async function start(actor: TeacherActor, id: string): Promise<SessionDto> {
  const session = await ownedSession(prisma, actor.teacherId, id);
  if (session.status !== 'PENDING') {
    throw conflict('INVALID_STATE', 'Only a pending session can be started');
  }
  await assertActiveOwnedClass(actor.teacherId, session.classId);
  await assertStartAllowed(session.classId, session.scheduleId);

  try {
    const row = await prisma.$transaction(async (tx) => {
      const { count } = await tx.attendanceSession.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'ACTIVE', startedAt: clock.now() },
      });
      if (count === 0) throw conflict('INVALID_STATE', 'Only a pending session can be started');
      await recordAudit(tx, {
        userId: actor.userId,
        action: 'SESSION_STARTED',
        entityType: 'AttendanceSession',
        entityId: id,
      });
      return tx.attendanceSession.findUniqueOrThrow({ where: { id }, include: sessionInclude });
    });
    return toSessionDto(prisma, row);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw conflict(
        'SESSION_ALREADY_ACTIVE',
        'This class already has an active attendance session',
      );
    }
    throw err;
  }
}

/**
 * End an active session. In the same transaction every actively enrolled student without a
 * record is marked ABSENT (source SYSTEM); existing check-ins are never overwritten.
 */
export async function end(
  actor: TeacherActor,
  id: string,
): Promise<{ session: SessionDto; absentMarked: number }> {
  const session = await ownedSession(prisma, actor.teacherId, id);
  if (session.status !== 'ACTIVE') {
    throw conflict('SESSION_NOT_ACTIVE', 'Only an active session can be ended');
  }

  const { row, absentMarked } = await prisma.$transaction(async (tx) => {
    const { count } = await tx.attendanceSession.updateMany({
      where: { id, status: 'ACTIVE' },
      data: { status: 'ENDED', endedAt: clock.now() },
    });
    if (count === 0) throw conflict('SESSION_NOT_ACTIVE', 'Only an active session can be ended');

    // Sequential: a transaction holds a single connection.
    const enrolled = await tx.enrollment.findMany({
      where: { classId: session.classId, status: 'ACTIVE' },
      select: { studentId: true },
    });
    const recorded = await tx.attendance.findMany({
      where: { sessionId: id },
      select: { studentId: true },
    });
    const have = new Set(recorded.map((r) => r.studentId));
    const missing = enrolled.map((e) => e.studentId).filter((sid) => !have.has(sid));
    const { count: absentMarked } = await tx.attendance.createMany({
      data: missing.map((studentId) => ({
        sessionId: id,
        studentId,
        status: 'ABSENT',
        source: 'SYSTEM',
      })),
      skipDuplicates: true,
    });

    await recordAudit(tx, {
      userId: actor.userId,
      action: 'SESSION_ENDED',
      entityType: 'AttendanceSession',
      entityId: id,
      metadata: { absentMarked },
    });
    const row = await tx.attendanceSession.findUniqueOrThrow({
      where: { id },
      include: sessionInclude,
    });
    return { row, absentMarked };
  });
  return { session: await toSessionDto(prisma, row), absentMarked };
}

/** Lock an ended session: its records become read-only for everyone. */
export async function lock(actor: TeacherActor, id: string): Promise<SessionDto> {
  const session = await ownedSession(prisma, actor.teacherId, id);
  if (session.status !== 'ENDED') {
    throw conflict('INVALID_STATE', 'Only an ended session can be locked');
  }
  const row = await prisma.$transaction(async (tx) => {
    const { count } = await tx.attendanceSession.updateMany({
      where: { id, status: 'ENDED' },
      data: { status: 'LOCKED', lockedAt: clock.now() },
    });
    if (count === 0) throw conflict('INVALID_STATE', 'Only an ended session can be locked');
    await recordAudit(tx, {
      userId: actor.userId,
      action: 'SESSION_LOCKED',
      entityType: 'AttendanceSession',
      entityId: id,
    });
    return tx.attendanceSession.findUniqueOrThrow({ where: { id }, include: sessionInclude });
  });
  return toSessionDto(prisma, row);
}

/** Delete a session that never started (PENDING only). */
export async function removePending(actor: TeacherActor, id: string): Promise<void> {
  const session = await ownedSession(prisma, actor.teacherId, id);
  if (session.status !== 'PENDING') {
    throw conflict('INVALID_STATE', 'Only a session that never started can be deleted');
  }
  await prisma.attendanceSession.delete({ where: { id } });
}

export async function get(actor: TeacherActor, id: string): Promise<SessionDto> {
  await ownedSession(prisma, actor.teacherId, id);
  const row = await prisma.attendanceSession.findUniqueOrThrow({
    where: { id },
    include: sessionInclude,
  });
  return toSessionDto(prisma, row);
}

export async function list(
  actor: TeacherActor,
  query: z.output<typeof listSessionsQuery>,
): Promise<{ data: SessionDto[]; nextCursor: string | null }> {
  const where: Prisma.AttendanceSessionWhereInput = {
    class: { teacherId: actor.teacherId },
    classId: query.classId,
    status: query.status as SessionStatus | undefined,
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: localDateStart(query.from) } : {}),
            ...(query.to ? { lt: localDateEnd(query.to) } : {}),
          },
        }
      : {}),
  };
  const rows = await prisma.attendanceSession.findMany({
    where,
    include: sessionInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
  const page = rows.slice(0, query.limit);
  return {
    data: await toSessionDtos(prisma, page),
    nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
  };
}

/** Current rotating QR token for an active session. */
export async function qr(actor: TeacherActor, id: string): Promise<QrTokenDto> {
  const session = await ownedSession(prisma, actor.teacherId, id);
  if (session.status !== 'ACTIVE' || !session.startedAt) {
    throw conflict('SESSION_NOT_ACTIVE', 'Attendance is not active for this session');
  }
  const now = clock.now();
  const windowIndex = currentWindow(session.startedAt, now, session.qrRotationSeconds);
  return {
    token: signToken(env.QR_SIGNING_SECRET, session.id, windowIndex),
    windowIndex,
    expiresAt: windowExpiresAt(
      session.startedAt,
      windowIndex,
      session.qrRotationSeconds,
    ).toISOString(),
    serverTime: now.toISOString(),
    rotationSeconds: session.qrRotationSeconds,
  };
}
