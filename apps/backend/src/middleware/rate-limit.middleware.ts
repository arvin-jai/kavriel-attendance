import { createHash } from 'node:crypto';

import type { Request, RequestHandler } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

import { env } from '../config/env';

/**
 * What a limit counts against. A whole school usually reaches the API from ONE public IP
 * (school Wi-Fi NAT), so per-IP limits are only high backstops; the real limits are keyed
 * per user, per email or per refresh token.
 */
type KeyBy = 'ip' | 'user' | 'email' | 'refreshToken';

interface LimitOptions {
  windowMs: number;
  limit: number;
  keyBy?: KeyBy;
}

const bodyString = (req: Request, field: string): string =>
  typeof req.body?.[field] === 'string' ? req.body[field] : '';

function keyFor(req: Request, keyBy: KeyBy): string {
  const ip = ipKeyGenerator(req.ip ?? 'unknown');
  switch (keyBy) {
    case 'user':
      return req.actor ? `user:${req.actor.userId}` : `ip:${ip}`;
    case 'email':
      return `email:${bodyString(req, 'email').trim().toLowerCase()}`;
    case 'refreshToken': {
      // Hash so raw tokens never sit in the limiter's memory.
      const hash = createHash('sha256').update(bodyString(req, 'refreshToken')).digest('hex');
      return `rt:${hash}`;
    }
    default:
      return `ip:${ip}`;
  }
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
  // Backstop per IP: sized for a whole school (dozens of classes) behind one NAT address.
  global: () => limiter({ windowMs: MINUTE, limit: 6000 }),

  // Password guessing is limited per account; the IP limit only stops wholesale spraying.
  login: () => limiter({ windowMs: 15 * MINUTE, limit: 10, keyBy: 'email' }),
  loginIp: () => limiter({ windowMs: 15 * MINUTE, limit: 2000 }),

  // First day of term: whole classes register from school Wi-Fi.
  register: () => limiter({ windowMs: 60 * MINUTE, limit: 1000 }),

  refresh: () => limiter({ windowMs: 15 * MINUTE, limit: 20, keyBy: 'refreshToken' }),
  refreshIp: () => limiter({ windowMs: 15 * MINUTE, limit: 5000 }),

  // One student rarely needs more than a few scans a minute; many students share an IP.
  checkInUser: () => limiter({ windowMs: MINUTE, limit: 10, keyBy: 'user' }),
  checkInIp: () => limiter({ windowMs: MINUTE, limit: 2000 }),

  lookup: () => limiter({ windowMs: MINUTE, limit: 30, keyBy: 'user' }),
  qr: () => limiter({ windowMs: MINUTE, limit: 30, keyBy: 'user' }),
};
