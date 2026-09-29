import {
  changePasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  updateProfileSchema,
} from '@kavriel/shared';
import type { Request } from 'express';

import { authed, handle } from '../../middleware/validation.middleware';
import * as auth from './auth.service';

const meta = (req: Request) => ({ ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null });

export const register = handle(
  { body: registerSchema },
  ({ body, req }) => auth.register(body, meta(req)),
  201,
);

export const login = handle({ body: loginSchema }, ({ body, req }) => auth.login(body, meta(req)));

export const refresh = handle({ body: refreshSchema }, ({ body, req }) =>
  auth.refresh(body.refreshToken, meta(req)),
);

export const logout = authed({ body: refreshSchema }, async ({ body, actor }) => {
  await auth.logout(body.refreshToken, actor);
});

export const me = authed({}, ({ actor }) => auth.loadUserDto(actor.userId));

export const updateMe = authed({ body: updateProfileSchema }, ({ body, actor, req }) =>
  auth.updateProfile(actor, body, meta(req)),
);

export const changePassword = authed(
  { body: changePasswordSchema },
  async ({ body, actor, req }) => {
    await auth.changePassword(actor, body.currentPassword, body.newPassword, meta(req));
  },
);
