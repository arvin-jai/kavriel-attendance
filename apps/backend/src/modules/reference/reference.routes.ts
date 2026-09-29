import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.middleware';
import { authed, handle } from '../../middleware/validation.middleware';
import * as reference from './reference.service';

export const referenceRoutes = Router();

// Year levels are public: the registration form needs them before the user has an account.
referenceRoutes.get(
  '/year-levels',
  handle({}, () => reference.listYearLevels()),
);
referenceRoutes.get(
  '/semesters',
  requireAuth,
  authed({}, () => reference.listSemesters()),
);
referenceRoutes.get(
  '/semesters/current',
  requireAuth,
  authed({}, () => reference.currentSemester()),
);
