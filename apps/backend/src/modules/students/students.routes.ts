import { studentLookupQuery } from '@kavriel/shared';
import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.middleware';
import { limits } from '../../middleware/rate-limit.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { authed } from '../../middleware/validation.middleware';
import { lookupStudent } from '../enrollments/enrollments.service';

export const studentRoutes = Router();

studentRoutes.get(
  '/lookup',
  requireAuth,
  requireRole('TEACHER'),
  limits.lookup(),
  authed({ query: studentLookupQuery }, ({ query }) => lookupStudent(query.studentNumber)),
);
