import type { Request, RequestHandler } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

import { env } from '../config/env';

type KeyBy = 'ip' | 'user' | 'ip+email';

interface LimitOptions {
  windowMs: number;
  limit: number;
  keyBy?: KeyBy;
}

function keyFor(req: Request, keyBy: KeyBy): string {
  const ip = ipKeyGenerator(req.ip ?? 'unknown');
  if (keyBy === 'user') return req.actor?.userId ?? ip;
  if (keyBy === 'ip+email') {
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : '';
    return `${ip}|${email}`;
  }
  return ip;
}

/**
 * In-memory rate limiter (single instance). Swap the store for Postgres/Redis before
 * running more than one API instance.
 */
export function limiter({ windowMs, limit, keyBy = 'ip' }: LimitOptions): RequestHandler {
  if (!env.RATE_LIMIT_ENABLED) return (_req, _res, next) => next();
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => keyFor(req, keyBy),
    handler: (req, res) => {
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Try again shortly.',
          requestId: req.id,
        },
      });
    },
  });
}

const MINUTE = 60_000;

export const limits = {
  // Generous: a whole classroom often shares one NAT IP, and the teacher polls every 3 s.
  global: () => limiter({ windowMs: MINUTE, limit: 600 }),
  login: () => limiter({ windowMs: 15 * MINUTE, limit: 5, keyBy: 'ip+email' }),
  register: () => limiter({ windowMs: 60 * MINUTE, limit: 10 }),
  refresh: () => limiter({ windowMs: 15 * MINUTE, limit: 30 }),
  checkInUser: () => limiter({ windowMs: MINUTE, limit: 10, keyBy: 'user' }),
  checkInIp: () => limiter({ windowMs: MINUTE, limit: 60 }),
  lookup: () => limiter({ windowMs: MINUTE, limit: 30, keyBy: 'user' }),
  qr: () => limiter({ windowMs: MINUTE, limit: 30, keyBy: 'user' }),
};
