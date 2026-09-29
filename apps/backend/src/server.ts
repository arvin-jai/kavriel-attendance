import { createApp } from './app';
import { prisma } from './config/database';
import { env } from './config/env';
import { logger } from './lib/logger';

const server = createApp().listen(env.PORT, () => {
  logger.info(`Kavriel API listening on :${env.PORT} (${env.NODE_ENV})`);
});

function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  // Don't hang forever on open keep-alive connections.
  setTimeout(() => process.exit(0), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
