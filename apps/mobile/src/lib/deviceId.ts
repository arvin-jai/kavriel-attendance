import * as Crypto from 'expo-crypto';

import { storage } from '@/api/tokenStore';

const KEY = 'kavriel.deviceInstallId';
let cached: string | null = null;

/**
 * Random per-install id sent with check-ins (audit only; not a hardware identifier).
 * Lets teachers spot many students checking in from one phone.
 */
export async function deviceInstallId(): Promise<string> {
  if (cached) return cached;
  cached = (await storage.get(KEY)) ?? null;
  if (!cached) {
    cached = Crypto.randomUUID();
    await storage.set(KEY, cached);
  }
  return cached;
}
