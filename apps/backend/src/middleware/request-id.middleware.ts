import { randomUUID } from 'node:crypto';

import type { RequestHandler } from 'express';

const VALID_ID = /^[A-Za-z0-9-]{8,64}$/;

/** Attach a request id (from `X-Request-Id` if well-formed) and echo it in the response. */
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.get('x-request-id');
  req.id = incoming && VALID_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
};
