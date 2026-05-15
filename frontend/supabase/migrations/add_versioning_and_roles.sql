-- ============================================================================
-- MIGRATION: Add Document Versioning, Roles, and Production Features
-- Version: 001
-- Created: May 2026
-- ============================================================================

-- ============================================================================
-- 1. ADD ROLE FIELD TO PROFILES TABLE
-- ============================================================================
alter table public.profiles 
add column if not exists role text not null default 'user' 
check (role in ('user', 'issuer', 'verifier', 'admin', 'super_admin'));

-- Create index for role-based queries
create index if not exists idx_profiles_role on public.profiles (role);

-- ============================================================================
-- 2. ADD VERSIONING FIELDS TO DOCUMENTS TABLE
-- ============================================================================
alter table public.documents 
add column if not exists version integer not null default 1;

alter table public.documents 
add column if not exists parent_document_id uuid references public.documents(id) on delete cascade;

alter table public.documents 
add column if not exists title text default '';

alter table public.documents 
add column if not exists tags jsonb not null default '[]'::jsonb;

alter table public.documents 
add column if not exists is_deleted boolean not null default false;

-- Create indexes for versioning and performance
create index if not exists idx_documents_parent on public.documents (parent_document_id);
create index if not exists idx_documents_version on public.documents (user_id, version desc);
create index if not exists idx_documents_is_deleted on public.documents (is_deleted);

-- ============================================================================
-- 3. CREATE DOCUMENT VERSIONS TABLE
-- ============================================================================
create table if not exists public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  version integer not null,
  title text not null,
  description text default '',
  tags jsonb not null default '[]'::jsonb,
  privacy_level text not null default 'private',
  changed_by uuid not null references public.profiles(user_id) on delete restrict,
  change_reason text default '',
  previous_values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(document_id, version)
);

-- Create indexes for version history queries
create index if not exists idx_versions_document on public.document_versions (document_id);
create index if not exists idx_versions_created on public.document_versions (created_at desc);

-- ============================================================================
-- 4. CREATE ROLE-BASED ACCESS LOGS TABLE
-- ============================================================================
create table if not exists public.access_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  action text not null,
  resource_type text not null,
  resource_id text not null,
  access_granted boolean not null default false,
  reason text default '',
  ip_address text default '',
  user_agent text default '',
  created_at timestamptz not null default now()
);

-- Create indexes for access log queries
create index if not exists idx_access_logs_user on public.access_logs (user_id, created_at desc);
create index if not exists idx_access_logs_action on public.access_logs (action);

-- ============================================================================
-- 5. ENABLE RLS ON NEW TABLES
-- ============================================================================
alter table public.document_versions enable row level security;
alter table public.access_logs enable row level security;

-- ============================================================================
-- 6. CREATE RLS POLICIES FOR DOCUMENT VERSIONS
-- ============================================================================
drop policy if exists versions_select_own on public.document_versions;
drop policy if exists versions_insert_own on public.document_versions;

create policy versions_select_own on public.document_versions
  for select using (
    exists (
      select 1 from public.documents 
      where id = document_id and user_id = auth.uid()
    )
  );

create policy versions_insert_own on public.document_versions
  for insert with check (
    exists (
      select 1 from public.documents 
      where id = document_id and user_id = auth.uid()
    )
  );

-- ============================================================================
-- 7. CREATE RLS POLICIES FOR ACCESS LOGS
-- ============================================================================
drop policy if exists access_logs_select_own on public.access_logs;
drop policy if exists access_logs_insert_own on public.access_logs;

create policy access_logs_select_own on public.access_logs
  for select using (auth.uid() = user_id);

create policy access_logs_insert_own on public.access_logs
  for insert with check (auth.uid() = user_id);

-- ============================================================================
-- 8. UPDATE DOCUMENTS RLS POLICIES FOR SOFT DELETE
-- ============================================================================
drop policy if exists documents_select_own on public.documents;
drop policy if exists documents_select_shared on public.documents;

create policy documents_select_own on public.documents
  for select using (auth.uid() = user_id and not is_deleted);

create policy documents_select_shared on public.documents
  for select using (
    (not is_deleted) and (
      privacy_level = 'public'
      OR (
        privacy_level = 'shared'
        AND id IN (
          SELECT document_id FROM public.document_sharing
          WHERE (shared_with_user_id = auth.uid() OR shared_with_wallet = (
            SELECT wallet_address FROM public.profiles WHERE user_id = auth.uid()
          ))
          AND (expires_at IS NULL OR expires_at > now())
        )
      )
    )
  );

-- ============================================================================
-- 9. CREATE FUNCTION: Get Document Version History
-- ============================================================================
create or replace function get_document_versions(doc_id uuid)
returns table (
  version integer,
  title text,
  description text,
  tags jsonb,
  privacy_level text,
  changed_by uuid,
  changed_at timestamptz
) as $$
begin
  return query
    select 
      dv.version,
      dv.title,
      dv.description,
      dv.tags,
      dv.privacy_level,
      dv.changed_by,
      dv.created_at
    from public.document_versions dv
    where dv.document_id = doc_id
    order by dv.version desc;
end;
$$ language plpgsql security definer;

-- ============================================================================
-- 10. CREATE FUNCTION: Update Document Metadata Only
-- ============================================================================
create or replace function update_document_metadata(
  doc_id uuid,
  new_title text default null,
  new_description text default null,
  new_tags jsonb default null,
  new_privacy_level text default null,
  change_reason text default ''
)
returns table (
  success boolean,
  new_version integer,
  message text
) as $$
declare
  doc_record public.documents%rowtype;
  new_version_num integer;
begin
  -- Get current document
  select * into doc_record from public.documents where id = doc_id and user_id = auth.uid();
  
  if doc_record.id is null then
    return query select false, 0, 'Document not found or access denied'::text;
    return;
  end if;

  -- Hash must never change
  if new_title is null then
    new_title := doc_record.title;
  end if;
  
  if new_description is null then
    new_description := doc_record.description;
  end if;
  
  if new_tags is null then
    new_tags := doc_record.tags;
  end if;
  
  if new_privacy_level is null then
    new_privacy_level := doc_record.privacy_level;
  end if;

  -- Increment version
  new_version_num := doc_record.version + 1;

  -- Record version history
  insert into public.document_versions (
    document_id,
    version,
    title,
    description,
    tags,
    privacy_level,
    changed_by,
    change_reason,
    previous_values
  ) values (
    doc_id,
    new_version_num,
    new_title,
    new_description,
    new_tags,
    new_privacy_level,
    auth.uid(),
    change_reason,
    jsonb_build_object(
      'title', doc_record.title,
      'description', doc_record.description,
      'tags', doc_record.tags,
      'privacy_level', doc_record.privacy_level
    )
  );

  -- Update document
  update public.documents
  set 
    title = new_title,
    description = new_description,
    tags = new_tags,
    privacy_level = new_privacy_level,
    version = new_version_num,
    updated_at = now()
  where id = doc_id;

  return query select true, new_version_num, 'Document updated successfully'::text;
end;
$$ language plpgsql security definer;

-- ============================================================================
-- 11. CREATE FUNCTION: Soft Delete Document
-- ============================================================================
create or replace function soft_delete_document(doc_id uuid)
returns table (
  success boolean,
  message text
) as $$
begin
  update public.documents
  set is_deleted = true, updated_at = now()
  where id = doc_id and user_id = auth.uid();
  
  if not found then
    return query select false, 'Document not found or access denied'::text;
    return;
  end if;
  
  return query select true, 'Document deleted successfully'::text;
end;
$$ language plpgsql security definer;

-- ============================================================================
-- 12. CREATE FUNCTION: Check User Permission
-- ============================================================================
create or replace function user_has_permission(
  required_role text
)
returns boolean as $$
declare
  user_role text;
begin
  select role into user_role from public.profiles where user_id = auth.uid();
  
  if user_role is null then
    return false;
  end if;

  -- Role hierarchy: user < issuer < verifier < admin < super_admin
  case required_role
    when 'user' then
      return true;
    when 'issuer' then
      return user_role in ('issuer', 'admin', 'super_admin');
    when 'verifier' then
      return user_role in ('verifier', 'admin', 'super_admin');
    when 'admin' then
      return user_role in ('admin', 'super_admin');
    when 'super_admin' then
      return user_role = 'super_admin';
    else
      return false;
  end case;
end;
$$ language plpgsql security definer;

-- ============================================================================
-- COMMIT AND VERIFY
-- ============================================================================
-- This migration adds:
-- 1. Role column to profiles table
-- 2. Versioning fields to documents table
-- 3. document_versions table for history
-- 4. access_logs table for audit trail
-- 5. RLS policies for security
-- 6. SQL functions for document operations
-- 7. Indexes for query performance
--
-- All changes maintain backward compatibility and preserve existing data.
-- No existing records are deleted or modified.
-- ============================================================================
