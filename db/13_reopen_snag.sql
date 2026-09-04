-- Reopen a closed snag: back to WIP, clearing the closure stamps. Any tagged
-- warehouse member (or Dashboard Admin) may do it, same as every other snag
-- action. An optional comment is posted with it.

create or replace function public.reopen_snag(p_snag_id uuid, p_body text default null)
  returns public.snag_action_result
  language plpgsql security definer set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_warehouse_id uuid;
  v_old_status public.snag_status;
  v_row public.snags;
  v_update_id uuid;
  v_result public.snag_action_result;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select warehouse_id, status into v_warehouse_id, v_old_status
  from public.snags where id = p_snag_id;
  if v_warehouse_id is null then raise exception 'snag not found'; end if;

  if not (private.is_warehouse_member(v_warehouse_id) or private.is_dashboard_admin()) then
    raise exception 'not a member of this warehouse';
  end if;
  if v_old_status <> 'closed' then raise exception 'snag is not closed'; end if;

  update public.snags
    set status = 'wip', closed_at = null, verified_by = null, verified_at = null
    where id = p_snag_id
    returning * into v_row;

  insert into public.snag_activity (snag_id, actor_id, action, field, old_value, new_value)
  values (p_snag_id, v_uid, 'reopen', 'status', 'closed', 'wip');

  if p_body is not null and length(trim(p_body)) > 0 then
    insert into public.snag_updates (snag_id, body, author_id, author_side)
    values (p_snag_id, p_body, v_uid, 'reporter')
    returning id into v_update_id;
  end if;

  v_result.snag := v_row;
  v_result.update_id := v_update_id;
  return v_result;
end;
$function$;

revoke all on function public.reopen_snag(uuid, text) from public;
grant all on function public.reopen_snag(uuid, text) to authenticated, service_role;
