const mockStore = new Map<string, string>();
jest.mock('@/api/tokenStore', () => ({
  storage: {
    get: async (k: string) => {
      await new Promise((r) => setTimeout(r, 5)); // slow keystore read
      return mockStore.get(k) ?? null;
    },
    set: async (k: string, v: string) => void mockStore.set(k, v),
    remove: async (k: string) => void mockStore.delete(k),
  },
}));

let mockUuidCount = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++mockUuidCount}` }));

/** A fresh copy of the module, as after an app restart. */
function freshDeviceId(): typeof import('./deviceId').deviceInstallId {
  let fn!: typeof import('./deviceId').deviceInstallId;
  jest.isolateModules(() => {
    // isolateModules needs a synchronous load; dynamic import() isn't available under Jest here.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    fn = (require('./deviceId') as typeof import('./deviceId')).deviceInstallId;
  });
  return fn;
}

describe('deviceInstallId', () => {
  beforeEach(() => {
    mockStore.clear();
    mockUuidCount = 0;
  });

  it('returns one id to concurrent first callers and persists it', async () => {
    const deviceInstallId = freshDeviceId();
    const ids = await Promise.all([deviceInstallId(), deviceInstallId(), deviceInstallId()]);
    expect(new Set(ids).size).toBe(1);
    expect(mockStore.get('kavriel.deviceInstallId')).toBe(ids[0]);
    expect(mockUuidCount).toBe(1);
  });

  it('reuses a stored id after an app restart', async () => {
    mockStore.set('kavriel.deviceInstallId', 'existing-id');
    await expect(freshDeviceId()()).resolves.toBe('existing-id');
    expect(mockUuidCount).toBe(0);
  });
});
