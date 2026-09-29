/**
 * Rotating attendance QR tokens: stateless, HMAC-signed and time-windowed.
 *
 *   KAV1.<b64url(sessionId 16 bytes ‖ windowIndex uint32 BE)>.<b64url(HMAC-SHA256 truncated to 16 bytes)>
 *
 * - The MAC key is derived per session with HKDF(QR_SIGNING_SECRET, info = sessionId), so the
 *   token can't be moved to another session and no per-token rows are stored.
 * - windowIndex = floor((now − session.startedAt) / rotation). Only the server clock is used.
 * - The payload carries no personal data: an opaque session UUID and a counter.
 */
import { createHmac, hkdfSync } from 'node:crypto';

import { QR_PREFIX } from '@kavriel/shared';

import { safeEqual } from '../../lib/crypto';

const MAC_BYTES = 16;

function uuidToBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ''), 'hex');
}

function bytesToUuid(bytes: Buffer): string {
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function sessionKey(secret: string, sessionId: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), `kavriel-qr:${sessionId}`, 32));
}

function mac(secret: string, sessionId: string, payloadB64: string): Buffer {
  return createHmac('sha256', sessionKey(secret, sessionId))
    .update(`${QR_PREFIX}.${payloadB64}`)
    .digest()
    .subarray(0, MAC_BYTES);
}

export function signToken(secret: string, sessionId: string, windowIndex: number): string {
  const payload = Buffer.alloc(20);
  uuidToBytes(sessionId).copy(payload, 0);
  payload.writeUInt32BE(windowIndex, 16);
  const payloadB64 = payload.toString('base64url');
  return `${QR_PREFIX}.${payloadB64}.${mac(secret, sessionId, payloadB64).toString('base64url')}`;
}

/** Verify format and signature. Returns the embedded session/window, or null if forged or malformed. */
export function verifyToken(
  secret: string,
  token: string,
): { sessionId: string; windowIndex: number } | null {
  const parts = token.trim().split('.');
  if (parts.length !== 3 || parts[0] !== QR_PREFIX) return null;
  const [, payloadB64 = '', macB64 = ''] = parts;
  if (!/^[A-Za-z0-9_-]{27}$/.test(payloadB64) || !/^[A-Za-z0-9_-]{22}$/.test(macB64)) return null;

  const payload = Buffer.from(payloadB64, 'base64url');
  if (payload.length !== 20) return null;
  const sessionId = bytesToUuid(payload.subarray(0, 16));
  const windowIndex = payload.readUInt32BE(16);

  const expected = mac(secret, sessionId, payloadB64);
  if (!safeEqual(expected, Buffer.from(macB64, 'base64url'))) return null;
  return { sessionId, windowIndex };
}

export function currentWindow(startedAt: Date, now: Date, rotationSeconds: number): number {
  return Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / (rotationSeconds * 1000)));
}

export function windowExpiresAt(
  startedAt: Date,
  windowIndex: number,
  rotationSeconds: number,
): Date {
  return new Date(startedAt.getTime() + (windowIndex + 1) * rotationSeconds * 1000);
}

export type WindowCheck = 'OK' | 'EXPIRED' | 'FUTURE';

/**
 * A token is accepted for its own window plus `graceWindows` after it (scan and network latency).
 * A window from the future can only come from tampering or a bug.
 */
export function checkWindow(
  tokenWindow: number,
  current: number,
  graceWindows: number,
): WindowCheck {
  if (tokenWindow > current) return 'FUTURE';
  if (current - tokenWindow > graceWindows) return 'EXPIRED';
  return 'OK';
}
