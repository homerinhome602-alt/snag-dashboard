-- Handover documents + Machine/Controller (chamber) details.
-- Both are filled in by raisers (reporter roles) or a Dashboard Admin; every
-- other warehouse member sees them read-only and can download documents.

-- ── reference list of handover document types (global) ───────────────────────
create table public.handover_document_types (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null,
  sort_order integer not null default 0
);

-- ── per-warehouse state for each document type ──────────────────────────────
create table public.warehouse_handover_documents (
  id uuid primary key default extensions.gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  doc_type_id uuid not null references public.handover_document_types(id) on delete cascade,
  file_url text,
  file_name text,
  file_size bigint,
  uploaded_by uuid references public.profiles(id),
  uploaded_at timestamptz,
  checked boolean not null default false,
  checked_by uuid references public.profiles(id),
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (warehouse_id, doc_type_id),
  -- the tick only means something once a file is attached
  constraint checked_requires_file check (checked = false or file_url is not null)
);
create index warehouse_handover_documents_warehouse_id_idx on public.warehouse_handover_documents (warehouse_id);

-- ── machine / controller detail, one row per chamber ───────────────────────
create table public.warehouse_chambers (
  id uuid primary key default extensions.gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  chamber_name text not null,
  machine_count integer,
  machine_capacity_kw real,
  odu_model text,
  idu_model text,
  controller_model text,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index warehouse_chambers_warehouse_id_idx on public.warehouse_chambers (warehouse_id);

-- ── who attached / removed / edited what ───────────────────────────────────
create table public.warehouse_asset_activity (
  id uuid primary key default extensions.gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  area text not null,        -- 'handover_document' | 'chamber'
  ref_label text,            -- document name / chamber name at the time
  action text not null,      -- upload | replace | remove | check | uncheck | add | edit | delete
  detail text,
  created_at timestamptz not null default now()
);
create index warehouse_asset_activity_warehouse_id_idx on public.warehouse_asset_activity (warehouse_id, created_at desc);

create trigger warehouse_handover_documents_set_updated_at before update on public.warehouse_handover_documents
  for each row execute function public.set_updated_at();
create trigger warehouse_chambers_set_updated_at before update on public.warehouse_chambers
  for each row execute function public.set_updated_at();

-- ── RLS: members read, reporters (or admin) write ─────────────────────────
alter table public.handover_document_types      enable row level security;
alter table public.warehouse_handover_documents enable row level security;
alter table public.warehouse_chambers           enable row level security;
alter table public.warehouse_asset_activity     enable row level security;

create policy handover_document_types_select_all on public.handover_document_types
  for select to authenticated using (true);

create policy warehouse_handover_documents_select_scoped on public.warehouse_handover_documents
  for select using (private.is_dashboard_admin() or private.is_warehouse_member(warehouse_id));
-- handover documents: any tagged member (reporter or resolver) or admin may upload/replace/remove
create policy warehouse_handover_documents_write_member on public.warehouse_handover_documents
  for all using (private.is_dashboard_admin() or private.is_warehouse_member(warehouse_id))
  with check (private.is_dashboard_admin() or private.is_warehouse_member(warehouse_id));

create policy warehouse_chambers_select_scoped on public.warehouse_chambers
  for select using (private.is_dashboard_admin() or private.is_warehouse_member(warehouse_id));
-- any tagged member (reporter or resolver) or admin may add/edit/remove chambers
create policy warehouse_chambers_write_member on public.warehouse_chambers
  for all using (private.is_dashboard_admin() or private.is_warehouse_member(warehouse_id))
  with check (private.is_dashboard_admin() or private.is_warehouse_member(warehouse_id));

create policy warehouse_asset_activity_select_scoped on public.warehouse_asset_activity
  for select using (private.is_dashboard_admin() or private.is_warehouse_member(warehouse_id));
create policy warehouse_asset_activity_insert_member on public.warehouse_asset_activity
  for insert with check (private.is_dashboard_admin() or private.is_warehouse_member(warehouse_id));

grant all on table public.handover_document_types      to anon, authenticated, service_role;
grant all on table public.warehouse_handover_documents to anon, authenticated, service_role;
grant all on table public.warehouse_chambers           to anon, authenticated, service_role;
grant all on table public.warehouse_asset_activity     to anon, authenticated, service_role;

-- ── the 15 handover documents (reference data — always present) ────────────
-- Fixed ids so a schema rebuild never invalidates rows that reference them.
insert into public.handover_document_types (id, name, sort_order) values
  ('11111111-1111-4111-8111-000000000001', 'Design layout - highlighting dimensions of all rooms and doors', 1),
  ('11111111-1111-4111-8111-000000000002', 'All installed Equipment details - model for all components', 2),
  ('11111111-1111-4111-8111-000000000003', 'Heat-load calculation - chamber wise', 3),
  ('11111111-1111-4111-8111-000000000004', 'Basis of design for each chamber', 4),
  ('11111111-1111-4111-8111-000000000005', 'Technical specifications for ODU, IDU, and PLC (Electrical panel layout )', 5),
  ('11111111-1111-4111-8111-000000000006', 'Manual for Electrical Control Panel', 6),
  ('11111111-1111-4111-8111-000000000007', 'SLD and field-wiring diagram - Unit wise', 7),
  ('11111111-1111-4111-8111-000000000008', 'Operational parameters', 8),
  ('11111111-1111-4111-8111-000000000009', 'Pressure Test and vacuum test report—circuit-wise', 9),
  ('11111111-1111-4111-8111-000000000010', 'Commissioning report - Chamber Wise', 10),
  ('11111111-1111-4111-8111-000000000011', 'Handover documentation and Warranty letter', 11),
  ('11111111-1111-4111-8111-000000000012', 'Maintenance schedule for the warranty period', 12),
  ('11111111-1111-4111-8111-000000000013', 'Escalation matrix for service and customer-care', 13),
  ('11111111-1111-4111-8111-000000000014', 'Local dealer contact details', 14),
  ('11111111-1111-4111-8111-000000000015', 'Register map for the PLC', 15);
