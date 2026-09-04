-- Role flatten, part 2: post_snag_update no longer restricts what a "reporter"
-- may do. Any tagged member (or Dashboard Admin) can post a comment, set an
-- ETC, and move status to wip / ready_to_close from either side of the thread.
-- p_acting_as is kept — it only decides which side the message sits on
-- (author_side), which the client now derives from the person's own role.

create or replace function public.post_snag_update(
  p_snag_id uuid,
  p_body text,
  p_etc_date date default null,
  p_status public.snag_status default null,
  p_acting_as text default 'resolver'
) returns public.snag_updates
  language plpgsql security definer set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_warehouse_id uuid;
  v_row public.snag_updates;
  v_old_status public.snag_status;
  v_old_etc date;
  v_side public.snag_update_side;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_acting_as not in ('reporter', 'resolver') then
    raise exception 'p_acting_as must be reporter or resolver';
  end if;

  select warehouse_id, status, etc_date into v_warehouse_id, v_old_status, v_old_etc
  from public.snags where id = p_snag_id;
  if v_warehouse_id is null then raise exception 'snag not found'; end if;

  if not (private.is_warehouse_member(v_warehouse_id) or private.is_dashboard_admin()) then
    raise exception 'not a member of this warehouse';
  end if;
  if p_status is not null and p_status not in ('wip', 'ready_to_close') then
    raise exception 'status here can only move to wip or ready_to_close';
  end if;

  v_side := case
    when private.is_warehouse_member(v_warehouse_id) then p_acting_as::public.snag_update_side
    else 'admin'
  end;

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
$function$;

revoke all on function public.post_snag_update(uuid, text, date, public.snag_status, text) from public;
grant all on function public.post_snag_update(uuid, text, date, public.snag_status, text) to authenticated, service_role;
