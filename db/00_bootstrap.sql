-- snagdash local replica — bootstrap (run inside database "snagdash")
-- Recreates the Supabase-provided environment the app schema depends on:
-- the extensions schema, the private schema, and GUC-backed auth.* shims.

\set ON_ERROR_STOP on

-- default "public" carries Homebrew grants we don't want; start clean
drop schema if exists public cascade;

create schema public;
create schema private;
create schema extensions;
create schema auth;
create schema storage;

comment on schema public is 'standard public schema';

-- ---------------------------------------------------------------------------
-- Extensions (match live: pgcrypto 1.3, pg_trgm 1.6, uuid-ossp 1.1),
-- all in the "extensions" schema because every app function runs
-- SET search_path TO '' and calls e.g. extensions.gen_random_uuid().
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto      with schema extensions;
create extension if not exists pg_trgm       with schema extensions;
create extension if not exists "uuid-ossp"   with schema extensions;

-- ---------------------------------------------------------------------------
-- auth.* shims — Supabase's GoTrue provides these. Here they read the
-- request-scoped GUC "request.jwt.claims" that the app's DB layer will set
-- per request (SET LOCAL + set_config). Signatures match Supabase.
-- ---------------------------------------------------------------------------
create or replace function auth.jwt() returns jsonb
  language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb;
$$;

create or replace function auth.uid() returns uuid
  language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;

create or replace function auth.role() returns text
  language sql stable as $$
  select coalesce(auth.jwt() ->> 'role', nullif(current_setting('request.jwt.claim.role', true), ''));
$$;

create or replace function auth.email() returns text
  language sql stable as $$
  select auth.jwt() ->> 'email';
$$;

-- ---------------------------------------------------------------------------
-- storage.* shims — path helpers used by the attachments bucket policy.
-- foldername('wh/snag/file.jpg')[1] must yield 'wh' (the warehouse_id).
-- ---------------------------------------------------------------------------
create type storage.buckettype as enum ('STANDARD', 'ANALYTICS');

create or replace function storage.foldername(name text) returns text[]
  language sql immutable as $$ select string_to_array(name, '/'); $$;

create or replace function storage.filename(name text) returns text
  language sql immutable as $$ select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)]; $$;

create or replace function storage.extension(name text) returns text
  language sql immutable as $$
  select nullif(split_part(storage.filename(name), '.', array_length(string_to_array(storage.filename(name), '.'), 1)), storage.filename(name));
$$;

-- ---------------------------------------------------------------------------
-- Role grants Supabase applies by default
-- ---------------------------------------------------------------------------
grant usage on schema public     to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;
grant usage on schema storage    to anon, authenticated, service_role;
grant usage on schema auth       to anon, authenticated, service_role;
grant usage on schema private    to authenticated;
grant execute on all functions in schema extensions to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
