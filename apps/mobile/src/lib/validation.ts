import type { z } from 'zod';

/**
 * Validate form values with a shared schema (the same one the API uses).
 * Returns parsed data, or field → message errors for the first issue on each field.
 */
export function validate<S extends z.ZodType>(
  schema: S,
  values: unknown,
): { ok: true; data: z.output<S> } | { ok: false; errors: Record<string, string> } {
  const result = schema.safeParse(values);
  if (result.success) return { ok: true, data: result.data };
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.');
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return { ok: false, errors };
}

/** Empty strings from text inputs become undefined so optional fields validate. */
export function blankToUndefined<T extends Record<string, unknown>>(values: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values))
    out[k] = typeof v === 'string' && v.trim() === '' ? undefined : v;
  return out as T;
}
