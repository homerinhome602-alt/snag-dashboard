# Database

This app runs against a **self-hosted PostgreSQL 17** database (`snagdash`),
migrated off Supabase on 3 Sep 2026. These files reproduce the schema from
nothing.

## Files (applied in lexical order)

| File | What it creates |
|---|---|
| `00_bootstrap.sql` | schemas (`public`, `private`, `extensions`, `auth`, `storage`); extensions `pgcrypto` / `pg_trgm` / `uuid-ossp` in the `extensions` schema; GUC-backed `auth.uid()` / `auth.jwt()` / `auth.role()` / `auth.email()`; `storage.foldername()` etc.; role grants |
| `01_auth_storage_shim.sql` | minimal `auth.users` / `auth.identities` / `storage.buckets` / `storage.objects` tables (column lists match the pg_dump COPYs from the old project) |
| `10_schema.sql` | the application schema — 11 tables, 2 views, 18 functions, ~21 RLS policies, 34 indexes, triggers, grants. Pulled from the live Supabase project with `pg_dump --schema=public --schema=private`, minus Supabase-only `ALTER DEFAULT PRIVILEGES … TO anon` lines |
| `20_post.sql` | the `on_auth_user_created` trigger and the two `storage.objects` bucket policies (they live in the gap between the two dump slices) |

## Build

```bash
brew install postgresql@17 pg_cron
# postgresql.conf: port = 5433, shared_preload_libraries = 'pg_cron', cron.database_name = 'snagdash'
brew services start postgresql@17

db/build.sh                 # schema only — empty database
db/build.sh --with-data     # + load db/seed/*.sql and copy db/seed/attachments/ into STORAGE_DIR
```

### `seed/` — committed sample data

`seed/01_auth-data.sql`, `seed/02_storage-data.sql`, `seed/10_public-data.sql` and
`seed/attachments/` are a `pg_dump` of a small working dataset (3 users, 4
warehouses, 10 snags, 15 image files ≈ 900 KB). `--with-data` loads it so a fresh
clone comes up fully populated. `build.sh` then resets `snag_counter` to
`max(serial_no)` per warehouse.

**The seed contains real email addresses and bcrypt password hashes.** Keep this
repo private, or replace `seed/` with scrubbed data before making it public. To
refresh the seed from your local DB:

```bash
pg_dump -h localhost -p 5433 -d snagdash --data-only --no-owner --schema=public --disable-triggers -f db/seed/10_public-data.sql
pg_dump -h localhost -p 5433 -d snagdash --data-only --no-owner --table=auth.users --table=auth.identities -f db/seed/01_auth-data.sql
pg_dump -h localhost -p 5433 -d snagdash --data-only --no-owner --table=storage.buckets --table=storage.objects -f db/seed/02_storage-data.sql
cp -R .storage/attachments/. db/seed/attachments/
```

The app connects as the unprivileged **`authenticator`** role
(`DATABASE_URL` in `.env.local`) and `SET LOCAL ROLE`s into
`anon` / `authenticated` / `service_role` per request, so the schema's RLS
policies apply exactly as they did under PostgREST. See the repo `CLAUDE.md`
("Architecture") for the request path.

## What is deliberately *not* reproduced from Supabase

`ALTER DEFAULT PRIVILEGES … TO anon` (the "REVOKE from anon" footgun),
`supabase_admin`, `pg_stat_statements`, `supabase_vault`, GoTrue's partial
unique indexes on `auth.users`, and storage-internal triggers. GoTrue itself is
replaced by `src/lib/auth`; Supabase Storage by `src/lib/storage` +
`src/app/api/attachments`.
