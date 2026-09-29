import {
  classStudentParams,
  createClassSchema,
  enrollStudentSchema,
  idParam,
  listClassesQuery,
  listEnrollmentsQuery,
  updateClassSchema,
} from '@kavriel/shared';
import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { authed } from '../../middleware/validation.middleware';
import { asTeacher } from '../actors';
import * as enrollments from '../enrollments/enrollments.service';
import * as classes from './classes.service';

export const classRoutes = Router();
classRoutes.use(requireAuth);

const teacher = requireRole('TEACHER');
const anyone = requireRole('TEACHER', 'STUDENT');

// Readable by teachers (own classes) and students (actively enrolled classes).
classRoutes.get(
  '/',
  anyone,
  authed({ query: listClassesQuery }, ({ actor, query }) => classes.list(actor, query)),
);
classRoutes.get(
  '/:id',
  anyone,
  authed({ params: idParam }, ({ actor, params }) => classes.get(actor, params.id)),
);

classRoutes.post(
  '/',
  teacher,
  authed(
    { body: createClassSchema },
    ({ actor, body }) => classes.create(asTeacher(actor), body),
    201,
  ),
);
classRoutes.patch(
  '/:id',
  teacher,
  authed({ params: idParam, body: updateClassSchema }, ({ actor, params, body }) =>
    classes.update(asTeacher(actor), params.id, body),
  ),
);
classRoutes.delete(
  '/:id',
  teacher,
  authed({ params: idParam }, ({ actor, params }) => classes.remove(asTeacher(actor), params.id)),
);

// ───────────── Enrollment ─────────────

classRoutes.get(
  '/:id/students',
  teacher,
  authed({ params: idParam, query: listEnrollmentsQuery }, ({ actor, params, query }) =>
    enrollments.list(asTeacher(actor), params.id, query.status),
  ),
);
classRoutes.post(
  '/:id/students',
  teacher,
  authed({ params: idParam, body: enrollStudentSchema }, async ({ actor, params, body, res }) => {
    const { enrollment, created } = await enrollments.enroll(
      asTeacher(actor),
      params.id,
      body.studentNumber,
    );
    res.status(created ? 201 : 200);
    return enrollment;
  }),
);
classRoutes.delete(
  '/:id/students/:studentId',
  teacher,
  authed({ params: classStudentParams }, ({ actor, params }) =>
    enrollments.drop(asTeacher(actor), params.id, params.studentId),
  ),
);
