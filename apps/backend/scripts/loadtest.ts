/**
 * Classroom load test: N students check in within a window while the teacher's screen polls
 * the roster every 3 s and refreshes the QR code, as the mobile app does.
 *
 *   npm run loadtest -w @kavriel/backend                  # self-contained (throwaway PostgreSQL)
 *   STUDENTS=120 WINDOW_SECONDS=30 npm run loadtest -w @kavriel/backend
 *   LOADTEST_URL=https://staging.example/api/v1 TEACHER_SIGNUP_CODE=… npm run loadtest -w @kavriel/backend
 *
 * Self-contained mode starts the real API over HTTP with rate limiting disabled, so the numbers
 * measure capacity, not throttling. Against a remote URL, that server must also have
 * RATE_LIMIT_ENABLED=false (use a staging deployment, never production).
 *
 * Exits non-zero if any check-in fails, the recorded count is wrong, or p95 exceeds P95_BUDGET_MS.
 */
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { connectionUrl, ensureDatabase, startCluster } from './embedded-pg';

const STUDENTS = Number(process.env.STUDENTS ?? 60);
const WINDOW_SECONDS = Number(process.env.WINDOW_SECONDS ?? 30);
const POLL_MS = 3_000;
const QR_REFRESH_MS = 5_000;
const P95_BUDGET_MS = Number(process.env.P95_BUDGET_MS ?? 500);
const PASSWORD = 'loadtest-password-1';

// ───────────── Tiny HTTP client with timing ─────────────

interface Timed {
  status: number;
  ms: number;
  body: { data?: unknown; error?: { code: string; message: string } };
}

let API = '';

async function call(method: string, path: string, token?: string, body?: unknown): Promise<Timed> {
  const started = performance.now();
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const ms = performance.now() - started;
  return { status: res.status, ms, body: text ? JSON.parse(text) : {} };
}

function must<T>(r: Timed, what: string): T {
  if (r.status >= 300) throw new Error(`${what} failed: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.data as T;
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (queue.length) await fn(queue.shift()!);
    }),
  );
}

function stats(samples: number[]) {
  const s = [...samples].sort((a, b) => a - b);
  const at = (p: number) => s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] ?? 0;
  const avg = s.reduce((a, b) => a + b, 0) / (s.length || 1);
  return { n: s.length, avg, p50: at(50), p95: at(95), p99: at(99), max: s.at(-1) ?? 0 };
}

const fmt = (x: number) => `${x.toFixed(0)} ms`.padStart(8);

// ───────────── Environment ─────────────

async function startLocalApi(): Promise<{ url: string; stop: () => Promise<void> }> {
  const options = {
    dataDir: mkdtempSync(join(tmpdir(), 'kavriel-load-')),
    port: 54_000 + Math.floor(Math.random() * 1000),
    user: 'kavriel',
    password: 'kavriel',
    persistent: false,
    quiet: true,
  };
  const pg = await startCluster(options);
  await ensureDatabase(pg, 'kavriel_load');
  const dbUrl = connectionUrl(options, 'kavriel_load');

  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: dbUrl,
    DIRECT_URL: dbUrl,
    JWT_SECRET: randomUUID() + randomUUID(),
    QR_SIGNING_SECRET: randomUUID() + randomUUID(),
    TEACHER_SIGNUP_CODE: 'loadtest-code',
    RATE_LIMIT_ENABLED: 'false',
    SEED_DEMO: 'false',
  });
  const cwd = new URL('..', import.meta.url);
  execSync('npx prisma migrate deploy', { cwd, stdio: 'pipe', env: process.env });
  execSync('npx prisma db seed', { cwd, stdio: 'pipe', env: process.env });

  // Import after the environment is set: config/env.ts validates at import time.
  const { createApp } = await import('../src/app');
  const { prisma } = await import('../src/config/database');
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}/api/v1`,
    stop: async () => {
      await new Promise((resolve) => server.close(resolve));
      await prisma.$disconnect();
      await pg.stop();
    },
  };
}

// ───────────── Scenario ─────────────

async function main() {
  const remote = process.env.LOADTEST_URL;
  const local = remote ? null : await startLocalApi();
  API = (remote ?? local!.url).replace(/\/$/, '');
  const teacherCode = process.env.TEACHER_SIGNUP_CODE ?? '';
  const run = randomUUID().slice(0, 8);

  try {
    console.log(`Target: ${API}`);
    console.log(`Setting up 1 teacher, ${STUDENTS} students…`);

    const teacher = must<{ accessToken: string }>(
      await call('POST', '/auth/register', undefined, {
        role: 'TEACHER',
        email: `load-teacher-${run}@test.local`,
        password: PASSWORD,
        firstName: 'Load',
        lastName: 'Teacher',
        teacherCode,
      }),
      'register teacher',
    ).accessToken;

    const semesters = must<{ id: number }[]>(
      await call('GET', '/reference/semesters', teacher),
      'semesters',
    );
    const subject = must<{ id: string }>(
      await call('POST', '/subjects', teacher, {
        subjectCode: `LOAD-${run}`,
        subjectName: 'Load Test',
      }),
      'subject',
    );
    const cls = must<{ id: string }>(
      await call('POST', '/classes', teacher, {
        subjectId: subject.id,
        semesterId: semesters[0]!.id,
        sectionName: 'Load',
        classCode: `LOAD-${run}`,
      }),
      'class',
    );

    const students: { token: string }[] = [];
    await pool(
      Array.from({ length: STUDENTS }, (_, i) => i),
      8,
      async (i) => {
        const studentNumber = `L${run}-${String(i).padStart(4, '0')}`;
        const s = must<{ accessToken: string }>(
          await call('POST', '/auth/register', undefined, {
            role: 'STUDENT',
            email: `load-${run}-${i}@test.local`,
            password: PASSWORD,
            firstName: 'Student',
            lastName: `N${i}`,
            studentNumber,
          }),
          'register student',
        );
        must(
          await call('POST', `/classes/${cls.id}/students`, teacher, { studentNumber }),
          'enroll',
        );
        students.push({ token: s.accessToken });
      },
    );

    const session = must<{ id: string }>(
      await call('POST', '/attendance/sessions', teacher, {
        classId: cls.id,
        qrRotationSeconds: 15,
      }),
      'start session',
    );

    // Teacher screen: QR refresh + roster polling, running for the whole window.
    const qrLatency: number[] = [];
    const pollLatency: number[] = [];
    let qrToken = must<{ token: string }>(
      await call('GET', `/attendance/sessions/${session.id}/qr`, teacher),
      'qr',
    ).token;
    let cursor: string | undefined;
    let teacherErrors = 0;
    let running = true;

    const qrLoop = (async () => {
      while (running) {
        await new Promise((r) => setTimeout(r, QR_REFRESH_MS));
        const r = await call('GET', `/attendance/sessions/${session.id}/qr`, teacher);
        qrLatency.push(r.ms);
        if (r.status === 200) qrToken = (r.body.data as { token: string }).token;
        else teacherErrors += 1;
      }
    })();
    const pollLoop = (async () => {
      while (running) {
        const q = cursor ? `?since=${encodeURIComponent(cursor)}` : '';
        const r = await call('GET', `/attendance/sessions/${session.id}/records${q}`, teacher);
        pollLatency.push(r.ms);
        if (r.status === 200) cursor = (r.body.data as { serverTime: string }).serverTime;
        else teacherErrors += 1;
        await new Promise((res) => setTimeout(res, POLL_MS));
      }
    })();

    // Students: each scans once at a random moment in the window, using the QR currently shown.
    console.log(
      `Load: ${STUDENTS} check-ins over ${WINDOW_SECONDS}s + teacher polling every ${POLL_MS / 1000}s…`,
    );
    const checkInLatency: number[] = [];
    const failures: string[] = [];
    const startedAt = performance.now();
    await Promise.all(
      students.map(async (s) => {
        await new Promise((r) => setTimeout(r, Math.random() * WINDOW_SECONDS * 1000));
        const r = await call('POST', '/attendance/check-in', s.token, {
          qrToken,
          clientRequestId: randomUUID(),
        });
        checkInLatency.push(r.ms);
        if (r.status !== 201) failures.push(`${r.status} ${r.body.error?.code ?? ''}`);
      }),
    );
    const elapsed = (performance.now() - startedAt) / 1000;
    running = false;
    await Promise.all([qrLoop, pollLoop]);

    // Verify: exactly one PRESENT/LATE record per student.
    const final = must<{ counts: Record<string, number> }>(
      await call('GET', `/attendance/sessions/${session.id}/records`, teacher),
      'final records',
    );
    const recorded = (final.counts.PRESENT ?? 0) + (final.counts.LATE ?? 0);

    // Report
    const rows = [
      ['check-in', stats(checkInLatency)],
      ['roster poll', stats(pollLatency)],
      ['qr refresh', stats(qrLatency)],
    ] as const;
    console.log('');
    console.log(`Completed in ${elapsed.toFixed(1)}s`);
    console.log('endpoint        n      avg      p50      p95      p99      max');
    for (const [name, s] of rows) {
      console.log(
        `${name.padEnd(12)} ${String(s.n).padStart(4)} ${fmt(s.avg)} ${fmt(s.p50)} ${fmt(s.p95)} ${fmt(s.p99)} ${fmt(s.max)}`,
      );
    }
    console.log('');
    console.log(
      `Recorded: ${recorded}/${STUDENTS}  check-in failures: ${failures.length}  teacher errors: ${teacherErrors}`,
    );

    const problems: string[] = [];
    if (failures.length) problems.push(`check-in failures: ${[...new Set(failures)].join(', ')}`);
    if (recorded !== STUDENTS) problems.push(`recorded ${recorded}, expected ${STUDENTS}`);
    if (teacherErrors) problems.push(`${teacherErrors} teacher request errors`);
    const p95 = stats(checkInLatency).p95;
    if (p95 > P95_BUDGET_MS)
      problems.push(`check-in p95 ${p95.toFixed(0)} ms > budget ${P95_BUDGET_MS} ms`);

    if (problems.length) {
      console.error(`FAIL: ${problems.join('; ')}`);
      process.exitCode = 1;
    } else {
      console.log(
        `PASS: all check-ins recorded once; check-in p95 ${p95.toFixed(0)} ms ≤ ${P95_BUDGET_MS} ms`,
      );
    }
  } finally {
    await local?.stop();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
