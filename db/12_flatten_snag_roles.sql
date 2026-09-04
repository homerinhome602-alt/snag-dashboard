-- Reporter / Resolver are now organisational labels only — any tagged member
-- of a warehouse may perform every snag task (raise, comment, set ETC, move
-- status, close, verify, set the go-live date). The two primitives below are
-- what every RPC and RLS policy checks, so redefining them opens all of it at
-- once. The 6 role tags, their colours, and the sided chat feed are unchanged.

create or replace function private.is_reporter(p_warehouse_id uuid) returns boolean
  language sql stable security definer set search_path to ''
  as $$ select private.is_warehouse_member(p_warehouse_id); $$;

create or replace function private.is_resolver(p_warehouse_id uuid) returns boolean
  language sql stable security definer set search_path to ''
  as $$ select private.is_warehouse_member(p_warehouse_id); $$;
