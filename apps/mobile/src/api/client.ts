/**
 * Fetch wrapper for the Kavriel API.
 *
 * - Adds the access token and the per-install device id.
 * - Times out after 10 s (free-tier cold starts are reported as TIMEOUT, not as success).
 * - On an expired access token, refreshes once (single-flight) and retries the request.
 * - Normalises every failure into ApiError { status, code, message }.
 */
import type { ApiErrorBody, AuthTokensDto } from '@kavriel/shared';

import { API_URL } from '@/lib/env';

import { storage } from './tokenStore';

export type ClientErrorCode = ApiErrorBody['error']['code'] | 'NETWORK' | 'TIMEOUT' | 'UNKNOWN';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ClientErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const REFRESH_KEY = 'kavriel.refreshToken';
const DEFAULT_TIMEOUT_MS = 10_000;

let accessToken: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;
let onSessionExpired: (() => void) | null = null;
let deviceIdProvider: (() => Promise<string>) | null = null;

export const tokens = {
  async set(t: AuthTokensDto) {
    accessToken = t.accessToken;
    await storage.set(REFRESH_KEY, t.refreshToken);
  },
  async clear() {
    accessToken = null;
    await storage.remove(REFRESH_KEY);
  },
  getRefresh: () => storage.get(REFRESH_KEY),
};

/** Called by AuthProvider: what to do when the session can't be refreshed. */
export function setSessionExpiredHandler(handler: () => void) {
  onSessionExpired = handler;
}

export function setDeviceIdProvider(provider: () => Promise<string>) {
  deviceIdProvider = provider;
}

type Query = Record<string, string | number | boolean | undefined | null>;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Query;
  auth?: boolean;
  timeoutMs?: number;
}

function buildUrl(path: string, query?: Query): string {
  const url = `${API_URL}${path}`;
  if (!query) return url;
  const params = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return params.length ? `${url}?${params.join('&')}` : url;
}

async function send(path: string, opts: RequestOptions): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.auth !== false && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (deviceIdProvider) {
    try {
      headers['X-Device-Install-Id'] = await deviceIdProvider();
    } catch {
      // Audit-only header; never block a request over it.
    }
  }

  try {
    return await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      throw new ApiError(0, 'TIMEOUT', 'The server is taking too long to respond.');
    }
    throw new ApiError(0, 'NETWORK', "Can't reach the server. Check your connection.");
  } finally {
    clearTimeout(timer);
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as ApiErrorBody;
    return new ApiError(res.status, body.error.code, body.error.message, body.error.details);
  } catch {
    return new ApiError(res.status, 'UNKNOWN', `Unexpected server response (${res.status}).`);
  }
}

/**
 * Exchange the stored refresh token for new tokens. Concurrent callers share one attempt.
 * Resolves false when there's no session or the server can't be reached; a definitive 401
 * also clears the stored token so the app signs out.
 */
export function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const refreshToken = await tokens.getRefresh();
      if (!refreshToken) return false;
      const res = await send('/auth/refresh', {
        method: 'POST',
        body: { refreshToken },
        auth: false,
      });
      if (!res.ok) {
        // Only a definitive rejection ends the session; network trouble keeps the token.
        if (res.status === 401) await tokens.clear();
        return false;
      }
      const body = (await res.json()) as { data: AuthTokensDto };
      await tokens.set(body.data);
      return true;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function sendWithRefresh(path: string, opts: RequestOptions): Promise<Response> {
  let res = await send(path, opts);
  if (res.status === 401 && opts.auth !== false) {
    if (await refreshSession()) {
      res = await send(path, opts);
    } else if (!(await tokens.getRefresh())) {
      onSessionExpired?.();
    }
  }
  return res;
}

/** Perform a request and return the full envelope `{ data, meta? }`. */
export async function requestEnvelope<T>(
  path: string,
  opts: RequestOptions = {},
): Promise<{ data: T; meta?: { nextCursor?: string | null } }> {
  const res = await sendWithRefresh(path, opts);
  if (!res.ok) {
    const err = await toApiError(res);
    // Only end an existing session; a disabled account at sign-in is just a login error.
    if (err.code === 'ACCOUNT_DISABLED' && opts.auth !== false) onSessionExpired?.();
    throw err;
  }
  if (res.status === 204) return { data: undefined as T };
  return (await res.json()) as { data: T; meta?: { nextCursor?: string | null } };
}

/** Perform a request and return `data`. */
export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  return (await requestEnvelope<T>(path, opts)).data;
}

/** Download a text response (CSV export). */
export async function apiText(path: string, query?: Query): Promise<string> {
  const res = await sendWithRefresh(path, { query, timeoutMs: 30_000 });
  if (!res.ok) throw await toApiError(res);
  return res.text();
}
