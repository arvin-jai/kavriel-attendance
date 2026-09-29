import { defineConfig } from 'vitest/config';

// Deterministic, test-only configuration. Never used outside tests.
const testEnv = {
  NODE_ENV: 'test',
  JWT_SECRET: 'test-jwt-secret-0123456789abcdefghijklmnop',
  QR_SIGNING_SECRET: 'test-qr-secret-0123456789abcdefghijklmnopq',
  TEACHER_SIGNUP_CODE: 'teach-2026',
  SCHOOL_TIMEZONE: 'Asia/Manila',
  RATE_LIMIT_ENABLED: 'false',
};

export default defineConfig({
  test: {
    environment: 'node',
    env: testEnv,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.ts'],
          // Unit tests never connect; env validation just needs a value.
          env: { DATABASE_URL: 'postgresql://unused:unused@localhost:1/unused' },
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.ts'],
          globalSetup: ['test/support/global-setup.ts'],
          // Integration tests share one database; run files sequentially.
          fileParallelism: false,
          hookTimeout: 120_000,
          testTimeout: 30_000,
        },
      },
    ],
  },
});
