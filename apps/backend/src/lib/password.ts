import argon2 from 'argon2';

// OWASP-recommended Argon2id parameters (19 MiB, 2 iterations, 1 lane).
const OPTIONS = {
  type: argon2.argon2id as 0 | 1 | 2,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

/**
 * Hash of a random password, verified against when the email doesn't exist so that
 * login timing doesn't reveal which emails are registered.
 */
let dummyHash: Promise<string> | undefined;
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(`dummy-${Math.random()}`);
  return dummyHash;
}
