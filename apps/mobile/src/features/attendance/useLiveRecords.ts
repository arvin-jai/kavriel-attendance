import type { RosterEntryDto, SessionRecordsDto } from '@kavriel/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { ApiError } from '@/api/client';
import { sessionsApi } from '@/api/endpoints';

import { isForeground } from './appState';

const FULL_REFRESH_EVERY = 10; // polls; picks up roster changes (enrollments) too

interface LiveRecords {
  data: SessionRecordsDto | null;
  error: ApiError | null;
  loading: boolean;
  /** Force a full reload (after a manual edit, end or lock). */
  reload: () => Promise<void>;
}

/**
 * Teacher's live roster. Polls every `intervalMs` while the app is in the foreground, asking
 * only for records changed since the last server time and merging them into the roster.
 */
export function useLiveRecords(sessionId: string, intervalMs: number | false): LiveRecords {
  const [data, setData] = useState<SessionRecordsDto | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const cursorRef = useRef<string | undefined>(undefined);
  const pollsRef = useRef(0);

  const fetchRecords = useCallback(
    async (full: boolean) => {
      try {
        const since = full ? undefined : cursorRef.current;
        const res = await sessionsApi.records(sessionId, since);
        cursorRef.current = res.serverTime;
        setData((prev) => {
          if (!since || !prev) return res;
          // Map keeps the roster order; changed entries are replaced in place, new ones appended.
          const merged = new Map<string, RosterEntryDto>(
            prev.entries.map((e) => [e.student.id, e]),
          );
          for (const e of res.entries) merged.set(e.student.id, e);
          return { ...res, entries: [...merged.values()] };
        });
        setError(null);
      } catch (err) {
        setError(
          err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Could not load attendance'),
        );
      } finally {
        setLoading(false);
      }
    },
    [sessionId],
  );

  const reload = useCallback(() => fetchRecords(true), [fetchRecords]);

  useEffect(() => {
    void fetchRecords(true);
  }, [fetchRecords]);

  useEffect(() => {
    if (!intervalMs) return;
    let active = isForeground(AppState.currentState);
    const sub = AppState.addEventListener('change', (state) => {
      active = isForeground(state);
      if (active) void fetchRecords(true);
    });
    const timer = setInterval(() => {
      if (!active) return;
      pollsRef.current += 1;
      void fetchRecords(pollsRef.current % FULL_REFRESH_EVERY === 0);
    }, intervalMs);
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [fetchRecords, intervalMs]);

  return { data, error, loading, reload };
}
