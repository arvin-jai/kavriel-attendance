/**
 * Vitest global setup for integration tests.
 *
 * Starts a throwaway PostgreSQL 17 cluster on a free port with a temp data directory, applies
 * the Prisma migrations and reference seed, and exposes it to test workers through
 * DATABASE_URL / DIRECT_URL. The cluster and its data are deleted when the run ends.
 *
 * Set TEST_DATABASE_URL to use an existing (empty) database instead, e.g. a CI service.
 */
import { execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  connectionUrl,
  ensureDatabase,
  startCluster,
  type ClusterOptions,
} from '../../scripts/embedded-pg';

const DATABASE = 'kavriel_test';

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === 'object') resolve(address.port);
        else reject(new Error('Could not determine a free port'));
      });
    });
  });
}

function migrateAndSeed(url: string) {
  const env = { ...process.env, DATABASE_URL: url, DIRECT_URL: url, SEED_DEMO: 'false' };
  execSync('npx prisma migrate deploy', { env, stdio: 'pipe' });
  execSync('npx prisma db seed', { env, stdio: 'pipe' });
}

export default async function setup() {
  const external = process.env.TEST_DATABASE_URL;
  if (external) {
    process.env.DATABASE_URL = external;
    process.env.DIRECT_URL = external;
    migrateAndSeed(external);
    return;
  }

  const options: ClusterOptions = {
    dataDir: mkdtempSync(join(tmpdir(), 'kavriel-pg-')),
    port: await freePort(),
    user: 'kavriel',
    password: 'kavriel',
    persistent: false,
    quiet: true,
  };

  const pg = await startCluster(options);
  await ensureDatabase(pg, DATABASE);

  const url = connectionUrl(options, DATABASE);
  process.env.DATABASE_URL = url;
  process.env.DIRECT_URL = url;
  migrateAndSeed(url);

  return async () => {
    await pg.stop();
  };
}
