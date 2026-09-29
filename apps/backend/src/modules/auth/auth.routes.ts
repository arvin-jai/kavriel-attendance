import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.middleware';
import { limits } from '../../middleware/rate-limit.middleware';
import * as c from './auth.controller';

export const authRoutes = Router();

authRoutes.post('/register', limits.register(), c.register);
authRoutes.post('/login', limits.loginIp(), limits.login(), c.login);
authRoutes.post('/refresh', limits.refreshIp(), limits.refresh(), c.refresh);
authRoutes.post('/logout', requireAuth, c.logout);
authRoutes.get('/me', requireAuth, c.me);
authRoutes.patch('/me', requireAuth, c.updateMe);
authRoutes.patch('/password', requireAuth, c.changePassword);
