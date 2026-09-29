/** Prefix of every Kavriel attendance QR payload: `KAV1.<payload>.<mac>`. */
export const QR_PREFIX = 'KAV1';

/**
 * Shape check only, used by the mobile scanner for a fast "not a Kavriel QR" message.
 * Validity (signature, expiry, session) is decided by the server.
 */
export const QR_TOKEN_PATTERN = /^KAV1\.[A-Za-z0-9_-]{27}\.[A-Za-z0-9_-]{22}$/;

export function looksLikeAttendanceQr(value: string): boolean {
  return QR_TOKEN_PATTERN.test(value.trim());
}
