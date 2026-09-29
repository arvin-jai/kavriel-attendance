import jwt from 'jsonwebtoken';

import { env } from '../config/env';
import { unauthorized } from './http-errors';

export interface AccessTokenClaims {
  sub: string; // userId
  role: string;
}

const ALGORITHM = 'HS256';
const ISSUER = 'kavriel-api';

export function signAccessToken(claims: AccessTokenClaims): string {
  return jwt.sign({ role: claims.role }, env.JWT_SECRET, {
    algorithm: ALGORITHM,
    issuer: ISSUER,
    subject: claims.sub,
    expiresIn: env.JWT_ACCESS_TTL_SECONDS,
  });
}

/** Verify signature, algorithm, issuer and expiry. Throws 401 TOKEN_EXPIRED or UNAUTHENTICATED. */
export function verifyAccessToken(token: string): AccessTokenClaims {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: [ALGORITHM],
      issuer: ISSUER,
    });
    if (typeof payload === 'string' || typeof payload.sub !== 'string') {
      throw unauthorized();
    }
    return { sub: payload.sub, role: String(payload.role) };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw unauthorized('TOKEN_EXPIRED', 'Access token expired');
    }
    throw unauthorized('UNAUTHENTICATED', 'Invalid access token');
  }
}
