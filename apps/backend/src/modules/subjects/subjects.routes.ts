import {
  createSubjectSchema,
  idParam,
  listSubjectsQuery,
  updateSubjectSchema,
} from '@kavriel/shared';
import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { authed } from '../../middleware/validation.middleware';
import { asTeacher } from '../actors';
import * as subjects from './subjects.service';

export const subjectRoutes = Router();
subjectRoutes.use(requireAuth, requireRole('TEACHER'));

subjectRoutes.get(
  '/',
  authed({ query: listSubjectsQuery }, ({ actor, query }) =>
    subjects.list(asTeacher(actor), query),
  ),
);
subjectRoutes.post(
  '/',
  authed(
    { body: createSubjectSchema },
    ({ actor, body }) => subjects.create(asTeacher(actor), body),
    201,
  ),
);
subjectRoutes.get(
  '/:id',
  authed({ params: idParam }, ({ actor, params }) => subjects.get(asTeacher(actor), params.id)),
);
subjectRoutes.patch(
  '/:id',
  authed({ params: idParam, body: updateSubjectSchema }, ({ actor, params, body }) =>
    subjects.update(asTeacher(actor), params.id, body),
  ),
);
subjectRoutes.delete(
  '/:id',
  authed({ params: idParam }, ({ actor, params }) => subjects.remove(asTeacher(actor), params.id)),
);
