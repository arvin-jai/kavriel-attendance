import { z } from 'zod';

const secret = z.string().min(32, 'must be at least 32 characters');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().min(1),

  JWT_SECRET: secret,
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).default(30),

  QR_SIGNING_SECRET: secret,
  QR_DEFAULT_ROTATION_SECONDS: z.coerce.number().int().min(10).max(60).default(15),
  QR_GRACE_WINDOWS: z.coerce.number().int().min(0).max(3).default(1),

  TEACHER_SIGNUP_CODE: z.string().min(6, 'must be at least 6 characters'),

  SCHOOL_TIMEZONE: z.string().default('Asia/Manila'),
  SESSION_EARLY_START_MINUTES: z.coerce.number().int().min(0).max(120).default(15),

  CORS_ORIGIN: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  RATE_LIMIT_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error(`Invalid environment variables:\n${z.prettifyError(parsed.error)}`);
    process.exit(1);
  }
  if (parsed.data.JWT_SECRET === parsed.data.QR_SIGNING_SECRET) {
    console.error('JWT_SECRET and QR_SIGNING_SECRET must be different.');
    process.exit(1);
  }
  return parsed.data;
}

/** Validated environment. Fails fast at boot if anything is missing or malformed. */
export const env: Env = loadEnv();
