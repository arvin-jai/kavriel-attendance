import { randomUUID } from 'node:crypto';

import type {
  AuthResultDto,
  AuthTokensDto,
  RegisterInput,
  LoginInput,
  UserDto,
} from '@kavriel/shared';
import type { z } from 'zod';
import type { updateProfileSchema } from '@kavriel/shared';

import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { randomToken, safeEqual, sha256Hex } from '../../lib/crypto';
import { conflict, forbidden, notFound, unauthorized } from '../../lib/http-errors';
import { signAccessToken } from '../../lib/jwt';
import { dummyPasswordHash, hashPassword, verifyPassword } from '../../lib/password';
import { clock } from '../../lib/time';
import type { Actor } from '../../types/actor';
import { diff, recordAudit, type DbClient } from '../audit/audit.service';

const DAY_MS = 24 * 60 * 60 * 1000;

interface RequestMeta {
  ip?: string | null;
  userAgent?: string | null;
}

// ───────────── Tokens ─────────────

async function issueTokens(
  db: DbClient,
  user: { id: string; role: string },
  meta: RequestMeta,
  familyId: string = randomUUID(),
): Promise<AuthTokensDto & { refreshTokenId: string }> {
  const refreshToken = randomToken(32);
  const row = await db.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256Hex(refreshToken),
      familyId,
      expiresAt: new Date(clock.now().getTime() + env.REFRESH_TOKEN_TTL_DAYS * DAY_MS),
      userAgent: meta.userAgent?.slice(0, 255) ?? null,
    },
  });
  return {
    accessToken: signAccessToken({ sub: user.id, role: user.role }),
    refreshToken,
    expiresIn: env.JWT_ACCESS_TTL_SECONDS,
    refreshTokenId: row.id,
  };
}

function publicTokens(t: AuthTokensDto): AuthTokensDto {
  return { accessToken: t.accessToken, refreshToken: t.refreshToken, expiresIn: t.expiresIn };
}

// ───────────── User DTO ─────────────

const userInclude = {
  role: true,
  teacher: true,
  student: { include: { yearLevel: true } },
} as const;

export async function loadUserDto(userId: string, db: DbClient = prisma): Promise<UserDto> {
  const user = await db.user.findUnique({ where: { id: userId }, include: userInclude });
  if (!user) throw notFound('User');

  if (user.role.name === 'TEACHER' && user.teacher) {
    const t = user.teacher;
    return {
      id: user.id,
      email: user.email,
      role: 'TEACHER',
      profile: {
        id: t.id,
        firstName: t.firstName,
        middleName: t.middleName,
        lastName: t.lastName,
        employeeNumber: t.employeeNumber,
        contactNumber: t.contactNumber,
      },
    };
  }
  if (user.role.name === 'STUDENT' && user.student) {
    const s = user.student;
    return {
      id: user.id,
      email: user.email,
      role: 'STUDENT',
      profile: {
        id: s.id,
        studentNumber: s.studentNumber,
        firstName: s.firstName,
        middleName: s.middleName,
        lastName: s.lastName,
        contactNumber: s.contactNumber,
        yearLevel: s.yearLevel ? { id: s.yearLevel.id, name: s.yearLevel.name } : null,
      },
    };
  }
  throw forbidden('FORBIDDEN', 'Account has no profile');
}

// ───────────── Register / login ─────────────

function teacherCodeMatches(provided: string): boolean {
  return safeEqual(Buffer.from(provided), Buffer.from(env.TEACHER_SIGNUP_CODE));
}

export async function register(input: RegisterInput, meta: RequestMeta): Promise<AuthResultDto> {
  if (input.role === 'TEACHER' && !teacherCodeMatches(input.teacherCode)) {
    throw forbidden('INVALID_TEACHER_CODE', 'The teacher registration code is incorrect');
  }

  // Friendly uniqueness errors first; the DB unique constraints remain the real guarantee.
  if (await prisma.user.findUnique({ where: { email: input.email } })) {
    throw conflict('EMAIL_TAKEN', 'An account with this email already exists');
  }
  if (
    input.role === 'STUDENT' &&
    (await prisma.student.findUnique({ where: { studentNumber: input.studentNumber } }))
  ) {
    throw conflict('STUDENT_NUMBER_TAKEN', 'This student number is already registered');
  }
  if (
    input.role === 'TEACHER' &&
    input.employeeNumber &&
    (await prisma.teacher.findUnique({ where: { employeeNumber: input.employeeNumber } }))
  ) {
    throw conflict('EMPLOYEE_NUMBER_TAKEN', 'This employee number is already registered');
  }
  if (input.role === 'STUDENT' && input.yearLevelId) {
    const yl = await prisma.yearLevel.findUnique({ where: { id: input.yearLevelId } });
    if (!yl) throw notFound('Year level');
  }

  const passwordHash = await hashPassword(input.password);

  const { userId, tokens } = await prisma.$transaction(async (tx) => {
    const role = await tx.role.findUniqueOrThrow({ where: { name: input.role } });
    const user = await tx.user.create({
      data: { email: input.email, passwordHash, roleId: role.id },
    });
    const names = {
      firstName: input.firstName,
      middleName: input.middleName || null,
      lastName: input.lastName,
      contactNumber: input.contactNumber || null,
    };
    if (input.role === 'TEACHER') {
      await tx.teacher.create({
        data: { userId: user.id, employeeNumber: input.employeeNumber || null, ...names },
      });
    } else {
      await tx.student.create({
        data: {
          userId: user.id,
          studentNumber: input.studentNumber,
          yearLevelId: input.yearLevelId ?? null,
          ...names,
        },
      });
    }
    await recordAudit(tx, {
      userId: user.id,
      action: 'USER_REGISTERED',
      entityType: 'User',
      entityId: user.id,
      metadata: { role: input.role },
      ipAddress: meta.ip,
    });
    const tokens = await issueTokens(tx, { id: user.id, role: input.role }, meta);
    return { userId: user.id, tokens };
  });

  return { user: await loadUserDto(userId), ...publicTokens(tokens) };
}

export async function login(input: LoginInput, meta: RequestMeta): Promise<AuthResultDto> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    include: { role: true },
  });

  if (!user) {
    await verifyPassword(await dummyPasswordHash(), input.password); // equalize timing
    throw unauthorized('INVALID_CREDENTIALS', 'Incorrect email or password');
  }
  if (!(await verifyPassword(user.passwordHash, input.password))) {
    throw unauthorized('INVALID_CREDENTIALS', 'Incorrect email or password');
  }
  if (!user.isActive) throw forbidden('ACCOUNT_DISABLED', 'This account is disabled');

  const now = clock.now();
  const tokens = await prisma.$transaction(async (tx) => {
    // Housekeeping: drop this user's expired refresh tokens.
    await tx.refreshToken.deleteMany({ where: { userId: user.id, expiresAt: { lt: now } } });
    await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: now } });
    await recordAudit(tx, {
      userId: user.id,
      action: 'USER_LOGIN',
      entityType: 'User',
      entityId: user.id,
      ipAddress: meta.ip,
    });
    return issueTokens(tx, { id: user.id, role: user.role.name }, meta);
  });

  return { user: await loadUserDto(user.id), ...publicTokens(tokens) };
}

// ───────────── Refresh / logout ─────────────

/**
 * Rotate a refresh token. Presenting an already-rotated (revoked) token means it was stolen
 * or replayed, so the whole token family is revoked and the user must sign in again.
 */
export async function refresh(refreshToken: string, meta: RequestMeta): Promise<AuthTokensDto> {
  const now = clock.now();
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash: sha256Hex(refreshToken) },
    include: { user: { include: { role: true } } },
  });

  const invalid = () => unauthorized('INVALID_REFRESH_TOKEN', 'Please sign in again');
  if (!existing) throw invalid();

  if (existing.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { familyId: existing.familyId, revokedAt: null },
      data: { revokedAt: now },
    });
    throw invalid();
  }
  if (existing.expiresAt <= now || !existing.user.isActive) throw invalid();

  return prisma.$transaction(async (tx) => {
    // Conditional update guards against two concurrent refreshes of the same token.
    const { count } = await tx.refreshToken.updateMany({
      where: { id: existing.id, revokedAt: null },
      data: { revokedAt: now },
    });
    if (count === 0) throw invalid();

    const tokens = await issueTokens(
      tx,
      { id: existing.userId, role: existing.user.role.name },
      meta,
      existing.familyId,
    );
    await tx.refreshToken.update({
      where: { id: existing.id },
      data: { replacedBy: tokens.refreshTokenId },
    });
    return publicTokens(tokens);
  });
}

export async function logout(refreshToken: string, actor: Actor): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: sha256Hex(refreshToken), userId: actor.userId, revokedAt: null },
    data: { revokedAt: clock.now() },
  });
}

// ───────────── Account ─────────────

export async function changePassword(
  actor: Actor,
  currentPassword: string,
  newPassword: string,
  meta: RequestMeta,
): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });
  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    throw unauthorized('INVALID_CREDENTIALS', 'Current password is incorrect');
  }
  const passwordHash = await hashPassword(newPassword);
  const now = clock.now();

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: actor.userId },
      data: { passwordHash, passwordChangedAt: now },
    });
    // Sign out every device.
    await tx.refreshToken.updateMany({
      where: { userId: actor.userId, revokedAt: null },
      data: { revokedAt: now },
    });
    await recordAudit(tx, {
      userId: actor.userId,
      action: 'PASSWORD_CHANGED',
      entityType: 'User',
      entityId: actor.userId,
      ipAddress: meta.ip,
    });
  });
}

export async function updateProfile(
  actor: Actor,
  input: z.output<typeof updateProfileSchema>,
  meta: RequestMeta,
): Promise<UserDto> {
  const common = {
    firstName: input.firstName,
    middleName: input.middleName,
    lastName: input.lastName,
    contactNumber: input.contactNumber,
  };

  await prisma.$transaction(async (tx) => {
    if (actor.role === 'TEACHER' && actor.teacherId) {
      const before = await tx.teacher.findUniqueOrThrow({ where: { id: actor.teacherId } });
      const after = await tx.teacher.update({ where: { id: actor.teacherId }, data: common });
      await recordAudit(tx, {
        userId: actor.userId,
        action: 'PROFILE_UPDATED',
        entityType: 'Teacher',
        entityId: after.id,
        metadata: diff(before, common),
        ipAddress: meta.ip,
      });
    } else if (actor.role === 'STUDENT' && actor.studentId) {
      if (input.yearLevelId) {
        const yl = await tx.yearLevel.findUnique({ where: { id: input.yearLevelId } });
        if (!yl) throw notFound('Year level');
      }
      const data = { ...common, yearLevelId: input.yearLevelId };
      const before = await tx.student.findUniqueOrThrow({ where: { id: actor.studentId } });
      const after = await tx.student.update({ where: { id: actor.studentId }, data });
      await recordAudit(tx, {
        userId: actor.userId,
        action: 'PROFILE_UPDATED',
        entityType: 'Student',
        entityId: after.id,
        metadata: diff(before, data),
        ipAddress: meta.ip,
      });
    }
  });

  return loadUserDto(actor.userId);
}
