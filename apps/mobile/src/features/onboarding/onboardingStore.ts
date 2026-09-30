import { storage } from '@/api/tokenStore';

// One flag per user per install: a new account, or an existing account on a fresh install,
// sees the walkthrough once.
const key = (userId: string) => `kavriel.onboarded.${userId}`;

export async function hasCompletedOnboarding(userId: string): Promise<boolean> {
  try {
    return (await storage.get(key(userId))) === '1';
  } catch {
    return true; // storage unavailable: don't trap the user in a walkthrough they can't dismiss
  }
}

export async function markOnboardingCompleted(userId: string): Promise<void> {
  try {
    await storage.set(key(userId), '1');
  } catch {
    // best effort
  }
}
