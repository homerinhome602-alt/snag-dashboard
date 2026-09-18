--
-- PostgreSQL database dump
--

\restrict qLgQBhnRfUiDDAv4Taaq4RRseLDEmChVsHhWDXZu8bh05iD9vghnO5pSAmt0OYf

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: private; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--



--
-- Name: attachment_media_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.attachment_media_type AS ENUM (
    'image',
    'video'
);


--
-- Name: member_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.member_role AS ENUM (
    'operations',
    'hvac_engineer',
    'program_manager_infra',
    'pmc',
    'pmo',
    'warehouse_admin'
);


--
-- Name: snag_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.snag_category AS ENUM (
    'hvac',
    'ops'
);


--
-- Name: snag_location; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.snag_location AS ENUM (
    'frozen_chamber',
    'ante_room',
    'odu_area',
    'ambient_area'
);


--
-- Name: snag_scope; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.snag_scope AS ENUM (
    'oem',
    'infra',
    'admin'
);


--
-- Name: snag_severity; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.snag_severity AS ENUM (
    'high',
    'medium',
    'low'
);


--
-- Name: snag_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.snag_status AS ENUM (
    'open',
    'wip',
    'ready_to_close',
    'closed'
);


--
-- Name: snag_sub_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.snag_sub_category AS ENUM (
    'odu',
    'idu',
    'puff_panel',
    'plc',
    'door',
    'floor',
    'piping',
    'racks',
    'electrical',
    'iot_sensors',
    'others'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: snags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.snags (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    warehouse_id uuid NOT NULL,
    serial_no integer NOT NULL,
    date_raised date DEFAULT CURRENT_DATE NOT NULL,
    raised_by uuid NOT NULL,
    description text NOT NULL,
    category public.snag_category NOT NULL,
    sub_category public.snag_sub_category NOT NULL,
    sub_category_other text,
    location public.snag_location NOT NULL,
    scope public.snag_scope NOT NULL,
    severity public.snag_severity NOT NULL,
    status public.snag_status DEFAULT 'open'::public.snag_status NOT NULL,
    etc_date date,
    verified_by uuid,
    verified_at timestamp with time zone,
    closed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sub_category_other_required CHECK (((sub_category <> 'others'::public.snag_sub_category) OR ((sub_category_other IS NOT NULL) AND (length(TRIM(BOTH FROM sub_category_other)) > 0))))
);


--
-- Name: snag_action_result; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.snag_action_result AS (
	snag public.snags,
	update_id uuid
);


--
-- Name: snag_update_side; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.snag_update_side AS ENUM (
    'reporter',
    'resolver',
    'admin'
);


--
-- Name: is_active_user(); Type: FUNCTION; Schema: private; Owner: -
--

-- A deactivated profile (profiles.is_active = false) can still sign in and
-- land on the dashboard (Sep 2026 — deactivation is no longer a sign-in
-- block, see src/lib/auth/service.ts) but must see nothing: every access
-- primitive below gates on this, so a deactivated person's warehouse_members
-- rows and is_dashboard_admin flag stay in the database but stop counting
-- for anything while they're deactivated, and resume the moment they're
-- reactivated — nothing else needs to change.
CREATE FUNCTION private.is_active_user() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(
    (select p.is_active from public.profiles p where p.id = (select auth.uid())),
    false
  );
$$;


--
-- Name: has_warehouse_role(uuid, public.member_role[]); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.has_warehouse_role(p_warehouse_id uuid, p_roles public.member_role[]) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select private.is_active_user() and exists (
    select 1 from public.warehouse_members wm
    where wm.warehouse_id = p_warehouse_id
      and wm.user_id = (select auth.uid())
      and wm.role = any(p_roles)
  );
$$;


--
-- Name: is_dashboard_admin(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.is_dashboard_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select private.is_active_user() and coalesce(
    (select p.is_dashboard_admin from public.profiles p where p.id = (select auth.uid())),
    false
  );
$$;


--
-- Name: is_reporter(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.is_reporter(p_warehouse_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select private.has_warehouse_role(p_warehouse_id, array['operations','hvac_engineer','warehouse_admin']::public.member_role[]);
$$;


--
-- Name: is_resolver(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.is_resolver(p_warehouse_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select private.has_warehouse_role(
    p_warehouse_id,
    array['program_manager_infra','pmc','pmo']::public.member_role[]
  );
$$;


--
-- Name: is_warehouse_member(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.is_warehouse_member(p_warehouse_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select private.is_active_user() and exists (
    select 1 from public.warehouse_members wm
    where wm.warehouse_id = p_warehouse_id
      and wm.user_id = (select auth.uid())
  );
$$;


--
-- Name: close_snag_directly(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.close_snag_directly(p_snag_id uuid, p_body text DEFAULT NULL::text) RETURNS public.snag_action_result
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_uid uuid := (select auth.uid());
  v_warehouse_id uuid;
  v_old_status public.snag_status;
  v_row public.snags;
  v_update_id uuid;
  v_side public.snag_update_side;
  v_result public.snag_action_result;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select warehouse_id, status into v_warehouse_id, v_old_status
  from public.snags where id = p_snag_id;

  if v_warehouse_id is null then
    raise exception 'snag not found';
  end if;

  if not (private.is_reporter(v_warehouse_id) or private.is_dashboard_admin()) then
    raise exception 'not a reporter on this warehouse';
  end if;

  if v_old_status = 'closed' then
    raise exception 'snag is already closed';
  end if;

  update public.snags
    set status = 'closed', closed_at = now(), verified_by = v_uid, verified_at = now()
    where id = p_snag_id
    returning * into v_row;

  insert into public.snag_activity (snag_id, actor_id, action, field, old_value, new_value)
  values (p_snag_id, v_uid, 'verify_closure', 'status', v_old_status::text, 'closed');

  if p_body is not null and length(trim(p_body)) > 0 then
    v_side := case when private.is_reporter(v_warehouse_id) then 'reporter' else 'admin' end;
    insert into public.snag_updates (snag_id, body, author_id, author_side)
    values (p_snag_id, p_body, v_uid, v_side)
    returning id into v_update_id;
  end if;

  v_result.snag := v_row;
  v_result.update_id := v_update_id;
  return v_result;
end;
$$;


--
-- Name: correct_date_raised(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.correct_date_raised(p_snag_id uuid, p_new_date date) RETURNS public.snags
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_uid uuid := (select auth.uid());
  v_old_date date;
  v_row public.snags;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not private.is_dashboard_admin() then
    raise exception 'only a dashboard admin may correct date_raised';
  end if;

  select date_raised into v_old_date from public.snags where id = p_snag_id;
  if v_old_date is null then
    raise exception 'snag not found';
  end if;

  update public.snags set date_raised = p_new_date where id = p_snag_id
  returning * into v_row;

  insert into public.snag_activity (snag_id, actor_id, action, field, old_value, new_value)
  values (p_snag_id, v_uid, 'correct_date_raised', 'date_raised', v_old_date::text, p_new_date::text);

  return v_row;
end;
$$;


--
-- Name: warehouses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warehouses (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    name text NOT NULL,
    go_live_date date,
    snag_counter integer DEFAULT 0 NOT NULL,
    site_location text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: create_warehouse(text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_warehouse(p_name text, p_site_location text, p_members jsonb) RETURNS public.warehouses
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.warehouses;
  m record;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not private.is_dashboard_admin() then
    raise exception 'only a dashboard admin may create a warehouse';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'warehouse name is required';
  end if;

  insert into public.warehouses (name, site_location, created_by)
  values (trim(p_name), nullif(trim(coalesce(p_site_location, '')), ''), v_uid)
  returning * into v_row;

  for m in select * from jsonb_to_recordset(p_members) as x(user_id uuid, role public.member_role)
  loop
    insert into public.warehouse_members (warehouse_id, user_id, role)
    values (v_row.id, m.user_id, m.role)
    on conflict (warehouse_id, user_id, role) do nothing;
  end loop;

  return v_row;
end;
$$;


--
-- Name: find_similar_snags(uuid, public.snag_location, public.snag_sub_category, text, real); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.find_similar_snags(p_warehouse_id uuid, p_location public.snag_location, p_sub_category public.snag_sub_category, p_description text, p_threshold real DEFAULT 0.3) RETURNS TABLE(id uuid, serial_no integer, description text, status public.snag_status, raised_by_name text, similarity real)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select s.id, s.serial_no, s.description, s.status,
         coalesce(p.full_name, p.email) as raised_by_name,
         extensions.similarity(s.description, p_description) as similarity
  from public.snags s
  left join public.profiles p on p.id = s.raised_by
  where s.warehouse_id = p_warehouse_id
    and s.location = p_location
    and s.sub_category = p_sub_category
    and s.status <> 'closed'
    and extensions.similarity(s.description, p_description) > p_threshold
  order by similarity desc
  limit 10;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_invite public.invitations;
  v_warehouse_id uuid;
begin
  -- Sign-in is open to any email (Sep 2026) — there is no invitation gate
  -- any more. A matching invitations row (if any) is what grants a role,
  -- warehouse tags, or Dashboard Admin; its absence just means a bare
  -- profile with no access, not a blocked sign-in.
  select * into v_invite from public.invitations where email = new.email;

  insert into public.profiles (id, email, full_name, is_dashboard_admin, default_role)
  values (
    new.id,
    new.email,
    new.email,
    coalesce(v_invite.grant_dashboard_admin, false),
    v_invite.default_role
  );

  if v_invite.id is not null and v_invite.warehouse_ids is not null then
    foreach v_warehouse_id in array v_invite.warehouse_ids
    loop
      insert into public.warehouse_members (warehouse_id, user_id, role)
      values (v_warehouse_id, new.id, v_invite.default_role)
      on conflict do nothing;
    end loop;
  end if;

  if v_invite.id is not null then
    update public.invitations set accepted_at = now() where id = v_invite.id;
  end if;

  return new;
end;
$$;


--
-- Name: snag_updates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.snag_updates (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    snag_id uuid NOT NULL,
    body text NOT NULL,
    author_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    author_side public.snag_update_side NOT NULL
);


--
-- Name: post_snag_update(uuid, text, date, public.snag_status, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.post_snag_update(p_snag_id uuid, p_body text, p_etc_date date DEFAULT NULL::date, p_status public.snag_status DEFAULT NULL::public.snag_status, p_acting_as text DEFAULT 'resolver'::text) RETURNS public.snag_updates
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_uid uuid := (select auth.uid());
  v_warehouse_id uuid;
  v_row public.snag_updates;
  v_old_status public.snag_status;
  v_old_etc date;
  v_side public.snag_update_side;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if p_acting_as not in ('reporter', 'resolver') then
    raise exception 'p_acting_as must be reporter or resolver';
  end if;

  select warehouse_id, status, etc_date into v_warehouse_id, v_old_status, v_old_etc
  from public.snags where id = p_snag_id;

  if v_warehouse_id is null then
    raise exception 'snag not found';
  end if;

  if p_acting_as = 'reporter' then
    if not (private.is_reporter(v_warehouse_id) or private.is_dashboard_admin()) then
      raise exception 'not a reporter on this warehouse';
    end if;
    if p_etc_date is not null or p_status is not null then
      raise exception 'reporters may not set ETC or status';
    end if;
    v_side := case when private.is_reporter(v_warehouse_id) then 'reporter' else 'admin' end;
  else
    if not (private.is_resolver(v_warehouse_id) or private.is_dashboard_admin()) then
      raise exception 'not a resolver on this warehouse';
    end if;
    if p_status is not null and p_status not in ('wip', 'ready_to_close') then
      raise exception 'resolvers may only move status to wip or ready_to_close';
    end if;
    v_side := case when private.is_resolver(v_warehouse_id) then 'resolver' else 'admin' end;
  end if;

  insert into public.snag_updates (snag_id, body, author_id, author_side)
  values (p_snag_id, p_body, v_uid, v_side)
  returning * into v_row;

  if p_etc_date is not null or p_status is not null then
    update public.snags
      set etc_date = coalesce(p_etc_date, etc_date),
          status = coalesce(p_status, status)
      where id = p_snag_id;
  end if;

  if p_status is not null and p_status is distinct from v_old_status then
    insert into public.snag_activity (snag_id, actor_id, action, field, old_value, new_value)
    values (p_snag_id, v_uid, 'status_change', 'status', v_old_status::text, p_status::text);
  end if;

  if p_etc_date is not null and p_etc_date is distinct from v_old_etc then
    insert into public.snag_activity (snag_id, actor_id, action, field, old_value, new_value)
    values (p_snag_id, v_uid, 'etc_update', 'etc_date', v_old_etc::text, p_etc_date::text);
  end if;

  return v_row;
end;
$$;


--
-- Name: raise_snag(uuid, text, public.snag_category, public.snag_sub_category, public.snag_location, public.snag_scope, public.snag_severity, text, uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.raise_snag(p_warehouse_id uuid, p_description text, p_category public.snag_category, p_sub_category public.snag_sub_category, p_location public.snag_location, p_scope public.snag_scope, p_severity public.snag_severity, p_sub_category_other text DEFAULT NULL::text, p_id uuid DEFAULT NULL::uuid, p_suppressed_duplicate_ids uuid[] DEFAULT NULL::uuid[]) RETURNS public.snags
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_uid uuid := (select auth.uid());
  v_serial integer;
  v_row public.snags;
  v_dup_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not (private.is_reporter(p_warehouse_id) or private.is_dashboard_admin()) then
    raise exception 'not a reporter on this warehouse';
  end if;
  if p_sub_category = 'others' and (p_sub_category_other is null or length(trim(p_sub_category_other)) = 0) then
    raise exception 'sub_category_other is required when sub_category is others';
  end if;

  update public.warehouses
    set snag_counter = snag_counter + 1
    where id = p_warehouse_id
    returning snag_counter into v_serial;

  if v_serial is null then
    raise exception 'warehouse not found';
  end if;

  insert into public.snags (
    id, warehouse_id, serial_no, raised_by, description, category,
    sub_category, sub_category_other, location, scope, severity
  ) values (
    coalesce(p_id, extensions.gen_random_uuid()), p_warehouse_id, v_serial, v_uid, p_description, p_category,
    p_sub_category, p_sub_category_other, p_location, p_scope, p_severity
  )
  returning * into v_row;

  insert into public.snag_activity (snag_id, actor_id, action)
  values (v_row.id, v_uid, 'raise');

  if p_suppressed_duplicate_ids is not null then
    foreach v_dup_id in array p_suppressed_duplicate_ids
    loop
      insert into public.snag_activity (snag_id, actor_id, action, field, new_value)
      values (v_row.id, v_uid, 'duplicate_suppressed', 'duplicate_of', v_dup_id::text);
    end loop;
  end if;

  return v_row;
end;
$$;


--
-- Name: refresh_snag_daily_snapshot(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_snag_daily_snapshot() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  insert into public.snag_daily_snapshot (
    warehouse_id, snapshot_date, total_raised, total_closed, open_count, open_high_count
  )
  select
    s.warehouse_id,
    current_date,
    count(*)::int,
    count(*) filter (where s.status = 'closed')::int,
    count(*) filter (where s.status <> 'closed')::int,
    count(*) filter (where s.status <> 'closed' and s.severity = 'high')::int
  from public.snags s
  group by s.warehouse_id
  on conflict (warehouse_id, snapshot_date) do update set
    total_raised = excluded.total_raised,
    total_closed = excluded.total_closed,
    open_count = excluded.open_count,
    open_high_count = excluded.open_high_count;
$$;


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    full_name text,
    is_dashboard_admin boolean DEFAULT false NOT NULL,
    default_role public.member_role,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: set_dashboard_admin(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_dashboard_admin(p_user_id uuid, p_is_admin boolean) RETURNS public.profiles
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.profiles;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not private.is_dashboard_admin() then
    raise exception 'only a dashboard admin may change dashboard admin status';
  end if;

  update public.profiles set is_dashboard_admin = p_is_admin where id = p_user_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'user not found';
  end if;

  return v_row;
end;
$$;


--
-- Name: set_go_live_date(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_go_live_date(p_warehouse_id uuid, p_date date) RETURNS public.warehouses
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.warehouses;
  v_old_date date;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not (private.is_resolver(p_warehouse_id) or private.is_dashboard_admin()) then
    raise exception 'not a resolver on this warehouse';
  end if;

  select go_live_date into v_old_date from public.warehouses where id = p_warehouse_id;

  update public.warehouses set go_live_date = p_date where id = p_warehouse_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'warehouse not found';
  end if;

  insert into public.warehouse_activity (warehouse_id, actor_id, action, field, old_value, new_value)
  values (p_warehouse_id, v_uid, 'go_live_date_change', 'go_live_date', v_old_date::text, p_date::text);

  return v_row;
end;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: set_user_active(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_user_active(p_user_id uuid, p_is_active boolean) RETURNS public.profiles
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.profiles;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not private.is_dashboard_admin() then
    raise exception 'only a dashboard admin may change account status';
  end if;

  update public.profiles set is_active = p_is_active where id = p_user_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'user not found';
  end if;

  return v_row;
end;
$$;


--
-- Name: verify_snag_closure(uuid, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verify_snag_closure(p_snag_id uuid, p_approved boolean, p_body text DEFAULT NULL::text) RETURNS public.snag_action_result
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_uid uuid := (select auth.uid());
  v_warehouse_id uuid;
  v_old_status public.snag_status;
  v_row public.snags;
  v_update_id uuid;
  v_side public.snag_update_side;
  v_result public.snag_action_result;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select warehouse_id, status into v_warehouse_id, v_old_status
  from public.snags where id = p_snag_id;

  if v_warehouse_id is null then
    raise exception 'snag not found';
  end if;

  if not (private.is_reporter(v_warehouse_id) or private.is_dashboard_admin()) then
    raise exception 'not a reporter on this warehouse';
  end if;

  if v_old_status <> 'ready_to_close' then
    raise exception 'snag is not awaiting verification';
  end if;

  if p_approved then
    update public.snags
      set status = 'closed', closed_at = now(), verified_by = v_uid, verified_at = now()
      where id = p_snag_id
      returning * into v_row;
    insert into public.snag_activity (snag_id, actor_id, action, field, old_value, new_value)
    values (p_snag_id, v_uid, 'verify_closure', 'status', 'ready_to_close', 'closed');
  else
    update public.snags
      set status = 'wip'
      where id = p_snag_id
      returning * into v_row;
    insert into public.snag_activity (snag_id, actor_id, action, field, old_value, new_value)
    values (p_snag_id, v_uid, 'reject_closure', 'status', 'ready_to_close', 'wip');
  end if;

  if p_body is not null and length(trim(p_body)) > 0 then
    v_side := case when private.is_reporter(v_warehouse_id) then 'reporter' else 'admin' end;
    insert into public.snag_updates (snag_id, body, author_id, author_side)
    values (p_snag_id, p_body, v_uid, v_side)
    returning id into v_update_id;
  end if;

  v_result.snag := v_row;
  v_result.update_id := v_update_id;
  return v_result;
end;
$$;


--
-- Name: attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attachments (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    snag_id uuid NOT NULL,
    update_id uuid,
    media_type public.attachment_media_type NOT NULL,
    file_url text NOT NULL,
    original_url text,
    thumbnail_url text,
    file_name text,
    file_size bigint,
    duration_seconds integer,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invitations (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    email text NOT NULL,
    default_role public.member_role,
    grant_dashboard_admin boolean DEFAULT false NOT NULL,
    invited_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    accepted_at timestamp with time zone,
    warehouse_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL
);


--
-- Name: people_activity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.people_activity (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    actor_id uuid,
    action text NOT NULL,
    detail text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: snag_activity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.snag_activity (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    snag_id uuid NOT NULL,
    actor_id uuid,
    action text NOT NULL,
    field text,
    old_value text,
    new_value text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: snag_daily_snapshot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.snag_daily_snapshot (
    warehouse_id uuid NOT NULL,
    snapshot_date date NOT NULL,
    total_raised integer DEFAULT 0 NOT NULL,
    total_closed integer DEFAULT 0 NOT NULL,
    open_count integer DEFAULT 0 NOT NULL,
    open_high_count integer DEFAULT 0 NOT NULL
);


--
-- Name: snags_with_derived; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.snags_with_derived WITH (security_invoker='true') AS
 SELECT id,
    warehouse_id,
    serial_no,
    date_raised,
    raised_by,
    description,
    category,
    sub_category,
    sub_category_other,
    location,
    scope,
    severity,
    status,
    etc_date,
    verified_by,
    verified_at,
    closed_at,
    created_at,
    updated_at,
    (COALESCE((closed_at)::date, CURRENT_DATE) - date_raised) AS ageing_days,
    ((etc_date IS NOT NULL) AND (etc_date < CURRENT_DATE) AND (status <> 'closed'::public.snag_status)) AS is_overdue
   FROM public.snags s;


--
-- Name: warehouse_activity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warehouse_activity (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    warehouse_id uuid NOT NULL,
    actor_id uuid,
    action text NOT NULL,
    field text,
    old_value text,
    new_value text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: warehouse_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warehouse_members (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    warehouse_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role public.member_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: warehouse_readiness; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.warehouse_readiness WITH (security_invoker='true') AS
 SELECT w.id,
    w.name,
    w.go_live_date,
    w.site_location,
    (count(s.id))::integer AS total_raised,
    (count(s.id) FILTER (WHERE (s.status <> 'closed'::public.snag_status)))::integer AS open_count,
    (count(s.id) FILTER (WHERE ((s.status <> 'closed'::public.snag_status) AND (s.severity = 'high'::public.snag_severity))))::integer AS open_high_count
   FROM (public.warehouses w
     LEFT JOIN public.snags s ON ((s.warehouse_id = w.id)))
  GROUP BY w.id, w.name, w.go_live_date, w.site_location;


--
-- Name: attachments attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_pkey PRIMARY KEY (id);


--
-- Name: invitations invitations_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_email_key UNIQUE (email);


--
-- Name: invitations invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_pkey PRIMARY KEY (id);


--
-- Name: people_activity people_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.people_activity
    ADD CONSTRAINT people_activity_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_email_key UNIQUE (email);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: snag_activity snag_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.snag_activity
    ADD CONSTRAINT snag_activity_pkey PRIMARY KEY (id);


--
-- Name: snag_daily_snapshot snag_daily_snapshot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.snag_daily_snapshot
    ADD CONSTRAINT snag_daily_snapshot_pkey PRIMARY KEY (warehouse_id, snapshot_date);


--
-- Name: snag_updates snag_updates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.snag_updates
    ADD CONSTRAINT snag_updates_pkey PRIMARY KEY (id);


--
-- Name: snags snags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.snags
    ADD CONSTRAINT snags_pkey PRIMARY KEY (id);


--
-- Name: snags snags_warehouse_id_serial_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.snags
    ADD CONSTRAINT snags_warehouse_id_serial_no_key UNIQUE (warehouse_id, serial_no);


--
-- Name: warehouse_activity warehouse_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_activity
    ADD CONSTRAINT warehouse_activity_pkey PRIMARY KEY (id);


--
-- Name: warehouse_members warehouse_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_members
    ADD CONSTRAINT warehouse_members_pkey PRIMARY KEY (id);


--
-- Name: warehouse_members warehouse_members_warehouse_id_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_members
    ADD CONSTRAINT warehouse_members_warehouse_id_user_id_role_key UNIQUE (warehouse_id, user_id, role);


--
-- Name: warehouses warehouses_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_name_key UNIQUE (name);


--
-- Name: warehouses warehouses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_pkey PRIMARY KEY (id);


--
-- Name: attachments_snag_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attachments_snag_id_idx ON public.attachments USING btree (snag_id);


--
-- Name: attachments_update_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attachments_update_id_idx ON public.attachments USING btree (update_id);


--
-- Name: attachments_uploaded_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attachments_uploaded_by_idx ON public.attachments USING btree (uploaded_by);


--
-- Name: invitations_invited_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invitations_invited_by_idx ON public.invitations USING btree (invited_by);


--
-- Name: people_activity_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX people_activity_email_idx ON public.people_activity USING btree (email);


--
-- Name: snag_activity_actor_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX snag_activity_actor_id_idx ON public.snag_activity USING btree (actor_id);


--
-- Name: snag_activity_snag_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX snag_activity_snag_id_idx ON public.snag_activity USING btree (snag_id);


--
-- Name: snag_updates_author_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX snag_updates_author_id_idx ON public.snag_updates USING btree (author_id);


--
-- Name: snag_updates_snag_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX snag_updates_snag_id_idx ON public.snag_updates USING btree (snag_id);


--
-- Name: snags_description_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX snags_description_trgm_idx ON public.snags USING gin (description extensions.gin_trgm_ops);


--
-- Name: snags_open_high_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX snags_open_high_idx ON public.snags USING btree (warehouse_id, severity) WHERE (status <> 'closed'::public.snag_status);


--
-- Name: snags_raised_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX snags_raised_by_idx ON public.snags USING btree (raised_by);


--
-- Name: snags_verified_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX snags_verified_by_idx ON public.snags USING btree (verified_by);


--
-- Name: snags_warehouse_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX snags_warehouse_id_idx ON public.snags USING btree (warehouse_id);


--
-- Name: snags_warehouse_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX snags_warehouse_status_idx ON public.snags USING btree (warehouse_id, status);


--
-- Name: warehouse_members_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX warehouse_members_user_id_idx ON public.warehouse_members USING btree (user_id);


--
-- Name: warehouse_members_warehouse_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX warehouse_members_warehouse_id_idx ON public.warehouse_members USING btree (warehouse_id);


--
-- Name: warehouses_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX warehouses_created_by_idx ON public.warehouses USING btree (created_by);


--
-- Name: snags snags_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER snags_set_updated_at BEFORE UPDATE ON public.snags FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: attachments attachments_snag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_snag_id_fkey FOREIGN KEY (snag_id) REFERENCES public.snags(id) ON DELETE CASCADE;


--
-- Name: attachments attachments_update_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_update_id_fkey FOREIGN KEY (update_id) REFERENCES public.snag_updates(id) ON DELETE CASCADE;


--
-- Name: attachments attachments_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id);


--
-- Name: invitations invitations_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.profiles(id);


--
-- Name: people_activity people_activity_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.people_activity
    ADD CONSTRAINT people_activity_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id);


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: snag_activity snag_activity_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.snag_activity
    ADD CONSTRAINT snag_activity_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id);


--
-- Name: snag_activity snag_activity_snag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.snag_activity
    ADD CONSTRAINT snag_activity_snag_id_fkey FOREIGN KEY (snag_id) REFERENCES public.snags(id) ON DELETE CASCADE;


--
-- Name: snag_daily_snapshot snag_daily_snapshot_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.snag_daily_snapshot
    ADD CONSTRAINT snag_daily_snapshot_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE CASCADE;


--
-- Name: snag_updates snag_updates_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.snag_updates
    ADD CONSTRAINT snag_updates_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id);


--
-- Name: snag_updates snag_updates_snag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.snag_updates
    ADD CONSTRAINT snag_updates_snag_id_fkey FOREIGN KEY (snag_id) REFERENCES public.snags(id) ON DELETE CASCADE;


--
-- Name: snags snags_raised_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.snags
    ADD CONSTRAINT snags_raised_by_fkey FOREIGN KEY (raised_by) REFERENCES public.profiles(id);


--
-- Name: snags snags_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.snags
    ADD CONSTRAINT snags_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.profiles(id);


--
-- Name: snags snags_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.snags
    ADD CONSTRAINT snags_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE CASCADE;


--
-- Name: warehouse_activity warehouse_activity_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_activity
    ADD CONSTRAINT warehouse_activity_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id);


--
-- Name: warehouse_activity warehouse_activity_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_activity
    ADD CONSTRAINT warehouse_activity_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE CASCADE;


--
-- Name: warehouse_members warehouse_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_members
    ADD CONSTRAINT warehouse_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: warehouse_members warehouse_members_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_members
    ADD CONSTRAINT warehouse_members_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE CASCADE;


--
-- Name: warehouses warehouses_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: attachments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

--
-- Name: attachments attachments_insert_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attachments_insert_members ON public.attachments FOR INSERT TO authenticated WITH CHECK ((private.is_dashboard_admin() OR (EXISTS ( SELECT 1
   FROM public.snags s
  WHERE ((s.id = attachments.snag_id) AND (private.is_reporter(s.warehouse_id) OR private.is_resolver(s.warehouse_id)))))));


--
-- Name: attachments attachments_select_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attachments_select_scoped ON public.attachments FOR SELECT USING ((private.is_dashboard_admin() OR (EXISTS ( SELECT 1
   FROM public.snags s
  WHERE ((s.id = attachments.snag_id) AND private.is_warehouse_member(s.warehouse_id))))));


--
-- Name: invitations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: invitations invitations_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invitations_insert_admin ON public.invitations FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_dashboard_admin() AS is_dashboard_admin));


--
-- Name: invitations invitations_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invitations_select_admin ON public.invitations FOR SELECT TO authenticated USING (( SELECT private.is_dashboard_admin() AS is_dashboard_admin));


--
-- Name: invitations invitations_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invitations_update_admin ON public.invitations FOR UPDATE TO authenticated USING (( SELECT private.is_dashboard_admin() AS is_dashboard_admin)) WITH CHECK (( SELECT private.is_dashboard_admin() AS is_dashboard_admin));


--
-- Name: people_activity; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.people_activity ENABLE ROW LEVEL SECURITY;

--
-- Name: people_activity people_activity_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY people_activity_insert_admin ON public.people_activity FOR INSERT WITH CHECK (private.is_dashboard_admin());


--
-- Name: people_activity people_activity_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY people_activity_select_admin ON public.people_activity FOR SELECT USING (private.is_dashboard_admin());


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select_all ON public.profiles FOR SELECT TO authenticated USING (true);


--
-- Name: snag_activity; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.snag_activity ENABLE ROW LEVEL SECURITY;

--
-- Name: snag_activity snag_activity_select_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY snag_activity_select_scoped ON public.snag_activity FOR SELECT USING ((private.is_dashboard_admin() OR (EXISTS ( SELECT 1
   FROM public.snags s
  WHERE ((s.id = snag_activity.snag_id) AND private.is_warehouse_member(s.warehouse_id))))));


--
-- Name: snag_daily_snapshot; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.snag_daily_snapshot ENABLE ROW LEVEL SECURITY;

--
-- Name: snag_daily_snapshot snag_daily_snapshot_select_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY snag_daily_snapshot_select_scoped ON public.snag_daily_snapshot FOR SELECT USING ((private.is_dashboard_admin() OR private.is_warehouse_member(warehouse_id)));


--
-- Name: snag_updates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.snag_updates ENABLE ROW LEVEL SECURITY;

--
-- Name: snag_updates snag_updates_select_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY snag_updates_select_scoped ON public.snag_updates FOR SELECT USING ((private.is_dashboard_admin() OR (EXISTS ( SELECT 1
   FROM public.snags s
  WHERE ((s.id = snag_updates.snag_id) AND private.is_warehouse_member(s.warehouse_id))))));


--
-- Name: snags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.snags ENABLE ROW LEVEL SECURITY;

--
-- Name: snags snags_select_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY snags_select_scoped ON public.snags FOR SELECT USING ((private.is_dashboard_admin() OR private.is_warehouse_member(warehouse_id)));


--
-- Name: warehouse_activity; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.warehouse_activity ENABLE ROW LEVEL SECURITY;

--
-- Name: warehouse_activity warehouse_activity_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY warehouse_activity_insert_admin ON public.warehouse_activity FOR INSERT WITH CHECK (private.is_dashboard_admin());


--
-- Name: warehouse_activity warehouse_activity_select_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY warehouse_activity_select_scoped ON public.warehouse_activity FOR SELECT USING ((private.is_dashboard_admin() OR private.is_warehouse_member(warehouse_id)));


--
-- Name: warehouse_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.warehouse_members ENABLE ROW LEVEL SECURITY;

--
-- Name: warehouse_members warehouse_members_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY warehouse_members_delete_admin ON public.warehouse_members FOR DELETE TO authenticated USING (( SELECT private.is_dashboard_admin() AS is_dashboard_admin));


--
-- Name: warehouse_members warehouse_members_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY warehouse_members_insert_admin ON public.warehouse_members FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_dashboard_admin() AS is_dashboard_admin));


--
-- Name: warehouse_members warehouse_members_select_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY warehouse_members_select_scoped ON public.warehouse_members FOR SELECT USING ((private.is_dashboard_admin() OR private.is_warehouse_member(warehouse_id)));


--
-- Name: warehouses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

--
-- Name: warehouses warehouses_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY warehouses_delete_admin ON public.warehouses FOR DELETE USING (private.is_dashboard_admin());


--
-- Name: warehouses warehouses_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY warehouses_insert_admin ON public.warehouses FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_dashboard_admin() AS is_dashboard_admin));


--
-- Name: warehouses warehouses_select_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY warehouses_select_scoped ON public.warehouses FOR SELECT USING ((private.is_dashboard_admin() OR private.is_warehouse_member(id)));


--
-- Name: warehouses warehouses_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY warehouses_update_admin ON public.warehouses FOR UPDATE TO authenticated USING (( SELECT private.is_dashboard_admin() AS is_dashboard_admin)) WITH CHECK (( SELECT private.is_dashboard_admin() AS is_dashboard_admin));


--
-- Name: SCHEMA private; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA private TO authenticated;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: TABLE snags; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.snags TO anon;
GRANT ALL ON TABLE public.snags TO authenticated;
GRANT ALL ON TABLE public.snags TO service_role;


--
-- Name: FUNCTION is_active_user(); Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON FUNCTION private.is_active_user() TO authenticated;


--
-- Name: FUNCTION has_warehouse_role(p_warehouse_id uuid, p_roles public.member_role[]); Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON FUNCTION private.has_warehouse_role(p_warehouse_id uuid, p_roles public.member_role[]) TO authenticated;


--
-- Name: FUNCTION is_dashboard_admin(); Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON FUNCTION private.is_dashboard_admin() TO authenticated;


--
-- Name: FUNCTION is_reporter(p_warehouse_id uuid); Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON FUNCTION private.is_reporter(p_warehouse_id uuid) TO authenticated;


--
-- Name: FUNCTION is_resolver(p_warehouse_id uuid); Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON FUNCTION private.is_resolver(p_warehouse_id uuid) TO authenticated;


--
-- Name: FUNCTION is_warehouse_member(p_warehouse_id uuid); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.is_warehouse_member(p_warehouse_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION private.is_warehouse_member(p_warehouse_id uuid) TO authenticated;


--
-- Name: FUNCTION close_snag_directly(p_snag_id uuid, p_body text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.close_snag_directly(p_snag_id uuid, p_body text) TO authenticated;
GRANT ALL ON FUNCTION public.close_snag_directly(p_snag_id uuid, p_body text) TO service_role;


--
-- Name: FUNCTION correct_date_raised(p_snag_id uuid, p_new_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.correct_date_raised(p_snag_id uuid, p_new_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.correct_date_raised(p_snag_id uuid, p_new_date date) TO authenticated;
GRANT ALL ON FUNCTION public.correct_date_raised(p_snag_id uuid, p_new_date date) TO service_role;


--
-- Name: TABLE warehouses; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.warehouses TO anon;
GRANT ALL ON TABLE public.warehouses TO authenticated;
GRANT ALL ON TABLE public.warehouses TO service_role;


--
-- Name: FUNCTION create_warehouse(p_name text, p_site_location text, p_members jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_warehouse(p_name text, p_site_location text, p_members jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_warehouse(p_name text, p_site_location text, p_members jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.create_warehouse(p_name text, p_site_location text, p_members jsonb) TO service_role;


--
-- Name: FUNCTION find_similar_snags(p_warehouse_id uuid, p_location public.snag_location, p_sub_category public.snag_sub_category, p_description text, p_threshold real); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.find_similar_snags(p_warehouse_id uuid, p_location public.snag_location, p_sub_category public.snag_sub_category, p_description text, p_threshold real) FROM PUBLIC;
GRANT ALL ON FUNCTION public.find_similar_snags(p_warehouse_id uuid, p_location public.snag_location, p_sub_category public.snag_sub_category, p_description text, p_threshold real) TO authenticated;
GRANT ALL ON FUNCTION public.find_similar_snags(p_warehouse_id uuid, p_location public.snag_location, p_sub_category public.snag_sub_category, p_description text, p_threshold real) TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: TABLE snag_updates; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.snag_updates TO anon;
GRANT ALL ON TABLE public.snag_updates TO authenticated;
GRANT ALL ON TABLE public.snag_updates TO service_role;


--
-- Name: FUNCTION post_snag_update(p_snag_id uuid, p_body text, p_etc_date date, p_status public.snag_status, p_acting_as text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.post_snag_update(p_snag_id uuid, p_body text, p_etc_date date, p_status public.snag_status, p_acting_as text) TO authenticated;
GRANT ALL ON FUNCTION public.post_snag_update(p_snag_id uuid, p_body text, p_etc_date date, p_status public.snag_status, p_acting_as text) TO service_role;


--
-- Name: FUNCTION raise_snag(p_warehouse_id uuid, p_description text, p_category public.snag_category, p_sub_category public.snag_sub_category, p_location public.snag_location, p_scope public.snag_scope, p_severity public.snag_severity, p_sub_category_other text, p_id uuid, p_suppressed_duplicate_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.raise_snag(p_warehouse_id uuid, p_description text, p_category public.snag_category, p_sub_category public.snag_sub_category, p_location public.snag_location, p_scope public.snag_scope, p_severity public.snag_severity, p_sub_category_other text, p_id uuid, p_suppressed_duplicate_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.raise_snag(p_warehouse_id uuid, p_description text, p_category public.snag_category, p_sub_category public.snag_sub_category, p_location public.snag_location, p_scope public.snag_scope, p_severity public.snag_severity, p_sub_category_other text, p_id uuid, p_suppressed_duplicate_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.raise_snag(p_warehouse_id uuid, p_description text, p_category public.snag_category, p_sub_category public.snag_sub_category, p_location public.snag_location, p_scope public.snag_scope, p_severity public.snag_severity, p_sub_category_other text, p_id uuid, p_suppressed_duplicate_ids uuid[]) TO service_role;


--
-- Name: FUNCTION refresh_snag_daily_snapshot(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.refresh_snag_daily_snapshot() FROM PUBLIC;
GRANT ALL ON FUNCTION public.refresh_snag_daily_snapshot() TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: FUNCTION set_dashboard_admin(p_user_id uuid, p_is_admin boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_dashboard_admin(p_user_id uuid, p_is_admin boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_dashboard_admin(p_user_id uuid, p_is_admin boolean) TO authenticated;
GRANT ALL ON FUNCTION public.set_dashboard_admin(p_user_id uuid, p_is_admin boolean) TO service_role;


--
-- Name: FUNCTION set_go_live_date(p_warehouse_id uuid, p_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_go_live_date(p_warehouse_id uuid, p_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_go_live_date(p_warehouse_id uuid, p_date date) TO authenticated;
GRANT ALL ON FUNCTION public.set_go_live_date(p_warehouse_id uuid, p_date date) TO service_role;


--
-- Name: FUNCTION set_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;


--
-- Name: FUNCTION set_user_active(p_user_id uuid, p_is_active boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_user_active(p_user_id uuid, p_is_active boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_user_active(p_user_id uuid, p_is_active boolean) TO authenticated;
GRANT ALL ON FUNCTION public.set_user_active(p_user_id uuid, p_is_active boolean) TO service_role;


--
-- Name: FUNCTION verify_snag_closure(p_snag_id uuid, p_approved boolean, p_body text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.verify_snag_closure(p_snag_id uuid, p_approved boolean, p_body text) TO authenticated;
GRANT ALL ON FUNCTION public.verify_snag_closure(p_snag_id uuid, p_approved boolean, p_body text) TO service_role;


--
-- Name: TABLE attachments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.attachments TO anon;
GRANT ALL ON TABLE public.attachments TO authenticated;
GRANT ALL ON TABLE public.attachments TO service_role;


--
-- Name: TABLE invitations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.invitations TO anon;
GRANT ALL ON TABLE public.invitations TO authenticated;
GRANT ALL ON TABLE public.invitations TO service_role;


--
-- Name: TABLE people_activity; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.people_activity TO anon;
GRANT ALL ON TABLE public.people_activity TO authenticated;
GRANT ALL ON TABLE public.people_activity TO service_role;


--
-- Name: TABLE snag_activity; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.snag_activity TO anon;
GRANT ALL ON TABLE public.snag_activity TO authenticated;
GRANT ALL ON TABLE public.snag_activity TO service_role;


--
-- Name: TABLE snag_daily_snapshot; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.snag_daily_snapshot TO anon;
GRANT ALL ON TABLE public.snag_daily_snapshot TO authenticated;
GRANT ALL ON TABLE public.snag_daily_snapshot TO service_role;


--
-- Name: TABLE snags_with_derived; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.snags_with_derived TO anon;
GRANT ALL ON TABLE public.snags_with_derived TO authenticated;
GRANT ALL ON TABLE public.snags_with_derived TO service_role;


--
-- Name: TABLE warehouse_activity; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,MAINTAIN ON TABLE public.warehouse_activity TO authenticated;
GRANT ALL ON TABLE public.warehouse_activity TO service_role;


--
-- Name: TABLE warehouse_members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.warehouse_members TO anon;
GRANT ALL ON TABLE public.warehouse_members TO authenticated;
GRANT ALL ON TABLE public.warehouse_members TO service_role;


--
-- Name: TABLE warehouse_readiness; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.warehouse_readiness TO anon;
GRANT ALL ON TABLE public.warehouse_readiness TO authenticated;
GRANT ALL ON TABLE public.warehouse_readiness TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- PostgreSQL database dump complete
--

\unrestrict qLgQBhnRfUiDDAv4Taaq4RRseLDEmChVsHhWDXZu8bh05iD9vghnO5pSAmt0OYf

