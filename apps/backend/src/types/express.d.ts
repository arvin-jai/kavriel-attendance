import type { Actor } from './actor';

declare global {
  namespace Express {
    interface Request {
      /** Set by requestId middleware. */
      id: string;
      /** Set by requireAuth. */
      actor?: Actor;
    }
  }
}

export {};
