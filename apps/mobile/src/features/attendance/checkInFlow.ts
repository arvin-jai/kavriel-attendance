/**
 * Decision logic for a student's scan, separated from the screen so every outcome is testable.
 * "Success" is only ever produced from a server response: the check-in call itself, or a
 * follow-up lookup that finds the server's record after a network failure.
 */
import {
  looksLikeAttendanceQr,
  type CheckInResultDto,
  type MyAttendanceItemDto,
} from '@kavriel/shared';

import { ApiError } from '@/api/client';
import { errorMessage } from '@/api/errors';

import { sessionIdFromToken } from './qrToken';

export type CheckInOutcome =
  /** Recorded (or already recorded) according to the server. */
  | { kind: 'success'; result: CheckInResultDto; reconciled: boolean }
  /** Keep scanning and show a hint (not our QR, or an expired code). */
  | { kind: 'retry'; hint: string }
  /** Stop and show an error with a "Scan again" action. */
  | { kind: 'error'; title: string; message: string };

export interface CheckInDeps {
  checkIn: (token: string) => Promise<CheckInResultDto>;
  /** The student's record for a session, if the server has one. */
  findRecord: (sessionId: string) => Promise<MyAttendanceItemDto | undefined>;
  /** Called before the reconcile lookup so the UI can say "checking…". */
  onReconciling?: () => void;
}

const TITLES: Partial<Record<string, string>> = {
  NOT_ENROLLED: 'Not enrolled',
  SESSION_NOT_ACTIVE: 'Attendance closed',
  QR_INVALID: 'Invalid QR code',
};

function fromRecord(record: MyAttendanceItemDto): CheckInResultDto {
  return {
    alreadyRecorded: true,
    attendance: { id: record.id, status: record.status, checkInTime: record.checkInTime },
    session: {
      id: record.session.id,
      classCode: record.session.class.classCode,
      sectionName: record.session.class.sectionName,
      subjectCode: record.session.class.subject.subjectCode,
      subjectName: record.session.class.subject.subjectName,
    },
  };
}

export async function runCheckIn(rawData: string, deps: CheckInDeps): Promise<CheckInOutcome> {
  const token = rawData.trim();
  if (!looksLikeAttendanceQr(token)) {
    return { kind: 'retry', hint: "That isn't a Kavriel attendance QR code." };
  }

  try {
    return { kind: 'success', result: await deps.checkIn(token), reconciled: false };
  } catch (err) {
    const code = err instanceof ApiError ? err.code : 'UNKNOWN';

    if (code === 'QR_EXPIRED') {
      return { kind: 'retry', hint: 'QR expired. Please scan the current QR code.' };
    }

    if (code === 'NETWORK' || code === 'TIMEOUT') {
      // The request may have reached the server before the connection dropped.
      const sessionId = sessionIdFromToken(token);
      if (sessionId) {
        deps.onReconciling?.();
        try {
          const record = await deps.findRecord(sessionId);
          if (record) return { kind: 'success', result: fromRecord(record), reconciled: true };
        } catch {
          // Still offline: fall through to the error below.
        }
      }
      return {
        kind: 'error',
        title: "Couldn't confirm your attendance",
        message: `${errorMessage(err)} Scanning again is safe: you can only be recorded once.`,
      };
    }

    return { kind: 'error', title: TITLES[code] ?? 'Check-in failed', message: errorMessage(err) };
  }
}
