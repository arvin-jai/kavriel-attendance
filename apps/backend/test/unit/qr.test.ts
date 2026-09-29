import { looksLikeAttendanceQr } from '@kavriel/shared';
import { describe, expect, it } from 'vitest';

import {
  checkWindow,
  currentWindow,
  signToken,
  verifyToken,
  windowExpiresAt,
} from '../../src/modules/qr/qr.service';

const SECRET = 'unit-test-secret-0123456789abcdefghijkl';
const SESSION = '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e';

describe('QR tokens', () => {
  it('round-trips session id and window', () => {
    const token = signToken(SECRET, SESSION, 42);
    expect(verifyToken(SECRET, token)).toEqual({ sessionId: SESSION, windowIndex: 42 });
  });

  it('matches the shared shape check used by the scanner and stays short', () => {
    const token = signToken(SECRET, SESSION, 0);
    expect(looksLikeAttendanceQr(token)).toBe(true);
    expect(token.length).toBeLessThan(60);
  });

  it('contains no readable personal data', () => {
    expect(signToken(SECRET, SESSION, 7)).not.toContain(SESSION);
  });

  it('rejects a token signed with another secret', () => {
    const token = signToken('another-secret-0123456789abcdefghijklmn', SESSION, 1);
    expect(verifyToken(SECRET, token)).toBeNull();
  });

  it('rejects a tampered window or session', () => {
    const token = signToken(SECRET, SESSION, 5);
    const [prefix, payload, mac] = token.split('.');
    const bytes = Buffer.from(payload!, 'base64url');
    bytes.writeUInt32BE(6, 16); // bump the window
    expect(verifyToken(SECRET, `${prefix}.${bytes.toString('base64url')}.${mac}`)).toBeNull();
    bytes.writeUInt32BE(5, 16);
    bytes[0] = bytes[0]! ^ 0xff; // change the session
    expect(verifyToken(SECRET, `${prefix}.${bytes.toString('base64url')}.${mac}`)).toBeNull();
  });

  it('rejects malformed input', () => {
    const bad = ['', 'KAV1', 'KAV1..', 'hello world', `KAV2.${'a'.repeat(27)}.${'b'.repeat(22)}`];
    for (const value of bad) expect(verifyToken(SECRET, value)).toBeNull();
  });
});

describe('QR windows', () => {
  const start = new Date('2026-09-01T01:00:00Z');

  it('computes the current window from server time', () => {
    expect(currentWindow(start, new Date(start.getTime() + 14_999), 15)).toBe(0);
    expect(currentWindow(start, new Date(start.getTime() + 15_000), 15)).toBe(1);
    expect(currentWindow(start, new Date(start.getTime() - 5_000), 15)).toBe(0);
  });

  it('computes window expiry', () => {
    expect(windowExpiresAt(start, 2, 15).toISOString()).toBe('2026-09-01T01:00:45.000Z');
  });

  it('accepts the current window plus the grace window only', () => {
    expect(checkWindow(10, 10, 1)).toBe('OK');
    expect(checkWindow(9, 10, 1)).toBe('OK');
    expect(checkWindow(8, 10, 1)).toBe('EXPIRED');
    expect(checkWindow(11, 10, 1)).toBe('FUTURE');
    expect(checkWindow(9, 10, 0)).toBe('EXPIRED');
  });
});
