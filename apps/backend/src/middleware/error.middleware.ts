import type { ErrorRequestHandler, RequestHandler } from 'express';

import { env } from '../config/env';
import { Prisma } from '../generated/prisma/client';
import { AppError } from '../lib/http-errors';
import { logger } from '../lib/logger';

/** 404 for unknown routes. */
export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
      requestId: req.id,
    },
  });
};

function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002':
        return new AppError(409, 'CONFLICT', 'A record with these values already exists');
      case 'P2003':
        return new AppError(409, 'IN_USE', 'This record is referenced by other data');
      case 'P2025':
        return new AppError(404, 'NOT_FOUND', 'Resource not found');
    }
  }

  // Body-parser errors (malformed JSON, oversized payload).
  const type = (err as { type?: string } | null)?.type;
  if (type === 'entity.parse.failed') {
    return new AppError(400, 'VALIDATION_ERROR', 'Malformed JSON body');
  }
  if (type === 'entity.too.large') {
    return new AppError(413, 'VALIDATION_ERROR', 'Request body too large');
  }

  return new AppError(500, 'INTERNAL', 'Something went wrong');
}

/** Central error handler: consistent `{ error }` envelope, no stack traces for clients. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const appError = toAppError(err);
  if (appError.status >= 500) {
    logger.error({ err, requestId: req.id, path: req.path }, 'Unhandled error');
  }
  res.status(appError.status).json({
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details !== undefined ? { details: appError.details } : {}),
      ...(env.NODE_ENV !== 'production' && appError.status >= 500 && err instanceof Error
        ? { debug: err.message }
        : {}),
      requestId: req.id,
    },
  });
};
