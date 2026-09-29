import { reportQuery } from '@kavriel/shared';
import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { authed } from '../../middleware/validation.middleware';
import { asTeacher } from '../actors';
import * as reports from './reports.service';

export const reportRoutes = Router();
reportRoutes.use(requireAuth, requireRole('TEACHER'));

reportRoutes.get(
  '/attendance',
  authed({ query: reportQuery }, ({ actor, query }) => reports.report(asTeacher(actor), query)),
);

reportRoutes.get(
  '/attendance.csv',
  authed({ query: reportQuery }, async ({ actor, query, req, res }) => {
    const { filename, csv } = await reports.reportCsv(asTeacher(actor), query, req.ip);
    res
      .status(200)
      .setHeader('Content-Type', 'text/csv; charset=utf-8')
      .setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      .setHeader('Cache-Control', 'no-store')
      .send(csv);
  }),
);
