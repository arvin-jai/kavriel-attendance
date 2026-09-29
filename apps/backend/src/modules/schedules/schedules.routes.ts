import {
  createScheduleSchema,
  idParam,
  listSchedulesQuery,
  updateScheduleSchema,
} from '@kavriel/shared';
import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { authed } from '../../middleware/validation.middleware';
import { asTeacher } from '../actors';
import * as schedules from './schedules.service';

export const scheduleRoutes = Router();
scheduleRoutes.use(requireAuth);

const teacher = requireRole('TEACHER');
const anyone = requireRole('TEACHER', 'STUDENT');

scheduleRoutes.get(
  '/',
  anyone,
  authed({ query: listSchedulesQuery }, ({ actor, query }) => schedules.list(actor, query)),
);
scheduleRoutes.get(
  '/today',
  anyone,
  authed({}, ({ actor }) => schedules.today(actor)),
);
scheduleRoutes.get(
  '/:id',
  anyone,
  authed({ params: idParam }, ({ actor, params }) => schedules.get(actor, params.id)),
);

scheduleRoutes.post(
  '/',
  teacher,
  authed(
    { body: createScheduleSchema },
    ({ actor, body }) => schedules.create(asTeacher(actor), body),
    201,
  ),
);
scheduleRoutes.patch(
  '/:id',
  teacher,
  authed({ params: idParam, body: updateScheduleSchema }, ({ actor, params, body }) =>
    schedules.update(asTeacher(actor), params.id, body),
  ),
);
scheduleRoutes.delete(
  '/:id',
  teacher,
  authed({ params: idParam }, ({ actor, params }) => schedules.remove(asTeacher(actor), params.id)),
);
