import { ApiError } from './client';

/** User-facing message for any thrown error. Server messages are already written for users. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'NETWORK':
        return "You're offline or the server can't be reached. Check your connection and try again.";
      case 'TIMEOUT':
        return 'The server is taking longer than usual (it may be waking up). Please try again.';
      case 'UNAUTHENTICATED':
      case 'TOKEN_EXPIRED':
      case 'INVALID_REFRESH_TOKEN':
        return 'Your session has expired. Please sign in again.';
      case 'RATE_LIMITED':
        return 'Too many attempts. Please wait a moment and try again.';
      case 'INTERNAL':
      case 'UNKNOWN':
        return 'Something went wrong on our side. Please try again.';
      default:
        return err.message;
    }
  }
  return 'Something went wrong. Please try again.';
}

/** Field-level validation messages from a 400 VALIDATION_ERROR, keyed by field name. */
export function fieldErrors(err: unknown): Record<string, string> {
  if (
    !(err instanceof ApiError) ||
    err.code !== 'VALIDATION_ERROR' ||
    !Array.isArray(err.details)
  ) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const d of err.details as { path: string; message: string }[]) {
    const field = d.path.split('.').slice(1).join('.');
    if (field && !out[field]) out[field] = d.message;
  }
  return out;
}
