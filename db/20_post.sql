-- Post-data wiring: the auth trigger and storage policies that live in the
-- gap between the two pg_dump slices (attached to auth/storage tables, so
-- absent from a --schema=public dump; depend on public objects, so can't
-- run before it). Created here, after data is loaded, so the trigger does
-- not fire during the auth.users COPY.

\set ON_ERROR_STOP on

-- Fires on first sign-in: gate on an invitation, create the profile + tags.
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- storage.objects: the attachments-bucket policies (verified against live).
alter table storage.objects enable row level security;

create policy attachments_bucket_select_all on storage.objects
  for select to authenticated
  using (bucket_id = 'attachments');

create policy attachments_bucket_insert_members on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attachments' and (
      private.is_dashboard_admin()
      or private.is_reporter((storage.foldername(name))[1]::uuid)
      or private.is_resolver((storage.foldername(name))[1]::uuid)
    )
  );
