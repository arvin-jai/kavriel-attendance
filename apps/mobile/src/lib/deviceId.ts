import * as Crypto from 'expo-crypto';

import { storage } from '@/api/tokenStore';

const KEY = 'kavriel.deviceInstallId';
let pending: Promise<string> | null = null;

/**
 * Random per-install id sent with check-ins (audit only; not a hardware identifier).
 * Lets teachers spot many students checking in from one phone. Concurrent first calls share
 * one lookup, so the app never reports two different ids.
 */
export function deviceInstallId(): Promise<string> {
  pending ??= (async () => {
    const existing = await storage.get(KEY);
    if (existing) return existing;
    const id = Crypto.randomUUID();
    await storage.set(KEY, id);
    return id;
  })().catch((err) => {
    pending = null; // storage failed; try again next time
    throw err;
  });
  return pending;
}
