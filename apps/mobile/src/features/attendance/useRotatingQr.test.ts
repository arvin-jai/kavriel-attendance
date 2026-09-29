import type { QrTokenDto } from '@kavriel/shared';
import { act, renderHook } from '@testing-library/react-native';

import { ApiError } from '@/api/client';
import { sessionsApi } from '@/api/endpoints';

import { useRotatingQr } from './useRotatingQr';

jest.mock('@/api/endpoints', () => ({ sessionsApi: { qr: jest.fn() } }));
const qrMock = sessionsApi.qr as jest.Mock;

const START = Date.parse('2026-09-28T01:00:00.000Z');

/** Server response for window `w` of a 15-second rotation, as seen at device time `now`. */
function tokenAt(now: number, w: number): QrTokenDto {
  return {
    token: `KAV1.token-${w}`,
    windowIndex: w,
    expiresAt: new Date(START + (w + 1) * 15_000).toISOString(),
    serverTime: new Date(now).toISOString(),
    rotationSeconds: 15,
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(START);
  qrMock.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useRotatingQr', () => {
  it('shows the current token and counts down to its expiry', async () => {
    qrMock.mockImplementation(async () => tokenAt(Date.now(), 0));
    const { result } = await renderHook(() => useRotatingQr('s1'));
    await flush();

    expect(result.current.token).toBe('KAV1.token-0');
    expect(result.current.secondsLeft).toBe(15);

    await act(async () => {
      jest.advanceTimersByTime(5_000);
    });
    expect(result.current.secondsLeft).toBe(10);
  });

  it('fetches the next token about a second before the current one expires', async () => {
    qrMock.mockImplementation(async () =>
      tokenAt(Date.now(), Math.floor((Date.now() - START) / 15_000)),
    );
    const { result } = await renderHook(() => useRotatingQr('s1'));
    await flush();
    expect(qrMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(13_900);
    });
    expect(qrMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(200); // 14.1 s: refresh fired, still window 0
    });
    await flush();
    expect(qrMock).toHaveBeenCalledTimes(2);
    expect(result.current.token).not.toBeNull();
  });

  it('never shows an expired token when refreshing fails', async () => {
    qrMock.mockResolvedValueOnce(tokenAt(START, 0));
    qrMock.mockRejectedValue(new ApiError(0, 'NETWORK', 'offline'));
    const { result } = await renderHook(() => useRotatingQr('s1'));
    await flush();
    expect(result.current.token).toBe('KAV1.token-0');

    await act(async () => {
      jest.advanceTimersByTime(15_500); // past expiry; refreshes have failed
    });
    await flush();
    expect(result.current.token).toBeNull();
    expect(result.current.error?.code).toBe('NETWORK');
  });

  it('uses the server clock, not the phone clock', async () => {
    // Phone clock is 60 s behind the server.
    const skew = 60_000;
    qrMock.mockImplementation(async () => tokenAt(Date.now() + skew, 4)); // window 4 of server time
    jest.setSystemTime(START + 4 * 15_000 + 5_000 - skew); // server time = 5 s into window 4
    const { result } = await renderHook(() => useRotatingQr('s1'));
    await flush();
    expect(result.current.token).toBe('KAV1.token-4');
    expect(result.current.secondsLeft).toBe(10);
  });

  it('stops retrying once the session is no longer active', async () => {
    qrMock.mockRejectedValue(new ApiError(409, 'SESSION_NOT_ACTIVE', 'closed'));
    const { result } = await renderHook(() => useRotatingQr('s1'));
    await flush();
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    expect(qrMock).toHaveBeenCalledTimes(1);
    expect(result.current.error?.code).toBe('SESSION_NOT_ACTIVE');
  });

  it('does nothing while disabled', async () => {
    await renderHook(() => useRotatingQr('s1', false));
    await flush();
    expect(qrMock).not.toHaveBeenCalled();
  });
});
