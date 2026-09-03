# Frozen Warehouse Launch Readiness

Snag-tracking for cold-storage warehouse commissioning. Reporters (HVAC / Operations /
Warehouse Admin) raise defects found while a warehouse is being built and pulled to
temperature; resolvers (Program Manager (Infra) / PMC / PMO) drive them closed before
go-live. A readiness thermometer and burn-up chart per warehouse show whether opening
day is at risk.

Next.js 16 (App Router) · TypeScript · Tailwind 4 · shadcn/ui on `@base-ui/react` ·
self-hosted PostgreSQL 17 (`pg`) · `exceljs` for import/export.

> Originally built on Supabase; migrated to a self-hosted Postgres with hand-rolled
> auth and filesystem storage on 3 Sep 2026. See **`CLAUDE.md` → Architecture**.

## Setup

```bash
# 1. Database — Postgres 17 + pg_cron on port 5433
brew install postgresql@17 pg_cron
#    edit /opt/homebrew/var/postgresql@17/postgresql.conf:
#      port = 5433
#      shared_preload_libraries = 'pg_cron'
#      cron.database_name = 'snagdash'
brew services start postgresql@17

# 2. Schema + the committed sample data (3 users, 4 warehouses, 10 snags, images)
db/build.sh --with-data     # or just `db/build.sh` for an empty database

# 3. Env
cp .env.example .env.local  # then fill in AUTH_SECRET etc. — see below

# 4. Run
npm install
npm run dev                 # http://localhost:3000
```

### `.env.local`

| var | purpose |
|---|---|
| `DATABASE_URL` | `postgresql://authenticator@localhost:5433/snagdash` |
| `AUTH_SECRET` | signs the session cookie **and** attachment signed-URLs (rotating logs everyone out) |
| `STORAGE_DIR` | where the `attachments` bucket lives on disk |
| `AUTH_AUTOCONFIRM` | `true` in dev — new sign-ups skip email confirmation |
| `MAIL_PROVIDER` | `console` in dev — reset/confirm links are logged, not emailed |

## Scripts

| | |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` | ESLint |
| `db/build.sh [--with-data]` | rebuild the `snagdash` schema from `db/*.sql` |

## Layout

```
db/                     schema SQL + build.sh  (see db/README.md)
src/lib/data/           createClient() / updateSession() — same surface as the old Supabase client
src/lib/db/             pg pool + per-request role/JWT-claims scoping
src/lib/pgrest/         the supabase-js-shaped query/rpc builder over pg
src/lib/auth/           session cookie, bcrypt, GoTrue-shaped methods, dev mailer
src/lib/storage/        filesystem bucket + HMAC signed URLs
src/app/api/            /me, /rpc, /attachments  (the client's only DB path)
src/app/(app)/          the authenticated app
PLAN.md / DESIGN.md     behaviour + schema / visual spec
```
