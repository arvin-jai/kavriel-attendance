import type { ErrorCode } from '@kavriel/shared';

/** An error with an HTTP status and a machine-readable code, rendered by the error middleware. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (code: ErrorCode, message: string, details?: unknown) =>
  new AppError(400, code, message, details);
export const unauthorized = (
  code: ErrorCode = 'UNAUTHENTICATED',
  message = 'Authentication required',
) => new AppError(401, code, message);
export const forbidden = (
  code: ErrorCode = 'FORBIDDEN',
  message = 'You are not allowed to do that',
) => new AppError(403, code, message);
export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found`);
export const conflict = (code: ErrorCode, message: string, details?: unknown) =>
  new AppError(409, code, message, details);
export const gone = (code: ErrorCode, message: string) => new AppError(410, code, message);
export const unprocessable = (code: ErrorCode, message: string, details?: unknown) =>
  new AppError(422, code, message, details);
