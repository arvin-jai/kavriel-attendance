/** Web (dev only): SecureStore isn't available in browsers, so fall back to localStorage. */
export const storage = {
  get: async (key: string) => {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  set: async (key: string, value: string) => {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // storage unavailable (private mode); stay signed in for this tab only
    }
  },
  remove: async (key: string) => {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // ignore
    }
  },
};
