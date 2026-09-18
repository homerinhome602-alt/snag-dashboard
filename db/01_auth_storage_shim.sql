-- Minimal auth/storage tables.
-- auth.users is now a bare identity anchor (id + email) — there is no
-- password, token, or confirmation state anywhere in the app; sign-in is
-- email-only (src/lib/auth/service.ts). It exists only so public.profiles.id
-- has an FK target and so inserting a row here still fires
-- on_auth_user_created / handle_new_user() to provision a first-time sign-in
-- from public.invitations (see db/20_post.sql, db/10_schema.sql).
-- auth.identities (GoTrue's per-provider link table) is gone — nothing reads
-- it since there is no password/OAuth provider to distinguish.

\set ON_ERROR_STOP on

create table auth.users (
    id uuid not null,
    email text,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    constraint users_pkey primary key (id)
);

-- storage.buckets ------------------------------------------------------------
create table storage.buckets (
    id text not null,
    name text not null,
    owner uuid,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    public boolean default false,
    avif_autodetection boolean default false,
    file_size_limit bigint,
    allowed_mime_types text[],
    owner_id text,
    type storage.buckettype not null default 'STANDARD',
    versioning_status text not null default 'DISABLED',
    constraint buckets_pkey primary key (id)
);

-- storage.objects ----------------------------------------------------------
create table storage.objects (
    id uuid not null default extensions.gen_random_uuid(),
    bucket_id text references storage.buckets(id),
    name text,
    owner uuid,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    last_accessed_at timestamptz default now(),
    metadata jsonb,
    path_tokens text[] generated always as (string_to_array(name, '/')) stored,
    version text,
    owner_id text,
    user_metadata jsonb,
    archived_at timestamptz,
    is_delete_marker boolean not null default false,
    is_versioned boolean not null default false,
    constraint objects_pkey primary key (id)
);
create unique index bucketid_objname on storage.objects using btree (bucket_id, name);

grant all on all tables in schema storage to anon, authenticated, service_role;
grant all on all tables in schema auth to anon, authenticated, service_role;
