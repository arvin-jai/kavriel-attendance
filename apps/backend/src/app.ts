import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';

import { prisma } from './config/database';
import { env } from './config/env';
import { logger } from './lib/logger';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { limits } from './middleware/rate-limit.middleware';
import { requestId } from './middleware/request-id.middleware';
import { apiRoutes } from './routes';

/** Build the Express app without binding a port, so tests can drive it directly. */
export function createApp(): Express {
  const app = express();

  // Behind one proxy hop in production (Render); needed for correct client IPs in rate limits.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as express.Request).id,
      autoLogging: { ignore: (req) => req.url === '/health' },
      // One compact line per request; never headers (they carry bearer tokens).
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
    }),
  );
  app.use(helmet());
  // Native mobile apps don't send Origin; CORS only matters for the Phase 3 admin web.
  app.use(cors({ origin: env.CORS_ORIGIN.length ? env.CORS_ORIGIN : false }));
  app.use(express.json({ limit: '100kb' }));

  // Liveness: no DB work, used by the host and the app's warm-up ping.
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  // Readiness: confirms the database is reachable.
  app.get('/health/ready', async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'ok' });
  });

  app.use('/api/v1', limits.global(), apiRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
