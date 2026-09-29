# Build Plan

The as-built implementation sequence for the Kavriel MVP, with status and how each step was verified.
Design details live in [BLUEPRINT.md](BLUEPRINT.md); running and operating the system is in
[HANDOFF.md](HANDOFF.md); CI/CD is in [PIPELINE.md](PIPELINE.md).

**Legend:** ✅ done and verified · 🟡 done, needs verification on real devices/infrastructure · ⬜ not started

## Phase 1: Mobile MVP

### Foundation

| #   | Step                                                                                                                    | Status | Where                                                     | Verified by                             |
| --- | ----------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------- | --------------------------------------- |
| 1   | Project setup: npm workspaces (`apps/backend`, `apps/mobile`, `packages/shared`), TypeScript 6, ESLint 10, Prettier, CI | ✅     | root configs, `.github/workflows/ci.yml`                  | `npm run lint`, `npm run typecheck`     |
| 2   | PostgreSQL without Docker: embedded PostgreSQL 17 for dev (`npm run db`) and a throwaway cluster per test run           | ✅     | `apps/backend/scripts/`                                   | integration test run                    |
| 3   | Prisma 7 with `pg` driver adapter, `prisma.config.ts`                                                                   | ✅     | `apps/backend/prisma.config.ts`, `src/config/database.ts` | `prisma validate`, server boots         |
| 4   | Normalized schema (3NF), initial migration + hand-written partial unique / CHECK constraints, idempotent seed           | ✅     | `apps/backend/prisma/`                                    | migrate + seed twice; drift check in CI |

### Backend

| #   | Step                                                                                                                 | Status | Where                                      | Verified by                               |
| --- | -------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------ | ----------------------------------------- |
| 5   | Authentication: Argon2id, 15-min JWT, rotating hashed refresh tokens with reuse detection, teacher registration code | ✅     | `modules/auth`                             | `test/integration/auth.test.ts`           |
| 6   | RBAC + resource ownership (foreign resources → 404)                                                                  | ✅     | `middleware/role`, `policies/ownership.ts` | IDOR matrix in `security.test.ts`         |
| 7   | Express architecture: helmet, CORS, request ids, rate limits, validation wrapper, central error envelope, pino logs  | ✅     | `src/app.ts`, `src/middleware/`            | unit + integration tests                  |
| 8–9 | Teacher and student profiles (`/auth/me`, profile update, password change)                                           | ✅     | `modules/auth`                             | `auth.test.ts`                            |
| 10  | Subjects (CRUD, archive, delete-if-unused)                                                                           | ✅     | `modules/subjects`                         | flow + integrity tests                    |
| 11  | Classes (CRUD, archive, delete-if-unused; students read enrolled classes)                                            | ✅     | `modules/classes`                          | flow + IDOR tests                         |
| 12  | Enrollment by exact student number, soft drop, re-enroll                                                             | ✅     | `modules/enrollments`                      | `attendance-flow.test.ts`                 |
| 13  | Schedules: weekly slots, conflict detection (teacher/class), start-window rule, `/schedules/today`                   | ✅     | `modules/schedules`                        | `schedule-rules.test.ts`, integrity tests |
| 14  | Attendance sessions: PENDING/ACTIVE/ENDED/LOCKED, one active per class (partial unique index)                        | ✅     | `attendance/sessions.service.ts`           | concurrency test                          |
| 15  | QR generation: HMAC-SHA256 per-session key (HKDF), time windows, no PII                                              | ✅     | `modules/qr`                               | `qr.test.ts`                              |
| 16  | QR validation: signature, window + 1 grace window, future-window rejection                                           | ✅     | `modules/qr`, `checkin.service.ts`         | expiry/forgery tests                      |
| 17  | Student check-in: enrollment check, PRESENT/LATE from server time, idempotent insert, audit                          | ✅     | `attendance/checkin.service.ts`            | flow + 10-way concurrent scan test        |
| 18  | Attendance records: live roster with `since` cursor, manual mark, corrections, end → auto-ABSENT, lock               | ✅     | `attendance/records.service.ts`            | flow test                                 |
| 21  | Reports: by student / by session, CSV with formula-injection protection                                              | ✅     | `modules/reports`                          | flow test, `csv-and-stats.test.ts`        |
| 22  | Audit logging inside the same transaction as each change                                                             | ✅     | `modules/audit`                            | flow test asserts all actions             |
| 23  | Security hardening: rate limits, token tampering, role-from-DB, mass-assignment stripping                            | ✅     | middleware, services                       | `security.test.ts`                        |

### Mobile

| #   | Step                                                                                                                   | Status | Where                                         | Verified by                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------- | --------------------------------------------------------------- |
| M1  | Expo SDK 57 app, Expo Router with protected role areas, TanStack Query, secure token storage                           | ✅     | `apps/mobile/src/app/_layout.tsx`, `src/auth` | typecheck, expo-doctor 21/21, Android bundle export             |
| M2  | API client: timeouts, single-flight refresh, error normalization, device install id                                    | ✅     | `src/api/client.ts`                           | web run against local API                                       |
| M3  | Auth screens (login, register with role, teacher code, year level)                                                     | ✅     | `src/app/(auth)`                              | web run                                                         |
| M4  | Teacher: Home, subjects, classes, enrollment, schedule (day/week), start attendance                                    | ✅     | `src/app/teacher`                             | web run                                                         |
| 19  | Teacher monitoring: full-screen rotating QR, server-clock countdown, live counts, roster review/corrections, end, lock | ✅     | `teacher/session/[id]`                        | web run with simulated student check-in                         |
| M5  | Student: Home, classes, class detail, schedule, attendance history + percentages                                       | ✅     | `src/app/student`                             | web run                                                         |
| M6  | Student QR scanner with server-confirmed success, expired/invalid/not-enrolled states, reconcile after network failure | 🟡     | `student/(tabs)/scan.tsx`                     | typecheck; **needs a real phone camera test**                   |
| 20  | Attendance history (teacher paginated history, student history)                                                        | ✅     | tabs                                          | web run                                                         |
| M7  | Reports screen + CSV share                                                                                             | 🟡     | `teacher/reports.tsx`                         | report on web verified; **CSV share sheet needs a device test** |

### Delivery

| #   | Step                                                                                                                      | Status | Notes                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 24  | Automated tests: 25 unit + 32 integration (full E2E flow over HTTP + PostgreSQL, security matrix)                         | ✅     | `npm test`                                                                                                                                        |
| 24b | Mobile unit tests (jest-expo): check-in outcomes, QR token decoding, API client refresh/expiry/errors, rotating-QR timing | ✅     | `npm test -w @kavriel/mobile` (26 tests, runs in CI)                                                                                              |
| 24c | Load test: N students check in over a window while the teacher polls and refreshes the QR; verifies exactly-once          | ✅     | `npm run loadtest -w @kavriel/backend`. Local, warm: 60 in 30 s → p95 62 ms; 200 in 10 s → p95 41 ms. Re-run against staging with `LOADTEST_URL`. |
| 24d | Maestro device flows (teacher login → start → QR; student scan)                                                           | ⬜     | Needs an emulator or device                                                                                                                       |
| 25  | Free deployment: Render (API) + Neon (Postgres), secrets, first `migrate deploy`, EAS preview APK                         | ⬜     | Config is ready (`render.yaml`, `eas.json`); provisioning needs the owner's accounts. Re-verify free-tier terms first.                            |
| 25b | Classroom pilot: 2+ phones, projector/phone QR at 3–4 m, cold start timing                                                | ⬜     | Record results in HANDOFF.md                                                                                                                      |

## Definition of Done (MVP) checklist

- [x] Teacher can register (with code), log in, create subject and class, enroll students, create schedule
- [x] Teacher can start attendance, display the rotating QR, monitor live, correct, end and lock
- [x] Teacher can view history and a basic report, and export CSV
- [x] Student can register, log in, view classes and schedule, check in, get confirmation, view history
- [x] Backend authenticates, enforces RBAC and ownership, validates QR and enrollment, prevents duplicates, audits
- [x] Database normalized with FKs, unique constraints, indexes, restrictive deletes, preserved history
- [ ] Deployed on free-tier infrastructure over HTTPS with production migrations (step 25)
- [ ] Verified on physical Android devices in a classroom-like setting (step 25b)

## Phase 2: Security & Reliability (next)

1. Device binding (per-student device keypair, rebind flow) + Play Integrity.
2. SSE for live roster (replace 3-s polling), Sentry error tracking.
3. Suspicious-pattern flags in the roster (one device/IP → several students) using the audit metadata already recorded.
4. Scheduled auto-end of stale ACTIVE sessions; retention/purge job for audit logs and refresh tokens.
5. Mobile component tests + Maestro E2E in CI; k6 in a nightly job against staging.
6. Shared rate-limit store (Postgres) if the API runs more than one instance.

## Phase 3: School Admin Web

Next.js + Tailwind app in `apps/admin-web`, same API. Add a `SCHOOL_ADMIN` role row, `/api/v1/admin/*` routes,
institution subjects (`ownerTeacherId = NULL`), teacher/student management, class reassignment, unlock
sessions, school-wide reports. The ownership policy module is the single place that grants admin scope.

## Phase 4: Advanced

Proximity checks (geofence/BLE/Wi-Fi), offline attendance with signed server-reconciled records, parent
portal, push notifications, multi-school tenancy (`School` + `schoolId` via expand/contract migrations),
LMS integration, analytics.
