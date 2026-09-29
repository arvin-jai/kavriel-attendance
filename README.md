# Kavriel Attendance

QR attendance for schools. A teacher shows a rotating QR code on their phone; students scan it with the
Kavriel app; the API verifies the student, their enrollment, the session and the code, and records
attendance exactly once. Teachers watch attendance arrive live, correct it, end and lock the session, and
export CSV reports.

| Part              | Stack                                                                               |
| ----------------- | ----------------------------------------------------------------------------------- |
| `apps/mobile`     | React Native + Expo SDK 57 (Expo Router), TypeScript. Android first, iOS-compatible |
| `apps/backend`    | Node.js + Express 5 + TypeScript, Prisma 7, PostgreSQL 17                           |
| `packages/shared` | zod schemas, enums and API types used by both                                       |

MVP roles are **Teacher** and **Student**. A School Admin web app (Phase 3) will use the same API and database.

## Quick start (no Docker)

```bash
npm install
cp apps/backend/.env.example apps/backend/.env   # fill JWT_SECRET, QR_SIGNING_SECRET, TEACHER_SIGNUP_CODE
npm run db                                       # PostgreSQL 17 on :5433 (keep running)
npm run prisma:migrate -w @kavriel/backend
npm run seed -w @kavriel/backend                 # demo: teacher@kavriel.test / student1@kavriel.test, password123
npm run dev:backend                              # API on http://localhost:4000
npm run dev:mobile                               # Expo dev server
```

Full instructions, demo data and troubleshooting: [docs/HANDOFF.md](docs/HANDOFF.md).

## Commands

| Command                                                       | What it does                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------ |
| `npm run lint` / `npm run typecheck` / `npm run format:check` | static checks across all workspaces                          |
| `npm test`                                                    | backend unit + integration tests (starts its own PostgreSQL) |
| `npm run build:backend`                                       | bundle the API to `apps/backend/dist`                        |
| `npm run db` / `npm run db:stop`                              | start / stop the local PostgreSQL                            |

## Documentation

- [docs/BLUEPRINT.md](docs/BLUEPRINT.md): product, architecture, API, database (3NF + Prisma schema), QR security, deployment, testing
- [docs/BUILDPLAN.md](docs/BUILDPLAN.md): implementation sequence, status, Definition of Done, roadmap
- [docs/HANDOFF.md](docs/HANDOFF.md): how to run, operate and continue the project; known limitations
- [docs/PIPELINE.md](docs/PIPELINE.md): CI, deployment (Render + Neon), migrations, EAS builds, backups

## Dependency notes

- `react`/`react-dom` are pinned via root `overrides` so the monorepo holds exactly one React (Prisma Studio,
  pulled in by the `prisma` CLI, would otherwise hoist a newer React than Expo expects).
