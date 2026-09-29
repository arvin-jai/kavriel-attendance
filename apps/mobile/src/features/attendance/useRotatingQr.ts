import type { QrTokenDto } from '@kavriel/shared';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { ApiError } from '@/api/client';
import { sessionsApi } from '@/api/endpoints';

interface RotatingQr {
  /** Current token, or null when it has expired and no fresh one has arrived (never show a stale QR). */
  token: string | null;
  /** Whole seconds until the current token rotates. */
  secondsLeft: number;
  rotationSeconds: number;
  error: ApiError | null;
}

const REFRESH_LEAD_MS = 1_000;
const RETRY_MS = 2_000;

/**
 * Fetches the session's QR token and refreshes it just before it expires. Timing uses the
 * server clock (offset = serverTime − device time) so a wrong phone clock doesn't matter.
 */
export function useRotatingQr(sessionId: string, enabled = true): RotatingQr {
  const [qr, setQr] = useState<QrTokenDto | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const offsetRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let active = AppState.currentState === 'active';

    const schedule = (ms: number) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(load, Math.max(250, ms));
    };

    async function load() {
      if (!active || cancelled) return;
      try {
        const next = await sessionsApi.qr(sessionId);
        if (cancelled) return;
        offsetRef.current = new Date(next.serverTime).getTime() - Date.now();
        setQr(next);
        setError(null);
        const expiresInMs = new Date(next.expiresAt).getTime() - (Date.now() + offsetRef.current);
        schedule(expiresInMs - REFRESH_LEAD_MS);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Could not load the QR code'),
        );
        // A closed session won't come back; anything else (network, timeout) is retried.
        if (!(err instanceof ApiError && err.code === 'SESSION_NOT_ACTIVE')) schedule(RETRY_MS);
      }
    }

    void load();
    const tick = setInterval(() => setNow(Date.now()), 250);
    const sub = AppState.addEventListener('change', (state) => {
      active = state === 'active';
      if (active) void load();
      else if (timerRef.current) clearTimeout(timerRef.current);
    });

    return () => {
      cancelled = true;
      clearInterval(tick);
      sub.remove();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [sessionId, enabled]);

  const serverNow = now + offsetRef.current;
  const expiresAt = qr ? new Date(qr.expiresAt).getTime() : 0;
  const fresh = qr !== null && serverNow < expiresAt;

  return {
    token: fresh ? qr.token : null,
    secondsLeft: fresh ? Math.ceil((expiresAt - serverNow) / 1000) : 0,
    rotationSeconds: qr?.rotationSeconds ?? 15,
    error,
  };
}
