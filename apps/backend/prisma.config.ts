import { existsSync } from 'node:fs';

import { defineConfig } from 'prisma/config';

// Prisma 7's CLI doesn't read .env on its own. Load it for local runs; hosts inject env vars.
if (existsSync('.env')) process.loadEnvFile('.env');

// Migrations use the direct (non-pooled) connection. `prisma generate` needs no URL at all.
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  ...(url ? { datasource: { url } } : {}),
});
