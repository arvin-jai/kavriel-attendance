/**
 * Rate limits with limiting ENABLED. Every Supertest request comes from the same IP, which is
 * exactly the school-Wi-Fi case: a whole class shares one public address.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

type Support = typeof import('../support/api');
let s: Support;

beforeAll(async () => {
  // env.ts validates at import time: enable limiting, then load a fresh module graph.
  vi.stubEnv('RATE_LIMIT_ENABLED', 'true');
  vi.resetModules();
  s = await import('../support/api');
  await s.resetDb();
});

describe('rate limits on a shared school IP', () => {
  it('lets a large class register and check in from one IP; limits each student individually', async () => {
    const teacher = await s.registerTeacher();
    const students = [];
    for (let i = 0; i < 70; i++) students.push(await s.registerStudent());
    const { classId } = await s.classWithStudents(teacher, students);
    const { qrToken } = await s.startSession(teacher, classId);

    const results = await Promise.all(
      students.map((st) => s.as(st.token).post('/attendance/check-in', { qrToken })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(70);

    // One student hammering the endpoint is throttled (10 per minute per user).
    const spammer = students[0]!;
    const repeats = [];
    for (let i = 0; i < 10; i++) {
      repeats.push((await s.as(spammer.token).post('/attendance/check-in', { qrToken })).status);
    }
    expect(repeats.slice(0, 9).every((code) => code === 200)).toBe(true);
    expect(repeats[9]).toBe(429);
    // ...without affecting classmates on the same IP.
    expect((await s.as(students[1]!.token).post('/attendance/check-in', { qrToken })).status).toBe(
      200,
    );
  }, 120_000);

  it('limits password guessing per account, not per IP', async () => {
    const victim = 'victim@test.local';
    await s.registerStudent({ email: victim });
    const attempt = (email: string) =>
      s.as('').post('/auth/login', { email, password: 'wrong-password' });

    const codes = [];
    for (let i = 0; i < 11; i++) codes.push((await attempt(victim)).status);
    expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true);
    expect(codes[10]).toBe(429);

    // A classmate on the same Wi-Fi can still sign in.
    const classmate = await s.registerStudent({ email: 'classmate@test.local' });
    expect(classmate.token).toBeTruthy();
    expect((await attempt('classmate@test.local')).status).toBe(401);
  });
});
