import type { CheckInResultDto, MyAttendanceItemDto } from '@kavriel/shared';

import { ApiError } from '@/api/client';

import { runCheckIn, type CheckInDeps } from './checkInFlow';
import { sessionIdFromToken } from './qrToken';

// Signed by the backend's signToken for session 3f2b8c1e-… window 7 (see qrToken tests).
const TOKEN = 'KAV1.PyuMHk1aS2yNfp8KGyw9TgAAAAc.GtlMM-TIwBouxDv2InYPUw';
const SESSION_ID = '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e';

const result: CheckInResultDto = {
  alreadyRecorded: false,
  attendance: { id: 'a1', status: 'PRESENT', checkInTime: '2026-09-28T01:02:00.000Z' },
  session: {
    id: SESSION_ID,
    classCode: 'MATH101-A',
    sectionName: 'A',
    subjectCode: 'MATH101',
    subjectName: 'Math',
  },
};

const record: MyAttendanceItemDto = {
  id: 'a1',
  status: 'PRESENT',
  checkInTime: '2026-09-28T01:02:00.000Z',
  remarks: null,
  session: {
    id: SESSION_ID,
    startedAt: '2026-09-28T01:00:00.000Z',
    class: {
      id: 'c1',
      classCode: 'MATH101-A',
      sectionName: 'A',
      subject: { id: 's1', subjectCode: 'MATH101', subjectName: 'Math' },
    },
  },
};

function deps(
  overrides: Partial<CheckInDeps> = {},
): CheckInDeps & { findRecord: jest.Mock; checkIn: jest.Mock } {
  return {
    checkIn: jest.fn().mockResolvedValue(result),
    findRecord: jest.fn().mockResolvedValue(undefined),
    onReconciling: jest.fn(),
    ...overrides,
  } as CheckInDeps & { findRecord: jest.Mock; checkIn: jest.Mock };
}

describe('runCheckIn', () => {
  it('reports success only from the server response', async () => {
    const d = deps();
    const outcome = await runCheckIn(`  ${TOKEN} `, d);
    expect(outcome).toEqual({ kind: 'success', result, reconciled: false });
    expect(d.checkIn).toHaveBeenCalledWith(TOKEN);
  });

  it('ignores codes that are not Kavriel QR codes without calling the API', async () => {
    const d = deps();
    const outcome = await runCheckIn('https://example.com/promo', d);
    expect(outcome).toEqual({ kind: 'retry', hint: "That isn't a Kavriel attendance QR code." });
    expect(d.checkIn).not.toHaveBeenCalled();
  });

  it('asks for the current code when the QR expired', async () => {
    const d = deps({
      checkIn: jest.fn().mockRejectedValue(new ApiError(410, 'QR_EXPIRED', 'expired')),
    });
    await expect(runCheckIn(TOKEN, d)).resolves.toEqual({
      kind: 'retry',
      hint: 'QR expired. Please scan the current QR code.',
    });
  });

  it.each([
    ['NOT_ENROLLED', 403, 'Not enrolled'],
    ['SESSION_NOT_ACTIVE', 409, 'Attendance closed'],
    ['QR_INVALID', 400, 'Invalid QR code'],
  ] as const)('shows %s as an error with the server message', async (code, status, title) => {
    const d = deps({
      checkIn: jest.fn().mockRejectedValue(new ApiError(status, code, 'server says no')),
    });
    await expect(runCheckIn(TOKEN, d)).resolves.toEqual({
      kind: 'error',
      title,
      message: 'server says no',
    });
    expect(d.findRecord).not.toHaveBeenCalled();
  });

  it('after a timeout, confirms success from the server record (request had landed)', async () => {
    const d = deps({
      checkIn: jest.fn().mockRejectedValue(new ApiError(0, 'TIMEOUT', 'slow')),
      findRecord: jest.fn().mockResolvedValue(record),
    });
    const outcome = await runCheckIn(TOKEN, d);
    expect(d.onReconciling).toHaveBeenCalled();
    expect(d.findRecord).toHaveBeenCalledWith(SESSION_ID);
    expect(outcome).toMatchObject({
      kind: 'success',
      reconciled: true,
      result: { alreadyRecorded: true, attendance: { id: 'a1', status: 'PRESENT' } },
    });
  });

  it('after a network failure with no server record, never claims success', async () => {
    const d = deps({ checkIn: jest.fn().mockRejectedValue(new ApiError(0, 'NETWORK', 'offline')) });
    const outcome = await runCheckIn(TOKEN, d);
    expect(outcome.kind).toBe('error');
    expect(outcome).toMatchObject({ title: "Couldn't confirm your attendance" });
  });

  it('treats a failing reconcile lookup as unconfirmed, not as success', async () => {
    const d = deps({
      checkIn: jest.fn().mockRejectedValue(new ApiError(0, 'NETWORK', 'offline')),
      findRecord: jest.fn().mockRejectedValue(new ApiError(0, 'NETWORK', 'still offline')),
    });
    expect((await runCheckIn(TOKEN, d)).kind).toBe('error');
  });

  it.each(['ABSENT', 'EXCUSED'] as const)(
    'never shows an existing %s record as a successful check-in',
    async (status) => {
      const already: CheckInResultDto = {
        ...result,
        alreadyRecorded: true,
        attendance: { id: 'a1', status, checkInTime: null },
      };
      const outcome = await runCheckIn(
        TOKEN,
        deps({ checkIn: jest.fn().mockResolvedValue(already) }),
      );
      expect(outcome).toMatchObject({
        kind: 'error',
        title: `Already marked ${status.toLowerCase()}`,
      });

      // Same after a network failure + reconcile.
      const reconciled = await runCheckIn(
        TOKEN,
        deps({
          checkIn: jest.fn().mockRejectedValue(new ApiError(0, 'TIMEOUT', 'slow')),
          findRecord: jest.fn().mockResolvedValue({ ...record, status, checkInTime: null }),
        }),
      );
      expect(reconciled.kind).toBe('error');
    },
  );

  it('shows LATE as a successful check-in', async () => {
    const late: CheckInResultDto = {
      ...result,
      attendance: { ...result.attendance, status: 'LATE' },
    };
    const outcome = await runCheckIn(TOKEN, deps({ checkIn: jest.fn().mockResolvedValue(late) }));
    expect(outcome.kind).toBe('success');
  });

  it('shows a generic error for unexpected failures', async () => {
    const d = deps({ checkIn: jest.fn().mockRejectedValue(new Error('boom')) });
    await expect(runCheckIn(TOKEN, d)).resolves.toMatchObject({
      kind: 'error',
      title: 'Check-in failed',
    });
  });
});

describe('sessionIdFromToken', () => {
  it('decodes the session id from a backend-signed token', () => {
    expect(sessionIdFromToken(TOKEN)).toBe(SESSION_ID);
  });

  it('returns null for anything that is not a token', () => {
    expect(sessionIdFromToken('')).toBeNull();
    expect(sessionIdFromToken('KAV1.short.mac')).toBeNull();
    expect(sessionIdFromToken('hello')).toBeNull();
  });
});
