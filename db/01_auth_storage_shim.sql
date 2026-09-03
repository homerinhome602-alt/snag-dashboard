-- Minimal auth/storage tables — column lists match the pg_dump COPY
-- statements from the live project exactly so the data loads verbatim.
-- Supabase's partial unique indexes and GoTrue-internal triggers are
-- intentionally omitted (dev replica; the app never touches these directly).

\set ON_ERROR_STOP on

-- auth.users (34 data columns + generated confirmed_at) --------------------
create table auth.users (
    instance_id uuid,
    id uuid not null,
    aud character varying(255),
    role character varying(255),
    email character varying(255),
    encrypted_password character varying(255),
    email_confirmed_at timestamptz,
    invited_at timestamptz,
    confirmation_token character varying(255),
    confirmation_sent_at timestamptz,
    recovery_token character varying(255),
    recovery_sent_at timestamptz,
    email_change_token_new character varying(255),
    email_change character varying(255),
    email_change_sent_at timestamptz,
    last_sign_in_at timestamptz,
    raw_app_meta_data jsonb,
    raw_user_meta_data jsonb,
    is_super_admin boolean,
    created_at timestamptz,
    updated_at timestamptz,
    phone text default null,
    phone_confirmed_at timestamptz,
    phone_change text default '',
    phone_change_token character varying(255) default '',
    phone_change_sent_at timestamptz,
    confirmed_at timestamptz generated always as (least(email_confirmed_at, phone_confirmed_at)) stored,
    email_change_token_current character varying(255) default '',
    email_change_confirm_status smallint default 0,
    banned_until timestamptz,
    reauthentication_token character varying(255) default '',
    reauthentication_sent_at timestamptz,
    is_sso_user boolean not null default false,
    deleted_at timestamptz,
    is_anonymous boolean not null default false,
    constraint users_pkey primary key (id)
);

-- auth.identities --------------------------------------------------------------
create table auth.identities (
    provider_id text not null,
    user_id uuid not null references auth.users(id) on delete cascade,
    identity_data jsonb not null,
    provider text not null,
    last_sign_in_at timestamptz,
    created_at timestamptz,
    updated_at timestamptz,
    email text generated always as (lower(identity_data ->> 'email')) stored,
    id uuid not null default extensions.gen_random_uuid(),
    constraint identities_pkey primary key (id),
    constraint identities_provider_id_provider_unique unique (provider_id, provider)
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
