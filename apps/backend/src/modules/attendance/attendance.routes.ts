import {
  checkInSchema,
  createSessionSchema,
  idParam,
  listSessionsQuery,
  markAttendanceSchema,
  myAttendanceQuery,
  recordsQuery,
  sessionStudentParams,
  updateAttendanceSchema,
} from '@kavriel/shared';
import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middleware/auth.middleware';
import { limits } from '../../middleware/rate-limit.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { authed } from '../../middleware/validation.middleware';
import { asStudent, asTeacher } from '../actors';
import { checkIn } from './checkin.service';
import * as records from './records.service';
import * as sessions from './sessions.service';

export const attendanceRoutes = Router();
attendanceRoutes.use(requireAuth);

const teacher = requireRole('TEACHER');
const student = requireRole('STUDENT');

// ───────────── Student ─────────────

attendanceRoutes.post(
  '/check-in',
  student,
  limits.checkInUser(),
  limits.checkInIp(),
  authed({ body: checkInSchema }, async ({ actor, body, req, res }) => {
    const deviceInstallId = req.get('x-device-install-id')?.slice(0, 64) ?? null;
    const { result, created } = await checkIn(asStudent(actor), body, {
      ip: req.ip,
      deviceInstallId,
    });
    res.status(created ? 201 : 200);
    return result;
  }),
);

attendanceRoutes.get(
  '/my',
  student,
  authed({ query: myAttendanceQuery }, async ({ actor, query, res }) => {
    const { data, nextCursor } = await records.myAttendance(asStudent(actor), query);
    res.json({ data, meta: { nextCursor } });
  }),
);

attendanceRoutes.get(
  '/my/summary',
  student,
  authed({ query: z.object({ classId: z.uuid().optional() }) }, ({ actor, query }) =>
    records.mySummary(asStudent(actor), query.classId),
  ),
);

// ───────────── Teacher: sessions ─────────────

attendanceRoutes.post(
  '/sessions',
  teacher,
  authed(
    { body: createSessionSchema },
    ({ actor, body }) => sessions.create(asTeacher(actor), body),
    201,
  ),
);

attendanceRoutes.get(
  '/sessions',
  teacher,
  authed({ query: listSessionsQuery }, async ({ actor, query, res }) => {
    const { data, nextCursor } = await sessions.list(asTeacher(actor), query);
    res.json({ data, meta: { nextCursor } });
  }),
);

attendanceRoutes.get(
  '/sessions/:id',
  teacher,
  authed({ params: idParam }, ({ actor, params }) => sessions.get(asTeacher(actor), params.id)),
);
attendanceRoutes.delete(
  '/sessions/:id',
  teacher,
  authed({ params: idParam }, ({ actor, params }) =>
    sessions.removePending(asTeacher(actor), params.id),
  ),
);
attendanceRoutes.post(
  '/sessions/:id/start',
  teacher,
  authed({ params: idParam }, ({ actor, params }) => sessions.start(asTeacher(actor), params.id)),
);
attendanceRoutes.post(
  '/sessions/:id/end',
  teacher,
  authed({ params: idParam }, ({ actor, params }) => sessions.end(asTeacher(actor), params.id)),
);
attendanceRoutes.post(
  '/sessions/:id/lock',
  teacher,
  authed({ params: idParam }, ({ actor, params }) => sessions.lock(asTeacher(actor), params.id)),
);
attendanceRoutes.get(
  '/sessions/:id/qr',
  teacher,
  limits.qr(),
  authed({ params: idParam }, ({ actor, params, res }) => {
    res.setHeader('Cache-Control', 'no-store');
    return sessions.qr(asTeacher(actor), params.id);
  }),
);

// ───────────── Teacher: records ─────────────

attendanceRoutes.get(
  '/sessions/:id/records',
  teacher,
  authed({ params: idParam, query: recordsQuery }, ({ actor, params, query }) =>
    records.sessionRecords(asTeacher(actor), params.id, query.since),
  ),
);
attendanceRoutes.put(
  '/sessions/:id/records/:studentId',
  teacher,
  authed(
    { params: sessionStudentParams, body: markAttendanceSchema },
    async ({ actor, params, body, res }) => {
      const { record, created } = await records.markStudent(
        asTeacher(actor),
        params.id,
        params.studentId,
        body,
      );
      res.status(created ? 201 : 200);
      return record;
    },
  ),
);
attendanceRoutes.patch(
  '/:id',
  teacher,
  authed({ params: idParam, body: updateAttendanceSchema }, ({ actor, params, body }) =>
    records.updateRecord(asTeacher(actor), params.id, body),
  ),
);
