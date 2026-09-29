/**
 * Local development database (no Docker).
 *
 *   npm run db          start PostgreSQL 17 on localhost:5433 (Ctrl+C to stop)
 *   npm run db:stop     stop a cluster left running (e.g. terminal closed without Ctrl+C)
 *   npm run db:reset    delete the local data directory (stops the cluster first)
 *
 * Data lives in apps/backend/.pgdata, which is gitignored.
 */
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  connectionUrl,
  ensureDatabase,
  isClusterRunning,
  startCluster,
  stopClusterByDataDir,
  type ClusterOptions,
} from './embedded-pg';

const DATABASE = 'kavriel';

const options: ClusterOptions = {
  dataDir: fileURLToPath(new URL('../.pgdata', import.meta.url)),
  port: Number(process.env.DB_PORT ?? 5433),
  user: 'kavriel',
  password: 'kavriel',
  persistent: true,
};

async function start() {
  if (await isClusterRunning(options.dataDir)) {
    console.log(`PostgreSQL is already running: ${connectionUrl(options, DATABASE)}`);
    console.log('Run `npm run db:stop` to stop it.');
    return;
  }

  const pg = await startCluster(options);
  await ensureDatabase(pg, DATABASE);
  console.log(`\nPostgreSQL ready: ${connectionUrl(options, DATABASE)}`);
  console.log('Press Ctrl+C to stop.\n');

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    console.log('\nStopping PostgreSQL…');
    await pg.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

async function stop() {
  if (!(await isClusterRunning(options.dataDir))) {
    console.log('PostgreSQL is not running.');
    return;
  }
  await stopClusterByDataDir(options.dataDir);
  console.log('PostgreSQL stopped.');
}

async function reset() {
  await stop();
  rmSync(options.dataDir, { recursive: true, force: true });
  console.log(`Deleted ${options.dataDir}. The next \`npm run db\` creates a fresh cluster.`);
}

const commands: Record<string, () => Promise<void>> = { start, stop, reset };
const command = commands[process.argv[2] ?? 'start'];

if (!command) {
  console.error(`Unknown command "${process.argv[2]}". Use start, stop or reset.`);
  process.exit(1);
}

command().catch((err) => {
  console.error(err);
  process.exit(1);
});
