import { looksLikeAttendanceQr } from '@kavriel/shared';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function base64UrlToBytes(input: string): number[] {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of input) {
    const value = ALPHABET.indexOf(ch);
    if (value < 0) throw new Error('invalid base64url');
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return bytes;
}

/**
 * Read the session id embedded in a QR token, only to look up "did my check-in land?" after a
 * network failure. It is never trusted for anything: the server verifies the signature.
 */
export function sessionIdFromToken(token: string): string | null {
  if (!looksLikeAttendanceQr(token)) return null;
  try {
    const bytes = base64UrlToBytes(token.split('.')[1] ?? '').slice(0, 16);
    if (bytes.length !== 16) return null;
    const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } catch {
    return null;
  }
}
