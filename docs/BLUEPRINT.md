# Kavriel QR Attendance — MVP Blueprint (Teacher + Student Mobile, Express + Prisma + PostgreSQL)

> **Status:** Implemented in this repository (`kavriel-attendance`). This document is the design
> reference; see [BUILDPLAN.md](BUILDPLAN.md) for what is done, [HANDOFF.md](HANDOFF.md) for how to
> run and operate it, and [PIPELINE.md](PIPELINE.md) for CI/CD. Where the implementation refined
> the plan, the **"As built"** notes below win over later sections.

## 0. Context

Kavriel replaces paper attendance with QR attendance for schools. The MVP is **mobile-only** with two
roles, **TEACHER** and **STUDENT**. A School Admin web app (Next.js) is Phase 3 and will reuse the same
Express API and PostgreSQL database.

- The backend is a **portable Express + TypeScript + Prisma + PostgreSQL REST API** (no NestJS, no
  provider SDKs), so the future admin web can reuse it unchanged.
- Attendance favours **correctness over offline**: a check-in counts only when the server records it.
- An earlier Supabase-based prototype (`C:\Workspace\kavriel`) informed the UI; this is a fresh project
  on the new architecture.

### As built (differences from the original plan)

| Topic         | Plan                                       | As built                                                                                                                                       |
| ------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Repo          | Restructure the prototype in place         | Fresh repo `kavriel-attendance` (npm workspaces)                                                                                               |
| Prisma        | Prisma 6-style `url`/`directUrl` in schema | **Prisma 7**: URL in `apps/backend/prisma.config.ts`, runtime uses `@prisma/adapter-pg`; client generated to `src/generated/prisma`            |
| Mobile        | Expo SDK 52 app                            | **Expo SDK 57** (React Native 0.86, React 19.2), routes in `src/app`, role areas at `/teacher/*` and `/student/*` guarded by `Stack.Protected` |
| Local DB      | Docker Postgres                            | **Embedded PostgreSQL 17** from npm (`npm run db`); CI uses a Postgres 17 service container                                                    |
| Tooling       | TS 5.x, ESLint 9, Vitest 4                 | TypeScript 6.0, ESLint 10, Vitest 5, zod 4, Express 5                                                                                          |
| Sessions      | `ACTIVE/ENDED/LOCKED`                      | Adds `PENDING` (create without starting); `DELETE` allowed only for PENDING                                                                    |
| Subject codes | Globally unique                            | Unique **per owning teacher** (plus a partial unique index for Phase 3 institution subjects)                                                   |
| Academic year | `ClassSection.academicYearId`              | Derived via `Semester → AcademicYear` (3NF; avoids a transitive dependency)                                                                    |

### Key decisions at a glance

| Area            | Decision                                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repo            | npm workspaces monorepo: `apps/mobile`, `apps/backend`, `packages/shared` (zod schemas + DTO types). `apps/admin-web` added in Phase 3                              |
| Mobile          | One Expo app for both roles, role-based Expo Router groups (Expo Router _is_ React Navigation underneath)                                                           |
| IDs             | UUID primary keys for business entities (no enumerable IDs, which helps against IDOR); small int PKs for seeded lookup tables                                       |
| Auth            | Argon2id password hashes, 15-min JWT access token, rotating opaque refresh token (hashed in DB, reuse detection), `expo-secure-store` on device                     |
| Teacher sign-up | Needs a **teacher registration code** (env `TEACHER_SIGNUP_CODE`) because there is no admin yet to vet teachers                                                     |
| QR tokens       | **Stateless HMAC-signed, time-windowed tokens**: no QRToken table in MVP                                                                                            |
| QR rotation     | 15 s by default (configurable 10–60 s per session), plus 1 previous window of grace                                                                                 |
| Duplicates      | `UNIQUE(sessionId, studentId)` + idempotent check-in (a repeat scan returns the existing record)                                                                    |
| Real-time       | Polling every 3 s on the teacher's live screen, using a `since` cursor. SSE in Phase 2                                                                              |
| Offline         | No offline check-in in MVP. The server response is the only source of truth                                                                                         |
| Hosting         | Render free web service (Express) + Neon free Postgres, both in Singapore region. **Re-verify tiers before provisioning** (§53)                                     |
| Tests           | Vitest + Supertest (API), embedded PostgreSQL 17 (npm `embedded-postgres`, no Docker) for dev and integration tests, Maestro for mobile E2E, k6 for check-in bursts |

---

# PART A — PRODUCT

## 1. Product overview

Kavriel replaces paper roll calls with QR-based attendance. A teacher starts a session for a class and shows a **rotating QR code** on their phone. Enrolled students scan it with the Kavriel app. The backend authenticates the student, validates the token, checks enrollment and session state, and records attendance **exactly once**. Teachers watch attendance arrive live, correct it, end and lock the session, and export CSV reports.

## 2. Goals

1. Take attendance for a 50-student class in **under 2 minutes**.
2. **Zero false confirmations**: a student never sees "recorded" unless the DB committed the row.
3. Make proxy attendance **materially harder** than paper (rotating tokens, authenticated scans, enrollment checks, audit). QR alone cannot prove physical presence.
4. Keep infrastructure at **₱0/month**, with a portable stack that can move to paid hosting without code changes.
5. Keep the schema normalized (3NF) and future-ready for SCHOOL_ADMIN and multi-school.

## 3. MVP scope

Auth (both roles), subjects, classes/sections, enrollment, weekly schedules with conflict detection, attendance sessions (start, QR, live monitor, correct, end, lock), student check-in, history, attendance %, teacher reports with CSV export, audit logging, baseline security (Helmet, CORS, rate limiting, validation, RBAC, ownership).

## 4. Out of scope (MVP)

SCHOOL_ADMIN role and web portal (Phase 3). Device binding (Phase 2). SSE/WebSockets (Phase 2). Offline check-in, GPS/geofence, face verification, push notifications, parent portal, multi-campus/multi-school, LMS integration, PDF/Excel reports, billing (Phase 4). Rooms as an entity (free-text in MVP). Student QR ID cards and teacher-scans-student mode from the prototype are dropped.

## 5. Roles

- **TEACHER** manages only resources they own: subjects they created, classes where `ClassSection.teacherId = me`, and the enrollments, schedules, sessions and attendance under those classes.
- **STUDENT** has read-only access to their own profile, enrollments, schedules and attendance, and can check in via QR.
- **SCHOOL_ADMIN** (Phase 3) is a row in `Role`. It is added to the RBAC policy map without schema redesign.

## 6. User stories (MVP)

**Teacher**

- T1 Register with the teacher code and log in, so I can manage attendance.
- T2 Create, edit and archive subjects.
- T3 Create classes/sections for a subject in a semester.
- T4 Enroll a registered student by student number and remove them.
- T5 Define weekly schedules and get warned about overlaps.
- T6 See today's classes on Home and start attendance with one tap.
- T7 Show a full-screen rotating QR and see the Present/Late counts rise live.
- T8 Mark students manually (Excused/Late/Absent) with remarks.
- T9 End the session, which marks everyone else ABSENT, and then lock it.
- T10 View session history and per-student and per-class reports, and export CSV.

**Student**

- S1 Register with my student number and log in.
- S2 See my classes, subjects and weekly schedule.
- S3 Reach the scanner in one tap, scan, and get a clear success or failure.
- S4 See my attendance history and percentage per class.

## 7. Functional requirements

FR-1 Auth: register, login, refresh, logout, me, change password. FR-2 Subjects CRUD + archive. FR-3 Classes CRUD + archive. FR-4 Enrollment add/remove/list. FR-5 Schedules CRUD, daily and weekly views, conflict detection. FR-6 Session lifecycle PENDING→ACTIVE→ENDED→LOCKED. FR-7 Rotating QR. FR-8 Check-in validation (§42). FR-9 Live records polling. FR-10 Manual correction with remarks, audited. FR-11 Auto-ABSENT on end. FR-12 History and reports with filters. FR-13 CSV export. FR-14 Audit log for all state changes listed in §51.

## 8. Non-functional requirements

- **Security:** OWASP API Top-10 mitigations, HTTPS only, no secrets in repo.
- **Performance (warm):** check-in p95 < 500 ms. Supports a 60-student burst within 30 s on the free tier.
- **Availability:** best-effort on the free tier. Cold start is mitigated (§60).
- **Correctness:** DB constraints enforce the invariants, and multi-row changes run in transactions.
- **Portability:** plain Node + Postgres, no provider SDKs.
- **Accessibility:** min 44 px touch targets, WCAG AA contrast, text plus colour for status.
- **Localization-ready:** strings are centralized. Timezone comes from `SCHOOL_TIMEZONE` (default `Asia/Manila`), and all timestamps are stored as `timestamptz` UTC.

---

# PART B — MOBILE

## 9. Teacher flow

```
Login → Home (today's schedule)
  → [Start Attendance] on a schedule card
      → POST /attendance/sessions {classId, scheduleId, startNow:true}
      → QR Display screen (rotating QR + live counts, polling)
      → Review list (manual edits, remarks)
      → [End Attendance] → confirm → absentees auto-marked
      → [Lock] → read-only
Setup path: Subjects → Classes → Class Details → Students (enroll by student number) → Schedule
```

## 10. Student flow

```
Login → Home (next class, big [Scan QR])
  → Scanner → decode "KAV1…" → lock scanner → "Validating…"
  → POST /attendance/check-in
  → 201/200 → ✅ "Attendance recorded — Math 101 · 09:03 · PRESENT/LATE"
  → 4xx     → specific message (expired, not enrolled, session closed…)
  → timeout → "Checking status…" → GET /attendance/my?sessionId → reconcile
```

## 11. Navigation (Expo Router, file-based on top of React Navigation)

```
apps/mobile/app/
  _layout.tsx                 Root: providers (QueryClient, Auth), splash, role redirect
  index.tsx                   Redirect → /(auth)/login | /(teacher) | /(student)
  (auth)/login.tsx, register.tsx
  (teacher)/_layout.tsx       Guard role=TEACHER; Stack
    (tabs)/_layout.tsx        Bottom tabs: Home · Subjects · Classes · Schedule · Attendance
    (tabs)/index.tsx          Home
    (tabs)/subjects/index.tsx, subjects/[id].tsx
    (tabs)/classes/index.tsx, classes/[id]/index.tsx, classes/[id]/students.tsx
    (tabs)/schedule.tsx       Day/Week segmented view
    (tabs)/attendance/index.tsx  Segments: Active | History
    session/[id]/qr.tsx       Full-screen modal (no tabs)
    session/[id]/index.tsx    Records/review
    reports.tsx, profile.tsx  (profile via header avatar)
  (student)/_layout.tsx       Guard role=STUDENT
    (tabs)/_layout.tsx        Home · Classes · [Scan] (raised centre button) · Schedule · Attendance
    (tabs)/index.tsx, classes/index.tsx, classes/[id].tsx, scan.tsx, schedule.tsx, attendance.tsx
    profile.tsx               (header avatar)
```

Profile sits behind the header avatar to keep five tabs. The student **Scan** tab is the raised centre button. Home also has a big Scan CTA.

## 12. Screen list

| Role    | Screen                                                                      | Key data / actions                                                                              |
| ------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Both    | Login, Register (role toggle; teacher needs code), Profile, Change Password |                                                                                                 |
| Teacher | Home                                                                        | today's schedules (`GET /schedules/today`), active session banner, recent sessions, 7-day stats |
| Teacher | Subjects list/detail/form                                                   | archive action                                                                                  |
| Teacher | Classes list/detail/form                                                    | subject, semester, section, status                                                              |
| Teacher | Class Students                                                              | enrolled list, "Add by student number" (lookup → confirm name → enroll), remove                 |
| Teacher | Schedule                                                                    | day and week views, create/edit form with conflict error display                                |
| Teacher | Attendance (Active / History)                                               | session list with filters                                                                       |
| Teacher | QR Display                                                                  | §15                                                                                             |
| Teacher | Session Records                                                             | per-student status chips, edit sheet (status + remarks), End, Lock                              |
| Teacher | Reports                                                                     | filters (date range, subject, class, student, status), summary table, Export CSV                |
| Student | Home                                                                        | next class, Scan CTA, my classes, recent attendance, overall %                                  |
| Student | My Classes / Class Detail                                                   | subject, teacher name, schedule, my attendance %                                                |
| Student | Scan                                                                        | §14                                                                                             |
| Student | Schedule                                                                    | weekly                                                                                          |
| Student | Attendance History                                                          | per-session list, filter by class, per-class %                                                  |

## 13. UI/UX requirements

- **Data layer:** TanStack Query for caching, retries and polling, plus a thin `apiClient` (fetch wrapper) that adds `Authorization`, refreshes once on 401 `TOKEN_EXPIRED`, applies a 10 s timeout via AbortController, and normalizes errors to `{code, message}`.
- **Screen states:** every screen implements a shared `<ScreenState>`:
  - **Loading:** skeletons.
  - **Empty:** illustration + CTA.
  - **Error:** message + Retry.
  - **Offline:** banner from NetInfo, and mutations are disabled.
  - **Unauthorized:** force logout → login with a "Session expired" toast.
  - **Expired session:** a 404/409 from the API shows "This attendance session has ended".
  - **Timeout:** "Server is taking longer than usual (it may be waking up)", then retry.
- **Cold-start UX:** the login screen and app foreground fire `GET /health`. If it takes more than 3 s, show "Waking up server…".
- **Reuse from prototype:** `src/components/ui.tsx`, `src/theme.ts`, `FormModal.tsx`, `EntityList.tsx`, the `useCrudList.ts` pattern (rewired to the API), `QRScanner.tsx`, `SessionQR.tsx`, and `features/reports/exportReport.ts` (CSV path; PDF can stay as a bonus). Forms use `react-hook-form` + zod from `packages/shared`.

## 14. QR scanner (student)

- Reuses `src/components/QRScanner.tsx` (expo-camera `CameraView`, debounce already built in). Adds a `paused` prop so scanning locks while a request is in flight.
- Parse and validate the format locally (`KAV1.` prefix + base64url shape) only to give a fast "Not a Kavriel attendance QR" message. **Validity is decided by the server only.**
- States: `Scanning…` → `Validating…` (spinner, scanner paused) → success (green check, haptic, subject, time, status) or failure:
  - `QR_EXPIRED`: "QR expired. Please scan the current QR code." Auto-resumes after 1.5 s.
  - `NOT_ENROLLED`: "You're not enrolled in this class."
  - `SESSION_NOT_ACTIVE`: "Attendance for this class is closed."
  - `ALREADY_CHECKED_IN`: shown as success, "Already recorded at 09:03".
  - Network/timeout: reconcile via `GET /attendance/my?sessionId=` before showing anything. If that is still unknown, show "Couldn't confirm. Check your connection and scan again". Rescanning is safe because the request is idempotent.
- Camera permission denied state includes a deep link to Settings.

## 15. QR display (teacher)

```
┌──────────────────────────────┐
│ Mathematics 101 · Section A  │
│ ● Attendance Active   09:15  │
│ ┌──────────────────────────┐ │
│ │        QR (≈75% width,   │ │
│ │        white quiet zone) │ │
│ └──────────────────────────┘ │
│ Refreshes in 08s  ▓▓▓▓▓░░░   │
│ Present 24 · Late 2 · 28 enrolled │
│ [ View list ]  [ End Attendance ] │
└──────────────────────────────┘
```

- `expo-keep-awake` keeps the screen on. The optional `expo-brightness` boost is restored on exit. The layout is portrait-locked. QR error-correction level **M**, large modules (payload ≈ 60 chars, so a low QR version that scans from 3–4 m on a phone and better on a projector via casting).
- **Encode the raw token, not a URL.** Change `SessionQR.tsx` to drop `checkinUrl()`.
- Refresh loop: the client fetches `GET /attendance/sessions/:id/qr` → `{token, expiresAt, serverTime, rotationSeconds}`. It computes `offset = serverTime − Date.now()` and schedules the next fetch at `expiresAt − 1 s` (corrected for offset). The countdown uses the same offset.
- If a refresh fails and the token has expired, **replace the QR with a "Reconnecting…" placeholder**. Never show a stale QR.
- Counts come from the records poll (§26).
- End Attendance opens a confirm dialog showing how many students will be marked ABSENT.

## 16. Attendance flow (end-to-end sequence)

```
Teacher app            API                          Postgres
POST /sessions ──────► validate ownership+window ─► INSERT session (ACTIVE) [partial-unique: 1 active/class]
GET /sessions/:id/qr ► HMAC(sessionId, window) ──► (no write)
                       ◄── {token, expiresAt}
Student app
POST /check-in ──────► verify HMAC → window ok? → session ACTIVE? → enrollment ACTIVE?
                       → status = now > startedAt+lateAfter ? LATE : PRESENT
                       → INSERT … ON CONFLICT (sessionId,studentId) DO NOTHING  + AuditLog (tx)
                       ◄── 201 {record} | 200 {record, alreadyRecorded:true}
Teacher app (poll 3s) GET /sessions/:id/records?since=cursor
POST /sessions/:id/end ► tx: status=ENDED, endedAt=now, INSERT ABSENT for enrolled w/o record, audit
POST /sessions/:id/lock ► status=LOCKED, lockedAt=now, audit
```

---

# PART C — BACKEND

## 17. Express architecture

Layering: **route → middleware (auth, role, validate) → controller (HTTP only) → service (business rules, transactions, ownership) → Prisma**. There is no generic repository layer, because Prisma is already the data-access layer. Complex reusable queries go in `*.queries.ts` inside the module. Services receive an `Actor` (`{userId, role, teacherId?, studentId?}`), never `req`, so the same services serve the Phase 3 admin web.

## 18. Folder structure

```
kavriel/
├── package.json                 (npm workspaces)
├── apps/backend/scripts/db.ts   (embedded PostgreSQL 17 for local dev: npm run db / db:stop / db:reset)
├── .github/workflows/ci.yml     (typecheck, lint, test, prisma validate)
├── packages/shared/src/         zod schemas (auth, subject, class, …), enums, API types, error codes
├── apps/mobile/                 (moved prototype: app/, src/, app.json, babel.config.js, tsconfig.json)
│   └── src/api/                 apiClient.ts, queries per module, tokenStore.ts (SecureStore)
└── apps/backend/
    ├── prisma/{schema.prisma, migrations/, seed.ts}
    ├── src/
    │   ├── config/{env.ts (zod-validated), database.ts (Prisma singleton), constants.ts}
    │   ├── middleware/{auth, role, validation, error, rate-limit, request-id}.middleware.ts
    │   ├── lib/{jwt.ts, password.ts, hmac.ts, time.ts (school TZ), http-errors.ts, logger.ts (pino)}
    │   ├── policies/ownership.ts     assertClassOwned, assertSubjectOwned, assertSessionOwned …
    │   ├── modules/
    │   │   ├── auth/        auth.{routes,controller,service,validation,types}.ts
    │   │   ├── teachers/    (profile get/update)
    │   │   ├── students/    (profile, lookup by studentNumber)
    │   │   ├── reference/   (year levels, academic years, semesters – read only)
    │   │   ├── subjects/ classes/ enrollments/ schedules/
    │   │   ├── attendance/  sessions.*, checkin.*, records.*
    │   │   ├── qr/          qr.service.ts (issue/verify tokens)
    │   │   ├── reports/     reports.service.ts, csv.ts
    │   │   └── audit/       audit.service.ts (record(tx, …))
    │   ├── routes.ts        mounts modules under /api/v1
    │   ├── app.ts           express app factory (testable, no listen)
    │   └── server.ts        listen + graceful shutdown
    └── test/{unit, integration, e2e, helpers/factories.ts}
```

## 19. Authentication

- **Register** `POST /auth/register`: `{role:'TEACHER'|'STUDENT', email, password, firstName, middleName?, lastName, contactNumber?, studentNumber? (student, required), yearLevelId? (student), employeeNumber? (teacher), teacherCode? (teacher, required)}`. A single transaction creates the User and the Teacher or Student row.
- **Passwords:** Argon2id (`argon2` package; m=19 MiB, t=2, p=1 per OWASP), min 8 chars, rejected if in a small common-password list. Fallback: `bcryptjs` cost 12 if native builds fail on the host.
- **Access token:** JWT HS256, 15 min, claims `{sub:userId, role, pid:teacherId|studentId, ver}`. `JWT_SECRET` is ≥ 32 random bytes.
- **Refresh token:** 256-bit random opaque string, **SHA-256 hash stored** in `RefreshToken`, 30-day expiry. It rotates on every refresh. Reusing a revoked token revokes the whole family (theft detection).
- **Logout** revokes the presented refresh token. **Change password** revokes all of the user's refresh tokens.
- `auth.middleware` verifies the JWT, then checks that `user.isActive` against the DB. This costs one indexed PK lookup per request, which is acceptable and is what makes deactivation take effect immediately.
- **Mobile storage:** tokens live in `expo-secure-store`, never AsyncStorage.
- Email is normalized to lowercase before storing and querying.

## 20. RBAC

`role.middleware(...roles)` rejects with 403 `FORBIDDEN`. The policy map lives in `packages/shared/permissions.ts` so the mobile app can hide UI too; this is cosmetic only, and the server enforces.

| Capability                                      |        Teacher         |             Student             |
| ----------------------------------------------- | :--------------------: | :-----------------------------: |
| Login / me / change password                    |           ✓            |                ✓                |
| Manage subjects, classes, enrollment, schedules |        ✓ (own)         |                ✗                |
| Create / start / end / lock session, get QR     |     ✓ (own class)      |                ✗                |
| Check-in (scan QR)                              |           ✗            |                ✓                |
| View own attendance                             | ✓ (classes they teach) |         ✓ (own records)         |
| View class attendance / modify / export         |        ✓ (own)         |                ✗                |
| View own classes & schedules                    |      ✓ (teaching)      | ✓ (enrolled, ACTIVE enrollment) |

Phase 3 adds `SCHOOL_ADMIN` to the map, and the ownership policy grants admins access.

## 21. Authorization and resource ownership

- **Never accept** `teacherId`/`studentId` from the body. They come from the JWT/Actor.
- Every teacher query is **scoped in the WHERE clause**, e.g. `prisma.classSection.findFirst({ where: { id, teacherId: actor.teacherId } })`. A missing or foreign resource returns **404** (not 403), so the API never reveals that another teacher's resource exists.
- Nested resources are checked through the chain: schedule → class.teacherId, session → class.teacherId, attendance → session → class.teacherId, enrollment → class.teacherId.
- A teacher creating a class may only reference a subject they own and a valid semester.
- Students: `/classes` returns only classes with an ACTIVE enrollment for `actor.studentId`. `/attendance/my` is filtered by `studentId = actor.studentId`.
- Status values from clients are validated against enums **and** against allowed transitions. For example, a teacher cannot set `checkInTime`, and students can never write attendance except through check-in.

## 22. API architecture

- **Base path:** `/api/v1`. JSON only, and camelCase fields.
- **Success envelope:** `{ "data": … , "meta"?: { "nextCursor": "…" } }`.
- **Error envelope:** `{ "error": { "code": "QR_EXPIRED", "message": "…", "details"?: […] , "requestId": "…" } }`.
- **Pagination:** cursor-based (`?limit=20&cursor=`), max 100.
- **Dates:** ISO-8601 UTC. Schedule times are `"HH:mm"` local school time.
- **Idempotency:** check-in accepts `clientRequestId` (UUID) purely for logging and correlation. Real idempotency comes from the unique constraint.
- **Health:** `GET /health` is liveness and does no DB work. `GET /health/ready` runs `SELECT 1`.

## 23. API specification

Conventions for every row below:

- Auth = Bearer JWT unless marked public.
- `T` = TEACHER, `S` = STUDENT, and "own" means the ownership chain from §21 applies (a failure returns 404).
- Common errors on all authed routes: 400 `VALIDATION_ERROR`, 401 `UNAUTHENTICATED` / `TOKEN_EXPIRED`, 403 `FORBIDDEN`, 429 `RATE_LIMITED`, 500 `INTERNAL`.

### Auth

| Method & URL         | Role   | Request                                          | Response                                                            | Validation / DB                                                                | Specific errors                                                                                |
| -------------------- | ------ | ------------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| POST /auth/register  | public | see §19                                          | 201 `{user, accessToken, refreshToken}`                             | zod. Tx: insert User, then Teacher/Student. Audit `USER_REGISTERED`            | 409 `EMAIL_TAKEN`, `STUDENT_NUMBER_TAKEN`, `EMPLOYEE_NUMBER_TAKEN`; 403 `INVALID_TEACHER_CODE` |
| POST /auth/login     | public | `{email,password}`                               | 200 same as above                                                   | verify hash (constant-time), isActive; insert RefreshToken; update lastLoginAt | 401 `INVALID_CREDENTIALS` (generic message), 403 `ACCOUNT_DISABLED`                            |
| POST /auth/refresh   | public | `{refreshToken}`                                 | 200 `{accessToken, refreshToken}`                                   | lookup hash, not revoked or expired; rotate in tx                              | 401 `INVALID_REFRESH_TOKEN` (reuse → revoke family)                                            |
| POST /auth/logout    | any    | `{refreshToken}`                                 | 204                                                                 | revoke                                                                         | —                                                                                              |
| GET /auth/me         | T,S    | —                                                | 200 `{id,email,role, profile:{…teacher or student with yearLevel}}` | join                                                                           | —                                                                                              |
| PATCH /auth/password | T,S    | `{currentPassword,newPassword}`                  | 204                                                                 | verify, rehash, revoke all refresh tokens, audit `PASSWORD_CHANGED`            | 401 `INVALID_CREDENTIALS`                                                                      |
| PATCH /auth/me       | T,S    | name parts, contactNumber (student: yearLevelId) | 200 profile                                                         | audit `PROFILE_UPDATED` with before/after                                      | 409 on unique fields                                                                           |

### Reference (read-only, seeded)

`GET /reference/year-levels`, `GET /reference/academic-years` (with nested semesters), `GET /reference/semesters/current`. Role: T, S.

### Subjects (T, own)

| Method & URL                                | Request                                                                                  | Response                                                                                                         | Notes / errors                                                |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| GET /subjects `?status=ACTIVE\|ARCHIVED&q=` | —                                                                                        | 200 list (with classCount)                                                                                       | scoped `ownerTeacherId`                                       |
| POST /subjects                              | `{subjectCode (≤20, A-Z0-9-), subjectName, description?, yearLevelId?, units? (0.5–10)}` | 201 subject                                                                                                      | 409 `SUBJECT_CODE_TAKEN` (per owner); audit `SUBJECT_CREATED` |
| GET /subjects/:id                           | —                                                                                        | 200 subject + classes                                                                                            | 404                                                           |
| PATCH /subjects/:id                         | partial of POST, or `status`                                                             | 200                                                                                                              | 409 on code clash; `status: ARCHIVED` sets archivedAt; audit  |
| DELETE /subjects/:id                        | —                                                                                        | 204 hard delete **only if no ClassSection references it**, else 409 `SUBJECT_IN_USE` (the client offers Archive) | FK Restrict backs this up                                     |

### Classes (T, own; S read enrolled)

| Method & URL                                | Request                                           | Response                                                                                     | Notes / errors                                                                                     |
| ------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| GET /classes `?status&semesterId&subjectId` | —                                                 | T: own classes; S: enrolled ACTIVE. Each with subject, teacher name, semester, enrolledCount |                                                                                                    |
| POST /classes                               | `{subjectId, semesterId, sectionName, classCode}` | 201                                                                                          | subject must be own and ACTIVE (422 `SUBJECT_ARCHIVED`); 409 `CLASS_CODE_TAKEN` (teacher+semester) |
| GET /classes/:id                            | —                                                 | 200 with subject, schedules, counts                                                          | S: must be enrolled, else 404                                                                      |
| PATCH /classes/:id                          | partial / `status`                                | 200                                                                                          | archiving is blocked while a session is ACTIVE (409 `SESSION_ACTIVE`)                              |
| DELETE /classes/:id                         | —                                                 | 204 only if no enrollments, schedules or sessions exist, else 409 `CLASS_IN_USE`             |                                                                                                    |

### Enrollment (T, own class)

| Method & URL                               | Request                            | Response                                                                    | Notes / errors                                                                                  |
| ------------------------------------------ | ---------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| GET /students/lookup `?studentNumber=`     | exact match only                   | 200 `{studentId, studentNumber, fullName, yearLevel}`                       | no partial search, which prevents directory enumeration; rate limited 30/min                    |
| GET /classes/:id/students `?status=ACTIVE` | —                                  | 200 enrollments + student info                                              |                                                                                                 |
| POST /classes/:id/students                 | `{studentNumber}` or `{studentId}` | 201 enrollment (or 200 if re-activating a DROPPED one)                      | 404 `STUDENT_NOT_FOUND`; 409 `ALREADY_ENROLLED`; 422 `CLASS_ARCHIVED`; audit `STUDENT_ENROLLED` |
| DELETE /classes/:id/students/:studentId    | —                                  | 204 sets status DROPPED + droppedAt (**soft**; attendance history retained) | audit `STUDENT_REMOVED`                                                                         |

### Schedules (T, own; S read)

| Method & URL                  | Request                                                   | Response                                                                                                     | Notes / errors                                                                                                                   |
| ----------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| GET /schedules `?classId&day` | —                                                         | T own; S enrolled classes                                                                                    |                                                                                                                                  |
| GET /schedules/today          | —                                                         | today's schedules in school TZ, each with `activeSessionId?` and `canStart`                                  | powers the Home screen                                                                                                           |
| POST /schedules               | `{classId, dayOfWeek, startTime "HH:mm", endTime, room?}` | 201                                                                                                          | end > start; duration 15 min–6 h; 409 `SCHEDULE_CONFLICT` with `details:[{scheduleId, classCode, day, start, end, type:'TEACHER' | 'CLASS'}]`; audit |
| GET /schedules/:id            | —                                                         | 200                                                                                                          |                                                                                                                                  |
| PATCH /schedules/:id          | partial                                                   | 200                                                                                                          | re-runs conflict check excluding itself                                                                                          |
| DELETE /schedules/:id         | —                                                         | 204 hard delete if no sessions reference it, else archive (status ARCHIVED) and return 200 `{archived:true}` | audit                                                                                                                            |

### Attendance sessions (T, own)

| Method & URL                                              | Request                                                                                            | Response                                                           | Notes / errors                                                                                                                                                                                          |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST /attendance/sessions                                 | `{classId, scheduleId?, startNow=true, lateAfterMinutes=15 (0–120), qrRotationSeconds=15 (10–60)}` | 201 session                                                        | class own and ACTIVE; schedule belongs to class; start-window rule §39 → 422 `OUTSIDE_SCHEDULE_WINDOW`; 409 `SESSION_ALREADY_ACTIVE` (partial unique index); audit `SESSION_CREATED`, `SESSION_STARTED` |
| GET /attendance/sessions `?classId&status&from&to&cursor` | —                                                                                                  | list with class/subject, counts by status                          |                                                                                                                                                                                                         |
| GET /attendance/sessions/:id                              | —                                                                                                  | session + counts + enrolledCount                                   |                                                                                                                                                                                                         |
| POST /attendance/sessions/:id/start                       | —                                                                                                  | 200                                                                | PENDING → ACTIVE only, else 409 `INVALID_STATE`                                                                                                                                                         |
| GET /attendance/sessions/:id/qr                           | —                                                                                                  | 200 `{token, windowIndex, expiresAt, serverTime, rotationSeconds}` | ACTIVE only, else 409 `SESSION_NOT_ACTIVE`; `Cache-Control: no-store`; rate limit 30/min                                                                                                                |
| POST /attendance/sessions/:id/end                         | —                                                                                                  | 200 `{session, absentMarked: n}`                                   | ACTIVE → ENDED; tx inserts ABSENT (source SYSTEM) for ACTIVE enrollments without a record; audit                                                                                                        |
| POST /attendance/sessions/:id/lock                        | —                                                                                                  | 200                                                                | ENDED → LOCKED; audit                                                                                                                                                                                   |

### Check-in (S)

| Method & URL                                           | Request                                          | Response                                                                                                                                                        | Notes / errors                                                                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| POST /attendance/check-in                              | `{qrToken (≤200 chars), clientRequestId (uuid)}` | 201 `{attendance:{id,status,checkInTime}, session:{id, class:{classCode,sectionName}, subject:{subjectName}}}`; 200 with `alreadyRecorded:true` for a duplicate | order §42. Errors: 400 `QR_INVALID`, 410 `QR_EXPIRED`, 409 `SESSION_NOT_ACTIVE`, 403 `NOT_ENROLLED`. Rate limit 10/min per user + 30/min per IP |
| GET /attendance/my `?classId&sessionId&from&to&cursor` | —                                                | own records + session date, subject, class                                                                                                                      |                                                                                                                                                 |
| GET /attendance/my/summary                             | —                                                | per class: `{present, late, absent, excused, totalSessions, percentage}`                                                                                        |                                                                                                                                                 |

### Records (T, own)

| Method & URL                                      | Request                      | Response                                                                                                      | Notes / errors                                                                                          |
| ------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| GET /attendance/sessions/:id/records `?since=ISO` | —                            | full roster: every ACTIVE-enrolled student + record or `null` (pending), plus `serverTime` (the next `since`) | polling endpoint; with `since` returns only rows updated after that time                                |
| PATCH /attendance/:id                             | `{status?, remarks? (≤500)}` | 200                                                                                                           | session ENDED or ACTIVE (LOCKED → 409 `SESSION_LOCKED`); audit `ATTENDANCE_UPDATED` `{before, after}`   |
| PUT /attendance/sessions/:id/records/:studentId   | `{status, remarks?}`         | 201/200                                                                                                       | manual mark for a pending student (source MANUAL); student must be enrolled; audit `ATTENDANCE_CREATED` |

### Reports (T, own)

`GET /reports/attendance?from&to&subjectId&classId&studentId&status&groupBy=student|session|day` returns aggregated rows and percentages. `GET /reports/attendance.csv` takes the same filters, streams `text/csv` with UTF-8 BOM (for Excel), and neutralizes CSV injection by prefixing `'` to cells starting with `= + - @`. Percentage = (PRESENT + LATE) / (total − EXCUSED), documented and shown in the UI.

## 24. Validation

- zod schemas live in `packages/shared` and are shared by the mobile forms and `validation.middleware(schema)`, which validates `body`, `params` and `query`, strips unknown keys, and coerces query numbers and dates.
- UUID params are validated before hitting the DB.
- String limits apply everywhere, with trimming and case normalization for codes and emails.
- Business-rule validation (state transitions, conflicts, windows) lives in services and returns 409/422.

## 25. Error handling

- `AppError(status, code, message, details?)` hierarchy. The central `error.middleware` maps:
  - zod errors → 400.
  - Prisma `P2002` (unique) → 409 with a code chosen from the constraint name.
  - `P2003` (FK) → 409 `IN_USE`.
  - `P2025` → 404.
  - Anything else → 500 with a generic message.
- pino logs include `requestId`. Stack traces never reach clients in production.
- `express-async-errors` or async wrappers catch rejected promises.
- `404` handler for unknown routes.

## 26. Real-time architecture

| Option            | Verdict                                                                                                                                                                                                                           |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Polling (MVP)** | Simple and stateless, and works through Render's proxy and mobile network changes. At 3 s intervals only while the QR/records screen is focused, cost is about 20 requests/min per active teacher. `?since=` keeps payloads tiny. |
| SSE (Phase 2)     | One-way push fits well. Needs keep-alive pings, `X-Accel-Buffering` handling, and RN polyfill (`react-native-sse`), and free instances that sleep drop connections.                                                               |
| WebSockets        | Overkill for one-way updates, and adds reconnect/state complexity.                                                                                                                                                                |

TanStack Query `refetchInterval: 3000` runs only when the screen is focused and the app is in the foreground (`focusManager` + AppState). The same focus-gated polling also drives the QR refresh schedule. The records service is behind an interface, so Phase 2 SSE reuses the same query.

---

# PART D — DATABASE

## 27. Normalized design (3NF analysis)

- Every non-key attribute depends on the key, the whole key, and nothing but the key:
  - Names live only in Teacher and Student.
  - The subject name lives only in Subject.
  - ClassSection holds FKs only, plus its own attributes.
  - Attendance holds FKs + status/time/remarks.
- **Deliberate deviation from the brief:** `ClassSection.academicYearId` is **omitted**. Semester belongs to exactly one AcademicYear, so storing both would create a transitive dependency (classId → semesterId → academicYearId) and allow contradictory rows. The academic year is reached via `ClassSection → Semester → AcademicYear`.
- `Subject.ownerTeacherId` is **added**: with no admin in the MVP, teachers create subjects, and ownership is needed for isolation. In Phase 3, admin-created institution subjects have `ownerTeacherId = NULL`.
- `subjectCode` uniqueness is therefore **per owner** in the MVP, not global. The Phase 3 partial unique index covers school-wide subjects.
- `RefreshToken` is **added** (required for secure refresh).
- **Deferred:** `Device` (Phase 2), `QRToken` (not needed with stateless HMAC; add only if per-token single use or forensic history is required), `Room`, and `School` (Phase 4 multi-school; see §62).
- `Student.yearLevelId` is the student's _current_ year level. Historical reporting by year uses `Subject.yearLevelId` and `Semester`.
- Entity MVP verdict: User ✅, Role ✅, Teacher ✅, Student ✅, YearLevel ✅ (seeded), AcademicYear ✅ (seeded), Semester ✅ (seeded), Subject ✅, ClassSection ✅, Enrollment ✅, Schedule ✅, AttendanceSession ✅, Attendance ✅, AuditLog ✅, RefreshToken ✅ (added), Device ⏭ Phase 2, QRToken ⏭ deferred.

## 28. ERD

```
Role 1──N User
User 1──0..1 Teacher        User 1──0..1 Student       User 1──N RefreshToken     User 1──N AuditLog
YearLevel 1──N Student      YearLevel 1──N Subject
AcademicYear 1──N Semester  Semester 1──N ClassSection
Teacher 1──N Subject (owner)          Teacher 1──N ClassSection
Subject 1──N ClassSection
ClassSection 1──N Enrollment N──1 Student
ClassSection 1──N Schedule
ClassSection 1──N AttendanceSession   Schedule 0..1──N AttendanceSession
AttendanceSession 1──N Attendance N──1 Student
(Phase 2) Student 1──N Device        (deferred) AttendanceSession 1──N QRToken
```

(A rendered Mermaid `erDiagram` will be placed in `docs/erd.md` during implementation.)

## 29–37. Tables, columns, types, keys, constraints, indexes, cardinality

The full definitions are in the Prisma schema (§39), which is authoritative. Summary:

| Table             | PK          | FKs (onDelete)                                     | Unique                                 | Indexes (beyond PK/unique)                             |
| ----------------- | ----------- | -------------------------------------------------- | -------------------------------------- | ------------------------------------------------------ |
| Role              | id smallint | —                                                  | name                                   | —                                                      |
| User              | id uuid     | roleId→Role (Restrict)                             | email                                  | roleId                                                 |
| RefreshToken      | id uuid     | userId→User (Cascade)                              | tokenHash                              | userId, familyId                                       |
| Teacher           | id uuid     | userId→User (Restrict)                             | userId, employeeNumber                 | lastName                                               |
| Student           | id uuid     | userId (Restrict), yearLevelId (SetNull)           | userId, studentNumber                  | lastName, yearLevelId                                  |
| YearLevel         | id smallint | —                                                  | name                                   | —                                                      |
| AcademicYear      | id int      | —                                                  | name                                   | —                                                      |
| Semester          | id int      | academicYearId (Restrict)                          | (academicYearId,name)                  | —                                                      |
| Subject           | id uuid     | ownerTeacherId (Restrict), yearLevelId (SetNull)   | (ownerTeacherId, subjectCode)          | ownerTeacherId (covered), status                       |
| ClassSection      | id uuid     | subjectId, teacherId, semesterId (all Restrict)    | (teacherId, semesterId, classCode)     | teacherId (covered), subjectId, semesterId             |
| Enrollment        | id uuid     | classId, studentId (Restrict)                      | (classId, studentId)                   | studentId                                              |
| Schedule          | id uuid     | classId (Restrict)                                 | —                                      | classId, (dayOfWeek, startTime)                        |
| AttendanceSession | id uuid     | classId (Restrict), scheduleId nullable (Restrict) | partial: classId WHERE status='ACTIVE' | (classId, startedAt), scheduleId, status               |
| Attendance        | id uuid     | sessionId, studentId (Restrict)                    | (sessionId, studentId)                 | studentId, (sessionId, updatedAt)                      |
| AuditLog          | id bigint   | userId (SetNull)                                   | —                                      | (entityType, entityId), (userId, createdAt), createdAt |

**Indexing strategy:**

- Every FK used in a join or filter is indexed. Composite unique indexes whose **leading column** is the FK already serve that FK, so separate indexes on `Enrollment.classId`, `Attendance.sessionId` and `ClassSection.teacherId` would be redundant and are not created.
- The **second** column of each composite gets its own index (`Enrollment.studentId`, `Attendance.studentId`) for student-side queries.
- `(sessionId, updatedAt)` serves the `?since=` polling query.
- `(classId, startedAt)` serves history lists sorted by date.
- AuditLog is append-only, so the indexes chosen are the ones its queries need.
- No speculative indexes: re-evaluate with `EXPLAIN ANALYZE` once there is real data.

**DB-level CHECK constraints** (added in raw SQL within the migration, since Prisma can't express them):

- `Schedule.endTime > startTime`
- `Semester.endDate > startDate`
- `AttendanceSession.lateAfterMinutes BETWEEN 0 AND 240`
- `qrRotationSeconds BETWEEN 10 AND 120`
- `Subject.units > 0`

**Cardinality:** as in §28. User↔Teacher/Student is 1:0..1, and the app ensures exactly one profile per user matching `role`.

## 38. Delete / archive strategy

| Entity                                                                                             | Rule                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User                                                                                               | **Never hard-deleted.** Deactivate (`isActive=false`). A DPA erasure request anonymizes: email → `deleted+<uuid>@invalid`, names → "Deleted User", contact → null, password hash is randomized, and refresh tokens are revoked. Attendance rows remain linked by ID (§48). |
| Teacher / Student                                                                                  | Same as User (profiles are anonymized, not deleted).                                                                                                                                                                                                                       |
| Subject                                                                                            | Hard delete only if unreferenced, else **archive** (`status=ARCHIVED`, `archivedAt`). An archived subject can't get new classes.                                                                                                                                           |
| ClassSection                                                                                       | Hard delete only if it has no enrollments, schedules or sessions, else archive. An archived class blocks new sessions and enrollments but stays in history and reports.                                                                                                    |
| Enrollment                                                                                         | **Soft**: `status=DROPPED`, `droppedAt`. Re-enrolling flips the same row back to ACTIVE, which keeps the unique constraint intact.                                                                                                                                         |
| Schedule                                                                                           | Hard delete if no sessions reference it, else archive.                                                                                                                                                                                                                     |
| AttendanceSession                                                                                  | **Never deleted** once ACTIVE or later. A PENDING session that never started may be hard-deleted.                                                                                                                                                                          |
| Attendance                                                                                         | **Never deleted**. Corrections are updates, and they are audited.                                                                                                                                                                                                          |
| AuditLog                                                                                           | Append-only. Purged only by the retention job (§48).                                                                                                                                                                                                                       |
| RefreshToken                                                                                       | Hard delete of expired/revoked rows via a cleanup on login and a periodic sweep.                                                                                                                                                                                           |
| Reference (YearLevel, AcademicYear, Semester, Role)                                                | Restrict. Changed only by seed/migration in the MVP.                                                                                                                                                                                                                       |
| Every historical FK uses `onDelete: Restrict`, so the database itself refuses accidental cascades. |

### Historical data handling (brief §32)

- **Name changes** (student or teacher): reports join to current names, so a legal-name correction applies everywhere. That is the desired behaviour under DPA accuracy. The old and new values are captured in the `PROFILE_UPDATED` audit metadata, and exported CSVs are point-in-time snapshots.
- **Subject or class edits:** code or name edits propagate to history. That is acceptable because they identify the same offering. Material changes should be a new subject or class; the UI warns when editing a subject that already has sessions.
- **Student removal:** the enrollment becomes DROPPED and past attendance stays. The student no longer appears in new rosters or absentee generation, and their `%` in that class counts only sessions up to `droppedAt`.
- **Teacher removal:** the user is deactivated and their classes stay intact for reports. Phase 3 admin reassigns `ClassSection.teacherId`. Sessions are still attributed via the class, and the audit log records who acted.
- **Archived subjects and classes** stay visible in history and report filters (with a toggle to "include archived").

## 39. Prisma schema (`apps/backend/prisma/schema.prisma`)

```prisma
// As built: see apps/backend/prisma/schema.prisma (authoritative).
generator client {
  provider     = "prisma-client"
  output       = "../src/generated/prisma"
  moduleFormat = "esm"
}

datasource db {
  provider = "postgresql" // URL comes from prisma.config.ts (Prisma 7)
}

// ───────────── Enums ─────────────
enum RecordStatus {
  ACTIVE
  ARCHIVED
}

enum EnrollmentStatus {
  ACTIVE
  DROPPED
}

enum DayOfWeek {
  MON
  TUE
  WED
  THU
  FRI
  SAT
  SUN
}

enum SessionStatus {
  PENDING
  ACTIVE
  ENDED
  LOCKED
}

enum AttendanceStatus {
  PRESENT
  LATE
  ABSENT
  EXCUSED
}

enum AttendanceSource {
  QR_SCAN
  MANUAL
  SYSTEM
}

enum AuditAction {
  USER_REGISTERED
  USER_LOGIN
  PASSWORD_CHANGED
  PROFILE_UPDATED
  SUBJECT_CREATED
  SUBJECT_UPDATED
  SUBJECT_ARCHIVED
  SUBJECT_DELETED
  CLASS_CREATED
  CLASS_UPDATED
  CLASS_ARCHIVED
  CLASS_DELETED
  STUDENT_ENROLLED
  STUDENT_REMOVED
  SCHEDULE_CREATED
  SCHEDULE_UPDATED
  SCHEDULE_DELETED
  SESSION_CREATED
  SESSION_STARTED
  SESSION_ENDED
  SESSION_LOCKED
  ATTENDANCE_CREATED
  ATTENDANCE_UPDATED
  CHECKIN_REJECTED
  REPORT_EXPORTED
}

// ───────────── Identity ─────────────
model Role {
  id    Int    @id @default(autoincrement()) @db.SmallInt
  name  String @unique @db.VarChar(32) // TEACHER, STUDENT (SCHOOL_ADMIN in Phase 3)
  users User[]
}

model User {
  id                String    @id @default(uuid()) @db.Uuid
  email             String    @unique @db.VarChar(254) // stored lower-cased
  passwordHash      String    @db.VarChar(255)
  roleId            Int       @db.SmallInt
  isActive          Boolean   @default(true)
  lastLoginAt       DateTime? @db.Timestamptz(3)
  passwordChangedAt DateTime? @db.Timestamptz(3)
  createdAt         DateTime  @default(now()) @db.Timestamptz(3)
  updatedAt         DateTime  @updatedAt @db.Timestamptz(3)

  role          Role           @relation(fields: [roleId], references: [id], onDelete: Restrict)
  teacher       Teacher?
  student       Student?
  refreshTokens RefreshToken[]
  auditLogs     AuditLog[]

  @@index([roleId])
}

model RefreshToken {
  id         String    @id @default(uuid()) @db.Uuid
  userId     String    @db.Uuid
  tokenHash  String    @unique @db.Char(64) // sha256 hex
  familyId   String    @db.Uuid
  expiresAt  DateTime  @db.Timestamptz(3)
  revokedAt  DateTime? @db.Timestamptz(3)
  replacedBy String?   @db.Uuid
  userAgent  String?   @db.VarChar(255)
  createdAt  DateTime  @default(now()) @db.Timestamptz(3)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([familyId])
}

model Teacher {
  id             String   @id @default(uuid()) @db.Uuid
  userId         String   @unique @db.Uuid
  firstName      String   @db.VarChar(100)
  middleName     String?  @db.VarChar(100)
  lastName       String   @db.VarChar(100)
  employeeNumber String?  @unique @db.VarChar(50)
  contactNumber  String?  @db.VarChar(30)
  createdAt      DateTime @default(now()) @db.Timestamptz(3)
  updatedAt      DateTime @updatedAt @db.Timestamptz(3)

  user     User           @relation(fields: [userId], references: [id], onDelete: Restrict)
  subjects Subject[]
  classes  ClassSection[]

  @@index([lastName])
}

model Student {
  id            String   @id @default(uuid()) @db.Uuid
  userId        String   @unique @db.Uuid
  studentNumber String   @unique @db.VarChar(50)
  firstName     String   @db.VarChar(100)
  middleName    String?  @db.VarChar(100)
  lastName      String   @db.VarChar(100)
  yearLevelId   Int?     @db.SmallInt
  contactNumber String?  @db.VarChar(30)
  createdAt     DateTime @default(now()) @db.Timestamptz(3)
  updatedAt     DateTime @updatedAt @db.Timestamptz(3)

  user        User         @relation(fields: [userId], references: [id], onDelete: Restrict)
  yearLevel   YearLevel?   @relation(fields: [yearLevelId], references: [id], onDelete: SetNull)
  enrollments Enrollment[]
  attendance  Attendance[]

  @@index([lastName])
  @@index([yearLevelId])
}

// ───────────── Academic reference ─────────────
model YearLevel {
  id        Int       @id @default(autoincrement()) @db.SmallInt
  name      String    @unique @db.VarChar(50)
  sortOrder Int       @db.SmallInt
  students  Student[]
  subjects  Subject[]
}

model AcademicYear {
  id        Int        @id @default(autoincrement())
  name      String     @unique @db.VarChar(20) // "2026-2027"
  startDate DateTime   @db.Date
  endDate   DateTime   @db.Date
  semesters Semester[]
}

model Semester {
  id             Int      @id @default(autoincrement())
  academicYearId Int
  name           String   @db.VarChar(50) // "1st Semester"
  startDate      DateTime @db.Date
  endDate        DateTime @db.Date

  academicYear AcademicYear   @relation(fields: [academicYearId], references: [id], onDelete: Restrict)
  classes      ClassSection[]

  @@unique([academicYearId, name])
}

// ───────────── Academic structure ─────────────
model Subject {
  id             String       @id @default(uuid()) @db.Uuid
  ownerTeacherId String?      @db.Uuid // null = institution subject (Phase 3)
  subjectCode    String       @db.VarChar(20)
  subjectName    String       @db.VarChar(150)
  description    String?      @db.VarChar(1000)
  yearLevelId    Int?         @db.SmallInt
  units          Decimal?     @db.Decimal(3, 1)
  status         RecordStatus @default(ACTIVE)
  archivedAt     DateTime?    @db.Timestamptz(3)
  createdAt      DateTime     @default(now()) @db.Timestamptz(3)
  updatedAt      DateTime     @updatedAt @db.Timestamptz(3)

  owner     Teacher?       @relation(fields: [ownerTeacherId], references: [id], onDelete: Restrict)
  yearLevel YearLevel?     @relation(fields: [yearLevelId], references: [id], onDelete: SetNull)
  classes   ClassSection[]

  @@unique([ownerTeacherId, subjectCode])
  @@index([status])
}

model ClassSection {
  id          String       @id @default(uuid()) @db.Uuid
  classCode   String       @db.VarChar(30)
  sectionName String       @db.VarChar(50)
  subjectId   String       @db.Uuid
  teacherId   String       @db.Uuid
  semesterId  Int
  status      RecordStatus @default(ACTIVE)
  archivedAt  DateTime?    @db.Timestamptz(3)
  createdAt   DateTime     @default(now()) @db.Timestamptz(3)
  updatedAt   DateTime     @updatedAt @db.Timestamptz(3)

  subject     Subject             @relation(fields: [subjectId], references: [id], onDelete: Restrict)
  teacher     Teacher             @relation(fields: [teacherId], references: [id], onDelete: Restrict)
  semester    Semester            @relation(fields: [semesterId], references: [id], onDelete: Restrict)
  enrollments Enrollment[]
  schedules   Schedule[]
  sessions    AttendanceSession[]

  @@unique([teacherId, semesterId, classCode])
  @@index([subjectId])
  @@index([semesterId])
}

model Enrollment {
  id         String           @id @default(uuid()) @db.Uuid
  classId    String           @db.Uuid
  studentId  String           @db.Uuid
  status     EnrollmentStatus @default(ACTIVE)
  enrolledAt DateTime         @default(now()) @db.Timestamptz(3)
  droppedAt  DateTime?        @db.Timestamptz(3)

  class   ClassSection @relation(fields: [classId], references: [id], onDelete: Restrict)
  student Student      @relation(fields: [studentId], references: [id], onDelete: Restrict)

  @@unique([classId, studentId])
  @@index([studentId])
}

model Schedule {
  id        String       @id @default(uuid()) @db.Uuid
  classId   String       @db.Uuid
  dayOfWeek DayOfWeek
  startTime DateTime     @db.Time(0) // local school time
  endTime   DateTime     @db.Time(0)
  room      String?      @db.VarChar(50)
  status    RecordStatus @default(ACTIVE)
  createdAt DateTime     @default(now()) @db.Timestamptz(3)
  updatedAt DateTime     @updatedAt @db.Timestamptz(3)

  class    ClassSection        @relation(fields: [classId], references: [id], onDelete: Restrict)
  sessions AttendanceSession[]

  @@index([classId])
  @@index([dayOfWeek, startTime])
}

// ───────────── Attendance ─────────────
model AttendanceSession {
  id                String        @id @default(uuid()) @db.Uuid
  classId           String        @db.Uuid
  scheduleId        String?       @db.Uuid // null = ad-hoc session
  status            SessionStatus @default(PENDING)
  startedAt         DateTime?     @db.Timestamptz(3)
  endedAt           DateTime?     @db.Timestamptz(3)
  lockedAt          DateTime?     @db.Timestamptz(3)
  lateAfterMinutes  Int           @default(15) @db.SmallInt
  qrRotationSeconds Int           @default(15) @db.SmallInt
  createdAt         DateTime      @default(now()) @db.Timestamptz(3)
  updatedAt         DateTime      @updatedAt @db.Timestamptz(3)

  class    ClassSection @relation(fields: [classId], references: [id], onDelete: Restrict)
  schedule Schedule?    @relation(fields: [scheduleId], references: [id], onDelete: Restrict)
  records  Attendance[]

  @@index([classId, startedAt])
  @@index([scheduleId])
  @@index([status])
  // + raw SQL partial unique: one ACTIVE session per class
}

model Attendance {
  id          String           @id @default(uuid()) @db.Uuid
  sessionId   String           @db.Uuid
  studentId   String           @db.Uuid
  status      AttendanceStatus
  source      AttendanceSource
  checkInTime DateTime?        @db.Timestamptz(3) // server time, QR_SCAN only
  remarks     String?          @db.VarChar(500)
  createdAt   DateTime         @default(now()) @db.Timestamptz(3)
  updatedAt   DateTime         @updatedAt @db.Timestamptz(3)

  session AttendanceSession @relation(fields: [sessionId], references: [id], onDelete: Restrict)
  student Student           @relation(fields: [studentId], references: [id], onDelete: Restrict)

  @@unique([sessionId, studentId])
  @@index([studentId])
  @@index([sessionId, updatedAt])
}

model AuditLog {
  id         BigInt      @id @default(autoincrement())
  userId     String?     @db.Uuid
  action     AuditAction
  entityType String      @db.VarChar(50)
  entityId   String      @db.VarChar(64)
  metadata   Json?
  ipAddress  String?     @db.VarChar(45)
  createdAt  DateTime    @default(now()) @db.Timestamptz(3)

  user User? @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([entityType, entityId])
  @@index([userId, createdAt])
  @@index([createdAt])
}
```

**Raw SQL appended to the initial migration** (`prisma migrate dev --create-only`, then edit):

```sql
CREATE UNIQUE INDEX "AttendanceSession_one_active_per_class"
  ON "AttendanceSession"("classId") WHERE status = 'ACTIVE';
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_time_order" CHECK ("endTime" > "startTime");
ALTER TABLE "Semester" ADD CONSTRAINT "Semester_date_order" CHECK ("endDate" > "startDate");
ALTER TABLE "AcademicYear" ADD CONSTRAINT "AcademicYear_date_order" CHECK ("endDate" > "startDate");
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_late_range" CHECK ("lateAfterMinutes" BETWEEN 0 AND 240);
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_qr_range" CHECK ("qrRotationSeconds" BETWEEN 10 AND 120);
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_units_pos" CHECK ("units" IS NULL OR "units" > 0);
```

**Seed (`prisma/seed.ts`, idempotent upserts):** Roles (TEACHER, STUDENT), YearLevels 1st–4th Year, the current AcademicYear + 1st/2nd/3rd Semester. The dev-only seed adds a demo teacher and students when `NODE_ENV !== 'production'`.

---

# PART E — QR SECURITY

## 40. QR token design

| Option                                  | Security                                      | Complexity                                                               | Replay protection                | Storage                                       | Perf / scale                                |
| --------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------- | --------------------------------------------- | ------------------------------------------- |
| Random opaque token                     | Strong (unguessable)                          | Low                                                                      | Via expiry column                | 1 row per rotation (~240/hr/session) + lookup | DB write per rotation, DB read per scan     |
| **HMAC-signed, time-windowed (chosen)** | Strong (unforgeable without the key)          | Low                                                                      | Window check + unique constraint | **None**                                      | CPU-only verify (µs), horizontally scalable |
| JWT                                     | Strong                                        | Medium, and the payload is large (~200+ chars → denser QR, slower scans) | `exp`/`jti`                      | None                                          | OK, but the bigger QR hurts scanning        |
| TOTP-style (client-generated)           | Weak if the secret reaches the teacher device | Medium                                                                   | Window                           | None                                          | Good, but the secret leaves the server      |

**Chosen format (MVP):** `KAV1.<b64url(sessionId 16B ‖ windowIndex u32)>.<b64url(HMAC-SHA256(key, "KAV1"‖payload))[:16B]>` ≈ 60 chars.

- `key = HKDF(QR_SIGNING_SECRET, info = sessionId)`: a per-session derived key with nothing extra stored. The server keeps signing, and the teacher device never holds a key.
- `windowIndex = floor((now − session.startedAt) / qrRotationSeconds)`.
- The QR contains **no PII**: an opaque session UUID + counter + MAC.

## 41. QR rotation

- Tokens are **computed on demand**. `GET …/qr` returns the current window's token and `expiresAt = startedAt + (windowIndex+1)·rotation`.
- **Interval:** configurable per session (default 15 s; env `QR_DEFAULT_ROTATION_SECONDS`, allowed 10–120).
- **Clock differences:** only **server time** is used for issuing and validating. The teacher app uses `serverTime` just for its countdown, and the student's clock is irrelevant.

## 42. QR validation (check-in algorithm, in order; the first failure returns)

1. Auth middleware: valid JWT, role STUDENT, user active → `actor.studentId`.
2. Parse format and length → 400 `QR_INVALID`.
3. Recompute the HMAC and `timingSafeEqual` → 400 `QR_INVALID` (audit `CHECKIN_REJECTED` reason=bad_sig, rate-limited logging).
4. Load the session by ID with class → missing → 400 `QR_INVALID`. `status !== ACTIVE` → 409 `SESSION_NOT_ACTIVE`.
5. `currentWindow − tokenWindow ∈ {0, 1}` (**1-window grace** covers scan and network latency, so max token life ≈ 2×rotation ≈ 30 s). A future window → `QR_INVALID`. Anything older → 410 `QR_EXPIRED`.
6. Enrollment `(classId, actor.studentId)` exists with status ACTIVE → else 403 `NOT_ENROLLED`.
7. `status = now ≤ startedAt + lateAfterMinutes ? PRESENT : LATE`. `checkInTime = now()` (DB/server).
8. Transaction: `INSERT … ON CONFLICT ("sessionId","studentId") DO NOTHING RETURNING *`. If there's no row, fetch the existing one → 200 `alreadyRecorded:true`. Otherwise audit `ATTENDANCE_CREATED` with metadata `{source:'QR_SCAN', window, ip, deviceInstallId?, clientRequestId}` → 201.

## 43. Replay protection

- **Expired replay:** the window check rejects a token after ≤ 2 rotations.
- **Same-student replay:** the unique constraint makes it an idempotent no-op.
- **Cross-session reuse:** the session ID is inside the MAC, so a token can't be moved to another session.
- **Forgery:** HMAC with a server-only secret.
- **After end:** the session status check.
- Residual: a token _is_ valid for every enrolled student during its ≤ 30 s life. That is the inherent trade-off of one shared QR (§45).

## 44. Duplicate protection

- DB `UNIQUE(sessionId, studentId)` is the guarantee.
- The idempotent `ON CONFLICT DO NOTHING` means concurrent double-taps and network retries yield one row and a consistent 200.
- The scanner locks while a request is in flight (client UX only).
- ABSENT generation on end uses `INSERT … SELECT … ON CONFLICT DO NOTHING`, so it never overwrites real check-ins.
- Concurrent scans from many students contend only on distinct rows; a burst of 60 is trivial for Postgres.

## 45. Anti-cheating analysis

| Threat                 | Attack                                                     | Mitigation (MVP)                                                                                                       | Backend                           | Mobile                                                     | Remaining limitation                                                                                                                                      |
| ---------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Screenshot sharing     | Photo of QR sent to an absent friend                       | 15 s rotation + 1-window grace → ≤ ~30 s usefulness; teacher head-count vs Present count                               | window validation                 | QR display never shows an expired token                    | Real-time forwarding within 30 s still works; Phase 2/4: device binding, geofence/BLE proximity, randomized "show-your-screen" spot checks                |
| QR forwarding (live)   | Friend in class streams QR via video call                  | Same as above; audit flags many check-ins from one IP/device install                                                   | log IP + deviceInstallId in audit | send an `X-Device-Install-Id` random UUID from SecureStore | **QR cannot prove physical presence.** Proximity (GPS/BLE/Wi-Fi SSID) is Phase 4                                                                          |
| Replay                 | Reuse an old token                                         | Window check; session in MAC                                                                                           | ✓                                 | —                                                          | None beyond the grace window                                                                                                                              |
| Duplicate check-in     | Spam submit                                                | Unique constraint + idempotency + rate limit                                                                           | ✓                                 | lock scanner                                               | —                                                                                                                                                         |
| Impersonation          | Check in as another student                                | Identity **only** from the JWT; body has no studentId                                                                  | ✓                                 | —                                                          | Credential sharing (a friend logs in as me on their phone). Phase 2 device binding (one active device per student, rebind with cooldown/teacher approval) |
| API manipulation       | Change status/sessionId/studentId in the request           | Server derives everything: status computed, sessionId from signed token, studentId from JWT; zod strips unknown fields | ✓                                 | —                                                          | —                                                                                                                                                         |
| Unauthorized access    | Student calls teacher endpoints; teacher A reads B's class | role middleware (403) + ownership-scoped queries (404)                                                                 | ✓                                 | UI hides, cosmetic only                                    | —                                                                                                                                                         |
| Brute-force tokens     | Guess MACs                                                 | 128-bit MAC + rate limit 10/min/user                                                                                   | ✓                                 | —                                                          | —                                                                                                                                                         |
| Rooted/emulated device | Automate check-in                                          | Out of MVP scope; Phase 2 Play Integrity attestation                                                                   | —                                 | —                                                          | Accepted risk                                                                                                                                             |

---

# PART F — SECURITY

## 46. Authentication security

- Argon2id hashing.
- Generic login errors prevent account enumeration. Registration unavoidably reveals whether an email is taken, and it is rate-limited.
- Login throttle: 5 attempts per 15 min per IP+email, plus a soft lockout (exponential delay) after 10 failures per account.
- Short-lived access tokens, rotating hashed refresh tokens with reuse detection, and revocation on password change or deactivation.
- Secrets are ≥ 32 bytes and come only from env. A separate `JWT_SECRET` and `QR_SIGNING_SECRET` are mandatory; `JWT_REFRESH_SECRET` is not needed because refresh tokens are opaque.

## 47. API security (Express)

- `helmet()`.
- `cors({ origin: CORS_ORIGIN list })`. Native mobile doesn't need CORS; this matters for Phase 3 web.
- `express.json({ limit: '100kb' })`.
- `app.set('trust proxy', 1)` (Render) so rate limits see the real IP.
- `x-powered-by` disabled.
- Request ID middleware.
- zod on every input. Prisma parameterizes all queries, and `$queryRaw` is used only with tagged templates.
- No stack traces in production.
- HTTPS enforced by the host, with HSTS via helmet.
- `npm audit` + Dependabot in CI.

## 48. RBAC, 49. Resource ownership

See §20–21. Ownership helpers live in `src/policies/ownership.ts` and are used by every service. Unit tests cover every helper, and an integration IDOR matrix covers every route (§67).

## 50. Rate limiting

`express-rate-limit` with the in-memory store (acceptable for a single instance; move to Postgres- or Redis-backed stores only when scaling to more than one instance).

**As built:** a whole school usually reaches the API from **one public IP** (school Wi-Fi NAT). Per-IP limits
are therefore only high backstops; the real limits are keyed per user, per email or per refresh token.
`test/integration/rate-limits.test.ts` checks 70 students registering and checking in from one IP.

| Scope                  | Limit                                                        |
| ---------------------- | ------------------------------------------------------------ |
| Global (all `/api/v1`) | 6000 / min / IP (backstop)                                   |
| `/auth/login`          | 10 / 15 min / email, plus 2000 / 15 min / IP backstop        |
| `/auth/register`       | 1000 / hour / IP (a whole class registers from school Wi-Fi) |
| `/auth/refresh`        | 20 / 15 min / refresh token, plus 5000 / 15 min / IP         |
| `/attendance/check-in` | 10 / min / user, plus 2000 / min / IP backstop               |
| `/students/lookup`     | 30 / min / user                                              |
| `…/qr`                 | 30 / min / user                                              |

## 51. Audit logging

`audit.service.record(tx, {actor, action, entityType, entityId, metadata, ip})` runs **inside the same transaction** as the change, so there is no orphaned or missing audit. It covers every action in the `AuditAction` enum. Metadata holds before/after diffs for updates. Passwords and tokens are never logged. `CHECKIN_REJECTED` logging is sampled or rate-limited to avoid log flooding. Teachers can see the audit trail for their own sessions (`GET /attendance/sessions/:id/audit`, Phase 2 UI).

## 52. Device binding (evaluation → **Phase 2**)

- **Design:** `Device{id, studentId, deviceIdentifier (install UUID), devicePublicKey (Ed25519 from expo-secure-store/Keystore), isActive, registeredAt, lastUsedAt}`. At check-in, the device signs `(qrToken ‖ timestamp)`, and the server verifies that the key belongs to the student's single active device.
- **Security gain:** blocks credential sharing across phones and makes impersonation costly.
- **UX cost:** lost or replaced phones need a rebind flow (cooldown, teacher or admin approval, which works best once admin exists in Phase 3), shared or borrowed phones break, and there are more support tickets.
- **MVP compromise:** send a random `deviceInstallId` header and record it in the check-in audit metadata. Teachers can later see "3 students checked in from one device". This costs almost nothing and gives Phase 2 real data to size the problem.

---

# PART G — DEPLOYMENT

## 53. Free hosting architecture

```
Android (Expo build, APK/AAB) ──HTTPS──► Render Web Service (Express, Singapore, free)
                                               │ TLS, pooled connection
                                               ▼
                                         Neon Postgres (ap-southeast-1, free)
GitHub (code, Actions CI, nightly backup cron, keep-warm ping)
```

## 54. Free-tier provider comparison

**Based on last-known terms (mid-2026). Step 25 of implementation re-verifies each provider's pricing page before provisioning, because free tiers change often.**

| Provider                 | Free offering (to re-verify)                                                            | Key limits                                                                             | Verdict                                          |
| ------------------------ | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **Render** (web service) | Free instance, ~750 instance-hrs/mo, HTTPS, env vars, Git deploy                        | **Spins down after ~15 min idle; ~30–60 s cold start**; 512 MB RAM; no persistent disk | ✅ **Backend pick**                              |
| Railway                  | Trial credit only, then paid (~$5/mo)                                                   | not free long-term                                                                     | ❌ (good paid migration target)                  |
| Fly.io                   | No free tier for new orgs (pay-as-you-go)                                               | card required                                                                          | ❌ for ₱0                                        |
| Koyeb                    | Has offered a small free instance (region-limited)                                      | verify availability                                                                    | Backup option                                    |
| **Neon**                 | Free Postgres, ~0.5 GB storage, autosuspend (scale-to-zero), branching, built-in pooler | **cold resume ~0.5–2 s**; limited compute hours; short PITR window                     | ✅ **DB pick**                                   |
| Supabase (DB only)       | 500 MB Postgres                                                                         | **project pauses after ~7 days of inactivity**, 2 free projects                        | Alternative. Pausing over school breaks is risky |

Stack combination: Render sleep + Neon suspend means the first request after idle can take ~60 s. Mitigations are in §60.

## 55. Backend deployment (Render)

- Build: `npm ci && npm run -w apps/backend build && npx -w apps/backend prisma generate`.
- Pre-deploy / start: `npx prisma migrate deploy && node dist/server.js`. The Render free tier may lack a pre-deploy hook, so run migrations at start; `migrate deploy` is idempotent and uses an advisory lock.
- Health check path `/health`. Node 20 LTS.
- `render.yaml` blueprint is committed for reproducibility. Nothing in the code is Render-specific, so the same `npm run build` / `npm start` commands run on Railway, Fly or a VPS.

## 56. PostgreSQL deployment (Neon)

- Create the project in `ap-southeast-1`.
- `DATABASE_URL` = pooled (`-pooler` host, `?sslmode=require&pgbouncer=true&connection_limit=5`).
- `DIRECT_URL` = direct host, used for migrations.
- A separate Neon branch serves as staging.
- Local development uses embedded PostgreSQL 17 (`npm run db -w @kavriel/backend`, port 5433) with the same schema. No Docker.

## 57. Environment variables (`apps/backend/.env.example`, never commit `.env`)

```env
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://kavriel:kavriel@localhost:5432/kavriel
DIRECT_URL=postgresql://kavriel:kavriel@localhost:5432/kavriel
JWT_SECRET=                 # ≥32 random bytes (openssl rand -base64 48)
JWT_ACCESS_TTL=15m
REFRESH_TOKEN_TTL_DAYS=30
QR_SIGNING_SECRET=          # ≥32 random bytes, distinct from JWT_SECRET
QR_DEFAULT_ROTATION_SECONDS=15
QR_GRACE_WINDOWS=1
TEACHER_SIGNUP_CODE=        # shared out-of-band with teachers
SCHOOL_TIMEZONE=Asia/Manila
SESSION_EARLY_START_MINUTES=15
SESSION_MAX_DURATION_MINUTES=240
CORS_ORIGIN=                # comma-separated; empty for mobile-only
LOG_LEVEL=info
```

Mobile: `apps/mobile/.env` → `EXPO_PUBLIC_API_URL=https://<render-app>.onrender.com/api/v1`. This is the only public value, and there are no secrets in the app bundle. `env.ts` validates everything with zod at boot and fails fast.

## 58. Prisma migrations

- **Dev:** `npx prisma migrate dev --name <change>`. Use `--create-only` when hand-adding raw SQL (partial index, CHECKs), then review the SQL in PR.
- **Production:** `npx prisma migrate deploy` only.
- **Never** run `migrate reset`, `db push` or `migrate dev` against production. CI guards this: the deploy script refuses `migrate reset` when `NODE_ENV=production`.
- Every migration is committed. Destructive changes use expand/contract (add → backfill → switch → drop in a later release).

## 59. HTTPS

Render terminates TLS with auto certificates, and Neon requires `sslmode=require`. HSTS comes from helmet. Android release builds keep `usesCleartextTraffic=false`; dev builds allow LAN HTTP only through the Expo dev config.

## 60. Monitoring and cold starts

- pino JSON logs go to Render logs.
- `GET /health` is monitored by **UptimeRobot free** (5-min checks). That also helps keep the service warm, **but** Render counts instance hours, and 24/7 warmth uses ~730 of 750 hours. Instead:
  - Run a **GitHub Actions cron ping only during school hours** (e.g. every 10 min, Mon–Sat 06:30–18:00 PHT).
  - The app pings `/health` on launch and foreground.
- Error tracking: Sentry free tier (Phase 2; optional in MVP behind the env DSN).
- Basic metrics: request duration logged per route, and slow-query logging via a Prisma `$on('query')` threshold in dev.

## 61. Backup strategy

- Neon's free point-in-time restore window is short, so it isn't sufficient.
- **Nightly GitHub Actions job:** `pg_dump --format=custom` over `DIRECT_URL`, **encrypted with `age`** (public key in the repo, private key kept offline by the owner), uploaded as a workflow artifact with 30-day retention, in a **private repo**. The data is personal data, so it must never go unencrypted to artifacts.
- Monthly restore drill to a Neon branch or the local embedded Postgres (documented runbook `docs/restore.md`).

## 62. Migration strategy (outgrowing free tier)

- **Backend:** plain Node build/start commands → Render paid / Railway / Fly / VPS by changing env vars only.
- **DB:** `pg_dump | pg_restore` into any Postgres (Neon paid, Supabase, RDS, Cloud SQL). There are no proprietary extensions.
- **Scaling to more than one instance:** rate-limit store → Postgres or Redis. Everything else is stateless (HMAC QR, JWT).
- **Phase 3 admin web:** a new CORS origin plus a `SCHOOL_ADMIN` role row.
- **Multi-school (Phase 4):** add `School`, add a `schoolId` FK to User/Subject/ClassSection/AcademicYear via expand/contract migrations, backfill existing rows to a default school, and add tenant scoping to the policy layer. Deferring this is a conscious trade-off: tenancy is cheap to add while there is one school's data, and adding it now would complicate every MVP query.

## 63. Estimated monthly cost

| Item                                                                                                     | Cost         |
| -------------------------------------------------------------------------------------------------------- | ------------ |
| Render free web service                                                                                  | ₱0           |
| Neon free Postgres                                                                                       | ₱0           |
| GitHub (private repo, Actions within free minutes)                                                       | ₱0           |
| UptimeRobot / Sentry free                                                                                | ₱0           |
| Expo EAS Build free tier (limited builds/month) or local `eas build --local` / Gradle                    | ₱0           |
| **Monthly total**                                                                                        | **₱0**       |
| One-time: Google Play developer account (~US$25) if publishing to the Play Store; sideloaded APK is free | one-time     |
| Optional custom domain                                                                                   | ~₱600–900/yr |

---

# PART H — TESTING

## 64. Unit (Vitest)

- QR: sign/verify round-trip, tampered MAC, wrong session, window math, grace boundaries (window 0/1/2, future window), rotation config.
- Auth: hashing, JWT issue/verify/expiry, refresh rotation and reuse detection.
- Attendance rules: PRESENT/LATE threshold boundaries, state-transition table.
- Schedule overlap function: adjacent (touching) intervals are not a conflict, contained, identical, different days.
- Ownership helpers, CSV escaping/injection, percentage formula (EXCUSED excluded, dropped students).

## 65. Integration (Vitest + Supertest + real Postgres)

- Vitest global setup starts a throwaway embedded Postgres per run (or uses `TEST_DATABASE_URL`). Each test file uses a fresh schema via `prisma migrate deploy` into a unique schema, or a truncate-between-tests helper.
- Coverage: API → DB for each module; check-in → enrollment and session checks; end → ABSENT generation; lock immutability; FK Restrict and CHECK constraint behaviour; partial unique active session; concurrent check-ins (`Promise.all` of 20 identical requests → exactly one row).

## 66. E2E

- **API-level E2E (CI, deterministic):** a script covering the full flow in brief §55. Teacher register → student register → subject → class → enroll → schedule → start → QR → student check-in → teacher records show it → end → lock → student `/attendance/my` shows it. A fake clock (`vi.useFakeTimers` + an injectable `now()` in `lib/time.ts`) tests expiry.
- **Mobile E2E: Maestro** flows on an Android emulator against a local backend: login (both roles), start session, and a QR screen snapshot. For the scan itself, a debug-only "paste token" input in dev builds, since camera injection on emulators is unreliable.
- Mobile component tests: `jest-expo` + React Native Testing Library for the scanner state machine and apiClient refresh logic.

## 67. Security testing

- **IDOR matrix:** automated tests with 2 teachers and 2 students hit every route with another user's IDs and expect 404/403.
- Expired QR, QR replay across sessions, tampered payload, a student calling teacher routes, a teacher calling check-in.
- JWT manipulation (`alg:none`, wrong signature, expired, role claim edited → server re-reads role from the DB).
- Refresh-token reuse, rate-limit trips (429), mass-assignment (extra fields ignored), SQL injection strings in search inputs, CSV injection.
- `npm audit`, plus an optional OWASP ZAP baseline scan against staging.

## 68. Performance testing

- k6 script: 60 virtual students check in within 30 s against one session, plus the teacher polling every 3 s. Targets: p95 < 500 ms (warm), 0 errors, and exactly 60 rows.
- Also measure cold-start latency on Render + Neon and document it.

## 69. Database testing

- `prisma validate` + `prisma migrate diff` in CI (migrations match the schema).
- Constraint tests (unique, FK Restrict, CHECK, partial index).
- Seed idempotency (run twice).
- Restore drill (§61).
- `EXPLAIN` checks on the report queries against 10k seeded attendance rows.

---

# PART I — ROADMAP

## 70. Phase 1: Mobile MVP

Everything in §3. Includes the baseline security that the brief listed in Phase 2 but that is cheap and essential now: rate limiting, audit logging, replay protection, idempotency.

## 71. Phase 2: Security and reliability

Device binding + Play Integrity, SSE live updates, Sentry, an audit-trail UI, suspicious-pattern flags (one device or IP → many students), auto-end of stale sessions via a scheduled job, performance tuning, better offline messaging, and push-to-refresh.

## 72. Phase 3: School Admin web

`apps/admin-web` (Next.js + React + TS + Tailwind) reuses `packages/shared` schemas and types, calls the **same Express API**, and uses a cookie- or BFF-held refresh token.

- Add the `SCHOOL_ADMIN` role row and extend the policy map.
- Admin endpoints under `/api/v1/admin/*`: manage teachers and students (create, verify student numbers, deactivate), institution subjects (`ownerTeacherId NULL`, with a partial unique index on `subjectCode`), academic years and semesters, class reassignment, unlocking sessions, school-wide reports, settings, and device-rebind approvals.
- No new backend service.

## 73. Phase 4: Advanced features

Geofence/BLE/Wi-Fi proximity checks, face verification (needs a DPIA), offline attendance with signed, time-bounded, device-bound, server-reconciled records, a parent portal, push notifications, multi-campus / multi-school (§62), LMS integration, advanced analytics, billing.

---

# PART J — IMPLEMENTATION ORDER (original plan)

> Superseded by [BUILDPLAN.md](BUILDPLAN.md), which tracks the as-built sequence and status. Steps below that
> mention restructuring the prototype or Docker no longer apply.

1. **Project setup**
   - `git init` and commit the prototype as-is.
   - Create the npm-workspaces monorepo.
   - Move the Expo app into `apps/mobile`: `app/`, `src/`, `app.json`, `babel.config.js`, `tsconfig.json`, and the `package.json` deps. Keep path alias `@/`.
   - Create `apps/backend` and `packages/shared`.
   - Add ESLint, Prettier and tsconfig bases, plus the CI workflow.
2. **PostgreSQL (no Docker):** `embedded-postgres` dev script (`npm run db`, `db:stop`, `db:reset`) and a Vitest global setup that starts a throwaway cluster for integration tests. ✅ Done.
3. **Prisma:** init, `env.ts`, and the Prisma singleton (`config/database.ts`).
4. **Database schema:** write §39. Run `migrate dev --create-only`, append the raw SQL, apply it, write `seed.ts`, and add `docs/erd.md`.
5. **Authentication:** `lib/password.ts`, `lib/jwt.ts`, the RefreshToken flow, and the auth module + tests.
6. **RBAC:** `auth.middleware`, `role.middleware`, `policies/ownership.ts`, and the shared permissions map.
7. **Express architecture:** `app.ts` factory, helmet/cors/json limits, request ID, `error.middleware`, rate-limit presets, `/health`, `routes.ts` under `/api/v1`.
8. **Teacher module:** profile get/update. 9. **Student module:** profile + `lookup`.
9. **Subjects** → 11. **Classes** → 12. **Enrollment** → 13. **Schedules** (with the overlap service and `/schedules/today` in the school TZ). Each module ships with integration tests and audit calls.
10. **Attendance session** lifecycle + the start-window rule + the partial unique index test.
11. **QR generation** (`modules/qr`: HKDF key, sign, window math; `GET …/qr`).
12. **QR validation** (verify + window/grace).
13. **Student check-in** (the §42 algorithm, idempotent insert, rate limit).
14. **Attendance records** (roster + `since`, manual mark and PATCH, end→ABSENT, lock).
15. **Mobile foundation + teacher monitoring**, in `apps/mobile`:
    - Delete `src/lib/supabase.ts`, `src/lib/localDb/`, `src/db/`, `src/features/sync/`, `src/features/attendance/outbox.ts`, `app/(admin)/`, `app/checkin/`, `StudentQR.tsx`, `printIds.ts`, `SyncBadge.tsx`, `database.types.ts`, `supabase/`.
    - Remove `@supabase/supabase-js`, `expo-sqlite` and `react-native-url-polyfill`. Add TanStack Query, `expo-secure-store` and `expo-keep-awake`.
    - Build `src/api/apiClient.ts` and rewrite `AuthProvider` for JWT.
    - Set up the role-based router (§11).
    - Build the teacher screens and the QR display (update `SessionQR.tsx` to a raw token) with polling.
16. **Student screens + scanner** (reuse `QRScanner.tsx` with a `paused` prop) and **attendance history + summary**.
17. **Reports:** backend aggregate + CSV endpoint. The mobile Reports screen adapts `features/reports/reportData.ts` and `exportReport.ts` (CSV via expo-sharing) to the API.
18. **Audit logging review:** verify every `AuditAction` is emitted, then add the audit query endpoint.
19. **Security hardening:** IDOR matrix, rate-limit tuning, dependency audit, and a secrets check.
20. **Testing:** complete the unit, integration, API E2E, Maestro flows and k6 runs. Update `README.md` for the new architecture.
21. **Free deployment:**
    - **Re-verify the free-tier terms** of Render, Neon and alternatives.
    - Create Neon (Singapore) and the Render service (`render.yaml`).
    - Set env vars and deploy (`migrate deploy`), set up the keep-warm cron, the backup workflow and UptimeRobot.
    - Build the Android APK via EAS (preview profile) with `EXPO_PUBLIC_API_URL`, then run a smoke test on real devices in a classroom-like setup (2 phones, projector/phone QR at 3 m).

## Verification (end-to-end acceptance for the MVP)

1. `npm run db -w @kavriel/backend` (separate terminal), then `npm run -w apps/backend prisma:migrate && npm run -w apps/backend seed && npm run -w apps/backend dev`.
2. `npm test -w apps/backend`: unit + integration + API E2E + IDOR matrix all pass.
3. `npm run -w apps/mobile android` on an emulator and a physical phone. Teacher: register with the code → subject → class → enroll the student by number → schedule → Start Attendance → QR rotates every 15 s with a matching countdown.
4. Second phone as the student: scan → "Attendance recorded" within ~1 s and the teacher count increments within ≤ 3 s. Rescan → "Already recorded". Wait more than 30 s with a photo of an old QR → "QR expired". A non-enrolled student → "not enrolled".
5. Airplane mode during a scan → no success is shown. After reconnect, the reconcile shows the true state.
6. End → absentees marked. Edit one to EXCUSED with remarks → audit row exists. Lock → edits return 409.
7. Reports → CSV export opens in Sheets/Excel with correct percentages.
8. k6 burst passes. Deployed staging passes the same smoke test over HTTPS, and a cold-start time is recorded.

## Privacy (RA 10173, Data Privacy Act of 2012): design measures and items for legal review

- **Minimization:**
  - Collect only name, student or employee number, email, optional contact number and year level.
  - No photos, GPS or device fingerprinting in the MVP. The install UUID is random and not a hardware ID.
- **Purpose limitation:** data is used only for attendance. This is stated in a privacy notice shown at registration, with an explicit acknowledgement.
- **Access control:** RBAC + ownership.
- **Encryption:** TLS in transit, provider at-rest encryption, backups encrypted with `age`, and tokens in the device Keystore via SecureStore.
- **Access and correction:** users view and edit their profile. Corrections are audited.
- **Erasure:** deactivation + anonymization (§38), balanced against the institution's record-retention obligations.
- **Retention:** proposed defaults are attendance for the academic year + N years per school policy and audit logs for 2 years, with a purge job in Phase 2.
- **Breach readiness:** the audit log and access logs, plus a documented incident runbook.
- **Needs legal/privacy review (no compliance claim is made):**
  1. Lawful basis for processing (consent vs. the school's legitimate interest or contract).
  2. **Minors:** for K–12 users under 18, parental consent and age-appropriate notices.
  3. NPC registration and DPO designation by the deploying institution.
  4. **Cross-border transfer:** free-tier hosting is outside the PH (e.g. Singapore), so vendor DPAs and transfer safeguards are needed.
  5. Retention periods.
  6. The 72-hour breach notification process.
  7. Who is the personal information controller (school) vs. processor (Kavriel operator).
  8. The privacy notice and terms text.
  9. A DPIA before Phase 4 biometrics or location features.
