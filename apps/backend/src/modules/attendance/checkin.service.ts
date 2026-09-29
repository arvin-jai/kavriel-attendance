/**
 * Student check-in. Identity comes only from the access token; the session comes only from
 * the signed QR token; the status is computed from server time. The client supplies nothing
 * else that is trusted.
 */
import type { CheckInInput, CheckInResultDto } from '@kavriel/shared';

import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { Prisma } from '../../generated/prisma/client';
import { badRequest, conflict, forbidden, gone } from '../../lib/http-errors';
import { logger } from '../../lib/logger';
import { clock } from '../../lib/time';
import type { StudentActor } from '../../types/actor';
import { recordAudit } from '../audit/audit.service';
import { checkWindow, currentWindow, verifyToken } from '../qr/qr.service';

interface CheckInMeta {
  ip?: string | null;
  deviceInstallId?: string | null;
}

async function logRejection(
  actor: StudentActor,
  reason: string,
  meta: CheckInMeta,
  sessionId?: string,
) {
  try {
    await recordAudit(prisma, {
      userId: actor.userId,
      action: 'CHECKIN_REJECTED',
      entityType: 'AttendanceSession',
      entityId: sessionId ?? 'unknown',
      metadata: { reason, deviceInstallId: meta.deviceInstallId ?? null },
      ipAddress: meta.ip,
    });
  } catch (err) {
    logger.warn({ err }, 'Failed to audit rejected check-in');
  }
}

export async function checkIn(
  actor: StudentActor,
  input: CheckInInput,
  meta: CheckInMeta,
): Promise<{ result: CheckInResultDto; created: boolean }> {
  // 1. Signature and format.
  const token = verifyToken(env.QR_SIGNING_SECRET, input.qrToken);
  if (!token) {
    await logRejection(actor, 'bad_signature', meta);
    throw badRequest('QR_INVALID', 'This is not a valid attendance QR code');
  }

  // 2. Session exists and is active.
  const session = await prisma.attendanceSession.findUnique({
    where: { id: token.sessionId },
    include: {
      class: {
        select: {
          id: true,
          classCode: true,
          sectionName: true,
          subject: { select: { subjectCode: true, subjectName: true } },
        },
      },
    },
  });
  if (!session) {
    await logRejection(actor, 'unknown_session', meta, token.sessionId);
    throw badRequest('QR_INVALID', 'This is not a valid attendance QR code');
  }
  if (session.status !== 'ACTIVE' || !session.startedAt) {
    throw conflict('SESSION_NOT_ACTIVE', 'Attendance for this class is closed');
  }

  // 3. Token window (server time only).
  const now = clock.now();
  const window = checkWindow(
    token.windowIndex,
    currentWindow(session.startedAt, now, session.qrRotationSeconds),
    env.QR_GRACE_WINDOWS,
  );
  if (window === 'FUTURE') {
    await logRejection(actor, 'future_window', meta, session.id);
    throw badRequest('QR_INVALID', 'This is not a valid attendance QR code');
  }
  if (window === 'EXPIRED') {
    throw gone('QR_EXPIRED', 'QR expired. Please scan the current QR code.');
  }

  // 4. Enrollment.
  const enrollment = await prisma.enrollment.findFirst({
    where: { classId: session.classId, studentId: actor.studentId, status: 'ACTIVE' },
  });
  if (!enrollment) {
    await logRejection(actor, 'not_enrolled', meta, session.id);
    throw forbidden('NOT_ENROLLED', "You're not enrolled in this class");
  }

  const sessionInfo: CheckInResultDto['session'] = {
    id: session.id,
    classCode: session.class.classCode,
    sectionName: session.class.sectionName,
    subjectCode: session.class.subject.subjectCode,
    subjectName: session.class.subject.subjectName,
  };

  // 5. Status from server time.
  const lateAt = session.startedAt.getTime() + session.lateAfterMinutes * 60_000;
  const status = now.getTime() <= lateAt ? 'PRESENT' : 'LATE';

  // 6. Insert once. UNIQUE(sessionId, studentId) makes retries and double taps idempotent.
  try {
    const record = await prisma.$transaction(async (tx) => {
      const created = await tx.attendance.create({
        data: {
          sessionId: session.id,
          studentId: actor.studentId,
          status,
          source: 'QR_SCAN',
          checkInTime: now,
        },
      });
      await recordAudit(tx, {
        userId: actor.userId,
        action: 'ATTENDANCE_CREATED',
        entityType: 'Attendance',
        entityId: created.id,
        metadata: {
          source: 'QR_SCAN',
          sessionId: session.id,
          window: token.windowIndex,
          deviceInstallId: meta.deviceInstallId ?? null,
          clientRequestId: input.clientRequestId ?? null,
        },
        ipAddress: meta.ip,
      });
      return created;
    });
    return {
      created: true,
      result: {
        alreadyRecorded: false,
        attendance: {
          id: record.id,
          status: record.status,
          checkInTime: record.checkInTime!.toISOString(),
        },
        session: sessionInfo,
      },
    };
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
    const existing = await prisma.attendance.findUniqueOrThrow({
      where: { sessionId_studentId: { sessionId: session.id, studentId: actor.studentId } },
    });
    return {
      created: false,
      result: {
        alreadyRecorded: true,
        attendance: {
          id: existing.id,
          status: existing.status,
          checkInTime: existing.checkInTime?.toISOString() ?? null,
        },
        session: sessionInfo,
      },
    };
  }
}
