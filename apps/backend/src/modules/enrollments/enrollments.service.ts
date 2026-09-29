import type { EnrollmentDto, StudentSummaryDto } from '@kavriel/shared';

import { prisma } from '../../config/database';
import type { EnrollmentStatus } from '../../generated/prisma/enums';
import { conflict, notFound } from '../../lib/http-errors';
import { clock } from '../../lib/time';
import { ownedClass } from '../../policies/ownership';
import type { TeacherActor } from '../../types/actor';
import { recordAudit } from '../audit/audit.service';
import { assertActiveOwnedClass } from '../classes/classes.service';
import { studentSummarySelect, toStudentSummary } from '../mappers';

const include = { student: { select: studentSummarySelect } } as const;

function toDto(e: {
  id: string;
  status: EnrollmentStatus;
  enrolledAt: Date;
  droppedAt: Date | null;
  student: Parameters<typeof toStudentSummary>[0];
}): EnrollmentDto {
  return {
    id: e.id,
    status: e.status,
    enrolledAt: e.enrolledAt.toISOString(),
    droppedAt: e.droppedAt?.toISOString() ?? null,
    student: toStudentSummary(e.student),
  };
}

/** Exact student-number lookup only (no partial search), so the directory can't be enumerated. */
export async function lookupStudent(studentNumber: string): Promise<StudentSummaryDto> {
  const student = await prisma.student.findUnique({
    where: { studentNumber },
    select: { ...studentSummarySelect, user: { select: { isActive: true } } },
  });
  if (!student || !student.user.isActive) throw notFound('Student');
  return toStudentSummary(student);
}

export async function list(
  actor: TeacherActor,
  classId: string,
  status?: EnrollmentStatus,
): Promise<EnrollmentDto[]> {
  await ownedClass(prisma, actor.teacherId, classId);
  const rows = await prisma.enrollment.findMany({
    where: { classId, status },
    include,
    orderBy: [
      { status: 'asc' },
      { student: { lastName: 'asc' } },
      { student: { firstName: 'asc' } },
    ],
  });
  return rows.map(toDto);
}

export async function enroll(
  actor: TeacherActor,
  classId: string,
  studentNumber: string,
): Promise<{ enrollment: EnrollmentDto; created: boolean }> {
  await assertActiveOwnedClass(actor.teacherId, classId);
  const student = await prisma.student.findUnique({
    where: { studentNumber },
    include: { user: { select: { isActive: true } } },
  });
  if (!student || !student.user.isActive) throw notFound('Student');

  const existing = await prisma.enrollment.findUnique({
    where: { classId_studentId: { classId, studentId: student.id } },
  });
  if (existing?.status === 'ACTIVE') {
    throw conflict('ALREADY_ENROLLED', 'This student is already enrolled');
  }

  const enrollment = await prisma.$transaction(async (tx) => {
    // Re-enrolling a dropped student reactivates the same row, keeping UNIQUE(classId, studentId).
    const row = existing
      ? await tx.enrollment.update({
          where: { id: existing.id },
          data: { status: 'ACTIVE', droppedAt: null, enrolledAt: clock.now() },
          include,
        })
      : await tx.enrollment.create({ data: { classId, studentId: student.id }, include });
    await recordAudit(tx, {
      userId: actor.userId,
      action: 'STUDENT_ENROLLED',
      entityType: 'Enrollment',
      entityId: row.id,
      metadata: { classId, studentId: student.id, reactivated: Boolean(existing) },
    });
    return row;
  });
  return { enrollment: toDto(enrollment), created: !existing };
}

/** Soft removal: DROPPED keeps the student's attendance history intact. */
export async function drop(actor: TeacherActor, classId: string, studentId: string): Promise<void> {
  await ownedClass(prisma, actor.teacherId, classId);
  const enrollment = await prisma.enrollment.findUnique({
    where: { classId_studentId: { classId, studentId } },
  });
  if (!enrollment || enrollment.status !== 'ACTIVE') throw notFound('Enrollment');

  await prisma.$transaction(async (tx) => {
    await tx.enrollment.update({
      where: { id: enrollment.id },
      data: { status: 'DROPPED', droppedAt: clock.now() },
    });
    await recordAudit(tx, {
      userId: actor.userId,
      action: 'STUDENT_REMOVED',
      entityType: 'Enrollment',
      entityId: enrollment.id,
      metadata: { classId, studentId },
    });
  });
}
