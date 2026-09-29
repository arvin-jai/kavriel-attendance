/** Public build-time config (EXPO_PUBLIC_* is inlined by Metro). No secrets live in the app. */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1').replace(
  /\/$/,
  '',
);

/** Origin of the API (for the /health warm-up ping). */
export const API_ORIGIN = API_URL.replace(/\/api\/v\d+$/, '');

export const SCHOOL_TIMEZONE = process.env.EXPO_PUBLIC_SCHOOL_TIMEZONE ?? 'Asia/Manila';
