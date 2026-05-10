-- TrustDoc Realtime + Storage Hardening Setup
-- Run after schema.sql in Supabase SQL editor.

-- 1) Ensure tables are included in realtime publication.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'documents'
  ) then
    alter publication supabase_realtime add table public.documents;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'verification_history'
  ) then
    alter publication supabase_realtime add table public.verification_history;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'activity_logs'
  ) then
    alter publication supabase_realtime add table public.activity_logs;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'wallet_sessions'
  ) then
    alter publication supabase_realtime add table public.wallet_sessions;
  end if;
end $$;

-- 2) Optional: full old row values for richer realtime UPDATE/DELETE payloads.
alter table public.documents replica identity full;
alter table public.verification_history replica identity full;
alter table public.activity_logs replica identity full;
alter table public.wallet_sessions replica identity full;

-- 3) Storage policies (private documents bucket + profile photos bucket).
-- Create these buckets in Supabase dashboard first:
--   - documents (private)
--   - profile-photos (private)

-- Documents bucket
drop policy if exists "documents_insert_own" on storage.objects;
drop policy if exists "documents_select_own" on storage.objects;
drop policy if exists "documents_update_own" on storage.objects;
drop policy if exists "documents_delete_own" on storage.objects;

create policy "documents_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'documents'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "documents_select_own"
on storage.objects for select
to authenticated
using (
  bucket_id = 'documents'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "documents_update_own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'documents'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'documents'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "documents_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'documents'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- Profile photos bucket
drop policy if exists "profile_photos_insert_own" on storage.objects;
drop policy if exists "profile_photos_select_owner_or_public" on storage.objects;
drop policy if exists "profile_photos_update_own" on storage.objects;
drop policy if exists "profile_photos_delete_own" on storage.objects;

create policy "profile_photos_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'profile-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "profile_photos_select_owner_or_public"
on storage.objects for select
to authenticated
using (
  bucket_id = 'profile-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "profile_photos_update_own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'profile-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'profile-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "profile_photos_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'profile-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
);
