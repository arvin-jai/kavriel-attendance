# Handoff

Everything a developer (or the next session) needs to pick this project up.

- **Design:** [BLUEPRINT.md](BLUEPRINT.md)
- **Status and next steps:** [BUILDPLAN.md](BUILDPLAN.md)
- **CI/CD:** [PIPELINE.md](PIPELINE.md)

## 1. Current state (2026-09-29)

- **Backend:** MVP feature-complete. 25 unit + 32 integration tests pass, including the full teacher/student
  flow over HTTP + PostgreSQL and the security matrix (IDOR, QR expiry/replay/forgery, concurrent duplicate
  scans, token tampering, integrity rules).
- **Mobile:** MVP feature-complete. Typecheck and lint are clean, `expo-doctor` passes 21/21 and the
  Android JS bundle builds. The teacher and student flows were exercised on web against the local API:
  - login
  - ad-hoc session start
  - rotating QR with live count update
  - manual correction with remarks
  - end (auto-absent), lock
  - reports
  - student home and schedule
- **Not yet done:**
  - real-device testing of the camera scanner and CSV share sheet
  - mobile component/E2E tests
  - load test
  - provisioning Render/Neon/EAS

  See BUILDPLAN "Delivery".

## 2. Repository map

```
apps/backend/                 Express 5 + Prisma 7 API
  prisma/schema.prisma        3NF schema (authoritative)
  prisma/migrations/          initial migration incl. hand-written partial unique + CHECKs
  prisma/seed.ts              reference data (+ demo data outside production)
  prisma.config.ts            Prisma 7 config (DB URL, seed command)
  scripts/db.ts               embedded PostgreSQL: npm run db / db:stop / db:reset
  src/app.ts, routes.ts       app factory, /api/v1 route table
  src/middleware/             auth, role, validation (typed `authed()` wrapper), errors, rate limits
  src/policies/ownership.ts   every "is this yours?" check (404 for foreign resources)
  src/modules/<feature>/      routes + service per feature (auth, subjects, classes, enrollments,
                              schedules, attendance, qr, reports, audit, reference)
  test/unit, test/integration Vitest (integration starts its own Postgres)
apps/mobile/                  Expo SDK 57 app (Android first, iOS-compatible)
  src/app/                    Expo Router routes: (auth), teacher/*, student/*
  src/api/                    fetch client, typed endpoints, error messages
  src/auth/AuthProvider.tsx   session restore, login/register/logout, role
  src/features/attendance/    useRotatingQr, useLiveRecords, QR token helper, keep-awake
  src/components/             UI kit, QueryView states, scanner, QR display, schedule views
packages/shared/              enums, zod request schemas, response DTOs, QR format (used by both apps)
docs/                         BLUEPRINT, BUILDPLAN, HANDOFF, PIPELINE
```

## 3. Run it locally (Windows, macOS, Linux; no Docker)

Prerequisites: Node 22.12+ (`.nvmrc`), npm 10+. For a phone, install Expo Go, or use an Android emulator.

```bash
npm install                                    # all workspaces; also generates the Prisma client
cp apps/backend/.env.example apps/backend/.env # then fill JWT_SECRET, QR_SIGNING_SECRET, TEACHER_SIGNUP_CODE
npm run db                                     # terminal 1: PostgreSQL 17 on localhost:5433
npm run prisma:migrate -w @kavriel/backend     # first time: apply migrations
npm run seed -w @kavriel/backend               # reference + demo data
npm run dev:backend                            # terminal 2: API on http://localhost:4000
npm run dev:mobile                             # terminal 3: Expo (press a for Android, w for web)
```

Generate secrets with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.

- **Demo accounts** (development seed only; password `password123`):
  - `teacher@kavriel.test` owns MATH101 / class MATH101-A, which meets Mon/Wed/Fri 09:00–10:30.
  - `student1@kavriel.test`, `student2@kavriel.test` and `student3@kavriel.test` are enrolled in MATH101-A.
- **Phone on Wi-Fi:** set `EXPO_PUBLIC_API_URL=http://<PC-LAN-IP>:4000/api/v1` in `apps/mobile/.env`.
  The Android emulator uses `http://10.0.2.2:4000/api/v1`.
- **Web preview:** add the web origin to `CORS_ORIGIN` in `apps/backend/.env`
  (e.g. `http://localhost:8081`). The camera scanner is meant for phones.
- **Stopping the database:** press Ctrl+C in the DB terminal. If the window was closed instead, run `npm run db:stop`.

### Tests

```bash
npm test                                           # all workspaces (backend: unit + integration)
npm run test:unit -w @kavriel/backend
npm run test:integration -w @kavriel/backend       # starts a throwaway Postgres; or set TEST_DATABASE_URL
```

## 4. Key decisions (and why)

| Decision                                                               | Why                                                                                                     |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Stateless HMAC QR tokens, 15 s windows + 1 grace window                | No per-token storage, forged/moved/old tokens rejected, a shared screenshot is useless after about 30 s |
| Identity from JWT, session from signed token, status from server clock | The client supplies nothing trusted; request bodies are validated and unknown keys stripped             |
| `UNIQUE(sessionId, studentId)` + catch-and-return                      | Double taps and retries give exactly one row and a consistent "already recorded"                        |
| Foreign resources return 404                                           | Doesn't reveal other teachers' data exists                                                              |
| Restrictive FKs, soft drop, archive instead of delete                  | Historical attendance can't be deleted by accident                                                      |
| Polling with a `since` cursor (3 s)                                    | Works on free hosting and through mobile networks; SSE is Phase 2                                       |
| Teacher registration code                                              | No admin exists yet to vet teacher accounts                                                             |
| Embedded PostgreSQL                                                    | Requirement: no Docker; same Postgres major as production                                               |
| React pinned via root `overrides`                                      | `prisma` pulls Prisma Studio (React 19.3); the app needs Expo's React 19.2.3 and exactly one copy       |

## 5. Known limitations and risks

- **A QR code can't prove physical presence.** A student in the room can forward the live code to a friend
  within its ~30 s lifetime. Mitigations are Phase 2/4 (device binding, proximity). The audit log already
  records the device install id and IP per check-in, so this can be detected.
- **Student-number squatting:** anyone can register with any unused student number. Teachers confirm the
  name before enrolling. Phase 3 admin import/verification fixes this properly.
- **In-memory rate limiter:** correct for one API instance only.
- **Free-tier cold starts:** Render sleeps after ~15 min idle (~30–60 s wake). The app pings `/health`
  on launch and shows "server is waking up" on timeouts; the keep-warm workflow covers school hours.
  **Re-verify Render/Neon free-tier terms before provisioning**; they change often.
- **Deprecation warning:** a `pg` "client.query() when already executing" warning comes from inside
  `@prisma/adapter-pg` in transactions. It's harmless now; revisit when upgrading to `pg@9`.
- **Web is for development only:** SecureStore falls back to `localStorage`, and `window.confirm` is used for dialogs.
- **Unaddressed `npm audit` findings:** they're in transitive dependencies of the toolchain. Review them
  during Phase 2 hardening.

## 6. Operations

### First production deploy

1. **Neon:** create a project in `ap-southeast-1`. Copy the pooled and direct connection strings.
2. **Render:** create a service from the Blueprint (`render.yaml`), then set `DATABASE_URL`, `DIRECT_URL`
   and `TEACHER_SIGNUP_CODE`. Deploy; migrations run on start.
3. **Seed reference data once:**
   `DIRECT_URL=… NODE_ENV=production npm run seed -w @kavriel/backend`. In production only roles, year
   levels and semesters are seeded, with no demo accounts.
4. **Check the deploy:** `GET https://<service>.onrender.com/health/ready` should return
   `{"status":"ok","database":"ok"}`.
5. **Mobile:** run `npx eas-cli init` in `apps/mobile`, set the API URL in `eas.json`, then build the
   `preview` profile.
6. **GitHub:** set `API_HEALTH_URL` (variable), plus `DIRECT_URL`, `AGE_PUBLIC_KEY` and `EXPO_TOKEN` (secrets).

### Backup and restore

- Backups run nightly: they are encrypted artifacts on the **Nightly database backup** workflow, kept 30 days.
- **Restore:**
  1. `age -d -i key.txt kavriel-<stamp>.dump.age > kavriel.dump`
  2. `pg_restore --no-owner --clean --if-exists -d "<target DIRECT_URL>" kavriel.dump`
- Restore into a Neon **branch** first, verify, then repoint the app.
- Practise a restore monthly.

### Secret rotation

- **`JWT_SECRET`:** everyone must sign in again.
- **`QR_SIGNING_SECRET`:** active QR codes stop working until the next refresh (≤ 15 s).
- **`TEACHER_SIGNUP_CODE`:** affects new teacher registrations only.

## 7. Privacy (RA 10173)

- **What's in place:**
  - data minimization (name, school number, email, optional contact and year level; no photos or GPS)
  - a notice on the registration screen
  - RBAC and ownership, TLS
  - hashed passwords and tokens
  - encrypted backups
  - an audit trail
  - no hard deletes of history
- **Still needed, with the school's DPO/legal team (no compliance is claimed):**
  - lawful basis
  - consent for minors
  - NPC registration
  - cross-border hosting (Singapore)
  - retention periods
  - the breach process
  - privacy notice text
  - the erasure/anonymization procedure (BLUEPRINT §38)

## 8. Suggested next tasks (in order)

1. Test the scanner and CSV share on two physical Android phones (preview APK, local or Render API).
2. Provision Neon + Render + EAS (PIPELINE §2, §4) and run the classroom pilot; record cold-start timings here.
3. Add jest-expo tests for `useRotatingQr`, the scan state machine and `api/client.ts` refresh, then Maestro flows.
4. Add a k6 script for 60 check-ins in 30 s plus teacher polling.
5. Start Phase 2 (BUILDPLAN).
