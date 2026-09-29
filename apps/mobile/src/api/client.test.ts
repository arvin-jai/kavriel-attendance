/**
 * API client: token refresh, session expiry and error normalization.
 * `fetch` and secure storage are replaced with in-memory fakes.
 */
const mockStore = new Map<string, string>();
jest.mock('./tokenStore', () => ({
  storage: {
    get: async (k: string) => mockStore.get(k) ?? null,
    set: async (k: string, v: string) => void mockStore.set(k, v),
    remove: async (k: string) => void mockStore.delete(k),
  },
}));

import { api, ApiError, setSessionExpiredHandler, tokens } from './client';

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const expired = () =>
  json(401, { error: { code: 'TOKEN_EXPIRED', message: 'Access token expired' } });

let handler: Handler;
const fetchMock = jest.fn((url: string, init: RequestInit) => handler(url, init));

beforeEach(async () => {
  mockStore.clear();
  fetchMock.mockClear();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  await tokens.set({ accessToken: 'old-access', refreshToken: 'refresh-1', expiresIn: 900 });
});

const authHeader = (init: RequestInit) => (init.headers as Record<string, string>).Authorization;

describe('api client', () => {
  it('unwraps { data } and sends the bearer token', async () => {
    handler = () => json(200, { data: { ok: true } });
    await expect(api('/auth/me')).resolves.toEqual({ ok: true });
    expect(authHeader(fetchMock.mock.calls[0]![1])).toBe('Bearer old-access');
  });

  it('refreshes once on an expired token and retries with the new one', async () => {
    handler = (url, init) => {
      if (url.endsWith('/auth/refresh')) {
        return json(200, {
          data: { accessToken: 'new-access', refreshToken: 'refresh-2', expiresIn: 900 },
        });
      }
      return authHeader(init) === 'Bearer new-access' ? json(200, { data: 'fresh' }) : expired();
    };
    await expect(api('/classes')).resolves.toBe('fresh');
    await expect(tokens.getRefresh()).resolves.toBe('refresh-2');
  });

  it('shares one refresh between concurrent requests', async () => {
    let refreshes = 0;
    handler = async (url, init) => {
      if (url.endsWith('/auth/refresh')) {
        refreshes += 1;
        await new Promise((r) => setTimeout(r, 10));
        return json(200, {
          data: { accessToken: 'new-access', refreshToken: 'refresh-2', expiresIn: 900 },
        });
      }
      return authHeader(init) === 'Bearer new-access' ? json(200, { data: url }) : expired();
    };
    await Promise.all([api('/a'), api('/b'), api('/c')]);
    expect(refreshes).toBe(1);
  });

  it('signs out when the refresh token is rejected', async () => {
    const onExpired = jest.fn();
    setSessionExpiredHandler(onExpired);
    handler = (url) =>
      url.endsWith('/auth/refresh')
        ? json(401, { error: { code: 'INVALID_REFRESH_TOKEN', message: 'Please sign in again' } })
        : expired();

    await expect(api('/classes')).rejects.toMatchObject({ status: 401 });
    expect(onExpired).toHaveBeenCalled();
    await expect(tokens.getRefresh()).resolves.toBeNull();
  });

  it('keeps the session when the refresh endpoint is unreachable', async () => {
    const onExpired = jest.fn();
    setSessionExpiredHandler(onExpired);
    handler = (url) => {
      if (url.endsWith('/auth/refresh')) throw new TypeError('Network request failed');
      return expired();
    };
    await expect(api('/classes')).rejects.toBeInstanceOf(ApiError);
    expect(onExpired).not.toHaveBeenCalled();
    await expect(tokens.getRefresh()).resolves.toBe('refresh-1');
  });

  it('normalizes server errors, network failures and timeouts', async () => {
    handler = () => json(409, { error: { code: 'ALREADY_ENROLLED', message: 'Already enrolled' } });
    await expect(api('/x')).rejects.toMatchObject({
      status: 409,
      code: 'ALREADY_ENROLLED',
      message: 'Already enrolled',
    });

    handler = () => {
      throw new TypeError('Network request failed');
    };
    await expect(api('/x')).rejects.toMatchObject({ status: 0, code: 'NETWORK' });

    handler = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
        );
      });
    await expect(api('/slow', { timeoutMs: 20 })).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('treats a non-JSON error body as UNKNOWN', async () => {
    handler = () => new Response('<html>Bad gateway</html>', { status: 502 });
    await expect(api('/x')).rejects.toMatchObject({ status: 502, code: 'UNKNOWN' });
  });

  it('ends the session for a disabled account, but not on the sign-in request', async () => {
    const onExpired = jest.fn();
    setSessionExpiredHandler(onExpired);
    handler = () =>
      json(403, { error: { code: 'ACCOUNT_DISABLED', message: 'This account is disabled' } });

    await expect(
      api('/auth/login', { method: 'POST', body: {}, auth: false }),
    ).rejects.toMatchObject({
      code: 'ACCOUNT_DISABLED',
    });
    expect(onExpired).not.toHaveBeenCalled();

    await expect(api('/classes')).rejects.toMatchObject({ code: 'ACCOUNT_DISABLED' });
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('returns undefined for 204 No Content', async () => {
    handler = () => new Response(null, { status: 204 });
    await expect(api('/x', { method: 'DELETE' })).resolves.toBeUndefined();
  });
});
