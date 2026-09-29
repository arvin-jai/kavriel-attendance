import type { Role } from '@kavriel/shared';
import type { RequestHandler } from 'express';

import { forbidden, unauthorized } from '../lib/http-errors';

/** Allow only the given roles. Must run after requireAuth. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    const actor = req.actor;
    if (!actor) throw unauthorized();
    if (!roles.includes(actor.role)) throw forbidden();
    // A role without its profile row is a data problem; refuse rather than guess.
    if (actor.role === 'TEACHER' && !actor.teacherId) throw forbidden();
    if (actor.role === 'STUDENT' && !actor.studentId) throw forbidden();
    next();
  };
}
