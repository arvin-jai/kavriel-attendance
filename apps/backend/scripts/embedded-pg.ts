import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import EmbeddedPostgres from 'embedded-postgres';

export interface ClusterOptions {
  dataDir: string;
  port: number;
  user: string;
  password: string;
  /** Keep data on stop. `false` deletes the data directory when the cluster stops. */
  persistent: boolean;
  quiet?: boolean;
}

/**
 * Start a local PostgreSQL 17 cluster from the binaries bundled by `embedded-postgres`.
 * Initialises the data directory on first use. No Docker or system install needed.
 */
export async function startCluster(opts: ClusterOptions): Promise<EmbeddedPostgres> {
  const pg = new EmbeddedPostgres({
    databaseDir: opts.dataDir,
    port: opts.port,
    user: opts.user,
    password: opts.password,
    authMethod: 'scram-sha-256',
    persistent: opts.persistent,
    initdbFlags: ['--encoding=UTF8', '--no-locale'],
    onLog: opts.quiet ? () => {} : (msg) => console.log(`[postgres] ${String(msg).trimEnd()}`),
    onError: (err) => console.error('[postgres]', err),
  });

  if (!existsSync(join(opts.dataDir, 'PG_VERSION'))) {
    await pg.initialise();
  }
  await pg.start();
  return pg;
}

/** Create `name` if it doesn't exist yet. */
export async function ensureDatabase(pg: EmbeddedPostgres, name: string): Promise<void> {
  const client = pg.getPgClient('postgres', 'localhost');
  await client.connect();
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (!rowCount) await pg.createDatabase(name);
  } finally {
    await client.end();
  }
}

export function connectionUrl(opts: ClusterOptions, database: string): string {
  const user = encodeURIComponent(opts.user);
  const password = encodeURIComponent(opts.password);
  return `postgresql://${user}:${password}@localhost:${opts.port}/${database}`;
}

/** Path to the bundled `pg_ctl` for this OS/arch (same package `embedded-postgres` loads). */
async function pgCtlPath(): Promise<string> {
  const platform = process.platform === 'win32' ? 'windows' : process.platform;
  const mod = (await import(`@embedded-postgres/${platform}-${process.arch}`)) as {
    pg_ctl: string;
  };
  return mod.pg_ctl;
}

/** Whether a cluster is currently running from `dataDir` (`pg_ctl status`). */
export async function isClusterRunning(dataDir: string): Promise<boolean> {
  if (!existsSync(join(dataDir, 'PG_VERSION'))) return false;
  const result = spawnSync(await pgCtlPath(), ['status', '-D', dataDir], { stdio: 'ignore' });
  return result.status === 0;
}

/**
 * Stop a cluster by data directory. Used when the process that started it is gone,
 * e.g. the terminal was closed instead of pressing Ctrl+C.
 */
export async function stopClusterByDataDir(dataDir: string): Promise<void> {
  const result = spawnSync(await pgCtlPath(), ['stop', '-D', dataDir, '-m', 'fast', '-w'], {
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`pg_ctl stop exited with code ${result.status}`);
  }
}
