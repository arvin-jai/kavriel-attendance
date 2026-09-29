import type { RequestHandler } from 'express';

import { prisma } from '../config/database';
import { forbidden, unauthorized } from '../lib/http-errors';
import { verifyAccessToken } from '../lib/jwt';
import type { Actor } from '../types/actor';

/**
 * Require a valid Bearer access token. The actor (role, profile ids, active flag) is loaded
 * from the database so deactivation and role changes take effect immediately.
 */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const header = req.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw unauthorized();

  const claims = verifyAccessToken(token);
  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: {
      id: true,
      email: true,
      isActive: true,
      role: { select: { name: true } },
      teacher: { select: { id: true } },
      student: { select: { id: true } },
    },
  });
  if (!user) throw unauthorized();
  if (!user.isActive) throw forbidden('ACCOUNT_DISABLED', 'This account is disabled');

  const actor: Actor = {
    userId: user.id,
    email: user.email,
    role: user.role.name as Actor['role'],
    teacherId: user.teacher?.id ?? null,
    studentId: user.student?.id ?? null,
  };
  req.actor = actor;
  next();
};
