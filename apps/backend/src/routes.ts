import { Router } from 'express';

import { attendanceRoutes } from './modules/attendance/attendance.routes';
import { authRoutes } from './modules/auth/auth.routes';
import { classRoutes } from './modules/classes/classes.routes';
import { referenceRoutes } from './modules/reference/reference.routes';
import { reportRoutes } from './modules/reports/reports.routes';
import { scheduleRoutes } from './modules/schedules/schedules.routes';
import { studentRoutes } from './modules/students/students.routes';
import { subjectRoutes } from './modules/subjects/subjects.routes';

/** Every API route, mounted under /api/v1 by app.ts. */
export const apiRoutes = Router();

apiRoutes.use('/auth', authRoutes);
apiRoutes.use('/reference', referenceRoutes);
apiRoutes.use('/subjects', subjectRoutes);
apiRoutes.use('/classes', classRoutes);
apiRoutes.use('/students', studentRoutes);
apiRoutes.use('/schedules', scheduleRoutes);
apiRoutes.use('/attendance', attendanceRoutes);
apiRoutes.use('/reports', reportRoutes);
