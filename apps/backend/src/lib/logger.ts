import pino from 'pino';

import { env } from '../config/env';

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      '*.password',
      '*.currentPassword',
      '*.newPassword',
      '*.refreshToken',
      '*.qrToken',
    ],
    censor: '[redacted]',
  },
  ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
});
