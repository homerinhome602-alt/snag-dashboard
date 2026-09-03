#!/bin/bash
# Build (or rebuild) the local Postgres 17 replica this app runs against.
# Drops and recreates the "snagdash" database, then applies db/*.sql in order.
#
#   db/build.sh              # schema only
#   db/build.sh --with-data  # also load db/seed/*.sql and copy db/seed/attachments/
#                            #   into STORAGE_DIR (default ./.storage/attachments)
#
# Prereqs: postgresql@17 + pg_cron on PGPORT (default 5433); roles anon,
# authenticated, service_role, authenticator (see below — created if missing).
set -euo pipefail

BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}"
PGPORT="${PGPORT:-5433}"
DB="${PGDATABASE:-snagdash}"
HERE="$(cd "$(dirname "$0")" && pwd)"
PSQL="$BIN/psql -h localhost -p $PGPORT -v ON_ERROR_STOP=1 -X -q"

echo "==> roles"
$BIN/psql -h localhost -p "$PGPORT" -d postgres -X -q <<'SQL'
do $$ begin
  if not exists (select from pg_roles where rolname='anon')          then create role anon nologin noinherit; end if;
  if not exists (select from pg_roles where rolname='authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select from pg_roles where rolname='service_role')  then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select from pg_roles where rolname='authenticator') then create role authenticator login noinherit; end if;
end $$;
grant anon, authenticated, service_role to authenticator;
SQL

echo "==> (re)create database $DB"
$BIN/dropdb   -h localhost -p "$PGPORT" --if-exists --force "$DB"   # --force: kick any open sessions (e.g. a running dev server)
$BIN/createdb -h localhost -p "$PGPORT" "$DB"

for f in "$HERE"/00_bootstrap.sql "$HERE"/01_auth_storage_shim.sql "$HERE"/10_schema.sql; do
  echo "==> $(basename "$f")"
  $PSQL -d "$DB" -f "$f"
done

if [ "${1:-}" = "--with-data" ]; then
  # load in FK order: auth.users -> storage -> public
  for f in "$HERE"/seed/01_auth-data.sql "$HERE"/seed/02_storage-data.sql "$HERE"/seed/10_public-data.sql; do
    [ -f "$f" ] && { echo "==> seed: $(basename "$f")"; $PSQL -d "$DB" -f "$f"; }
  done
  # reset snag_counter to max(serial_no) in case the dump predates a raise/delete
  $PSQL -d "$DB" -c "update warehouses w set snag_counter = coalesce((select max(serial_no) from snags s where s.warehouse_id = w.id), 0);"
  # copy attachment blobs into STORAGE_DIR
  if [ -d "$HERE/seed/attachments" ]; then
    DEST="${STORAGE_DIR:-$HERE/../.storage}/attachments"
    echo "==> copying attachment blobs -> $DEST"
    mkdir -p "$DEST"
    cp -R "$HERE"/seed/attachments/. "$DEST"/
  fi
fi

echo "==> 20_post.sql (auth trigger + storage policies)"
$PSQL -d "$DB" -f "$HERE/20_post.sql"

echo "==> pg_cron job"
$PSQL -d "$DB" -c "create extension if not exists pg_cron;" \
  -c "select cron.schedule('snag-daily-snapshot','5 0 * * *','select public.refresh_snag_daily_snapshot();') where not exists (select 1 from cron.job where jobname='snag-daily-snapshot');"

echo "==> done — $DB ready on :$PGPORT"
