-- TrustDoc Enterprise Upgrade
-- Purpose:
-- 1) Add multi-organization tenancy.
-- 2) Add enterprise RBAC (roles, permissions, role bindings).
-- 3) Add document approval/signature workflow tables.
-- 4) Harden RLS and immutable audit logging.
-- 5) Preserve backward compatibility with existing document flows.

begin;

create extension if not exists pgcrypto;
create extension if not exists citext;

-- =============================================================================
-- ORGANIZATIONS
-- =============================================================================
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  organization_id text generated always as (replace(id::text, '-', '')) stored,
  name text not null,
  slug text not null unique,
  logo_url text default '',
  email_domain citext unique,
  status text not null default 'active'
    check (status in ('active', 'pending', 'suspended', 'archived')),
  created_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================================================
-- RBAC CORE TABLES
-- =============================================================================
create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  role_key text not null unique,
  name text not null,
  description text not null default '',
  is_system boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  permission_key text not null unique,
  category text not null default 'general',
  description text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'revoked')),
  assigned_by uuid references public.profiles(user_id) on delete set null,
  assigned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, organization_id, role_id)
);

-- =============================================================================
-- WORKFLOW TABLES
-- =============================================================================
create table if not exists public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  file_name text not null default '',
  file_type text not null default '',
  file_size bigint not null default 0,
  hash text not null default '',
  cid text not null default '',
  gateway_url text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  uploaded_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  unique (document_id, version_number)
);

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  reviewer_user_id uuid not null references public.profiles(user_id) on delete restrict,
  decision text not null check (decision in ('approved', 'rejected', 'revoked')),
  reason text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.signatures (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  admin_user_id uuid not null references public.profiles(user_id) on delete restrict,
  admin_name text not null default '',
  admin_identifier text not null default '',
  verification_hash text not null,
  blockchain_tx_hash text default '',
  signature_payload jsonb not null default '{}'::jsonb,
  certificate_json jsonb not null default '{}'::jsonb,
  revoked boolean not null default false,
  created_at timestamptz not null default now(),
  unique (document_id, admin_user_id, verification_hash)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references public.profiles(user_id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  type text not null default 'info',
  title text not null default 'Notification',
  message text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- =============================================================================
-- BACKWARD-COMPATIBLE PROFILE + DOCUMENT ALTERS
-- =============================================================================
alter table public.profiles
  add column if not exists organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists account_status text not null default 'active'
    check (account_status in ('active', 'pending', 'suspended', 'deactivated')),
  add column if not exists approved_by uuid references public.profiles(user_id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists role_approval_status text not null default 'approved'
    check (role_approval_status in ('pending', 'approved', 'rejected'));

alter table public.documents
  add column if not exists organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists uploader_user_id uuid references public.profiles(user_id) on delete set null,
  add column if not exists subject_user_id uuid references public.profiles(user_id) on delete set null,
  add column if not exists workflow_status text not null default 'draft'
    check (workflow_status in ('draft', 'pending', 'approved', 'rejected', 'revoked')),
  add column if not exists rejection_reason text not null default '',
  add column if not exists submitted_at timestamptz,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(user_id) on delete set null,
  add column if not exists approved_signature_id uuid references public.signatures(id) on delete set null,
  add column if not exists current_version integer not null default 1,
  add column if not exists verification_hash text not null default '';

-- =============================================================================
-- INDEXES
-- =============================================================================
create index if not exists idx_org_slug on public.organizations (slug);
create index if not exists idx_org_status on public.organizations (status);
create index if not exists idx_profiles_org on public.profiles (organization_id);
create index if not exists idx_profiles_role_status on public.profiles (role_approval_status, account_status);
create index if not exists idx_user_roles_user on public.user_roles (user_id, status);
create index if not exists idx_user_roles_org on public.user_roles (organization_id, status);
create index if not exists idx_documents_org on public.documents (organization_id, workflow_status, updated_at desc);
create index if not exists idx_documents_subject on public.documents (subject_user_id, updated_at desc);
create index if not exists idx_document_versions_document on public.document_versions (document_id, version_number desc);
create index if not exists idx_approvals_document on public.approvals (document_id, created_at desc);
create index if not exists idx_signatures_document on public.signatures (document_id, created_at desc);
create index if not exists idx_notifications_recipient on public.notifications (recipient_user_id, is_read, created_at desc);

-- =============================================================================
-- SEED ROLES + PERMISSIONS
-- =============================================================================
insert into public.roles (role_key, name, description)
values
  ('super_admin', 'Super Admin', 'Global platform administrator'),
  ('organization_admin', 'Organization Admin', 'Organization-level administrator'),
  ('staff_uploader', 'Staff/Uploader', 'Uploads and manages pending documents'),
  ('student_user', 'Student/User', 'Views own records and certificates'),
  ('verifier_auditor', 'Verifier/Auditor', 'Read-only verifier and audit user')
on conflict (role_key) do update set
  name = excluded.name,
  description = excluded.description;

insert into public.permissions (permission_key, category, description)
values
  ('organizations:manage', 'super_admin', 'Manage all organizations'),
  ('admins:manage', 'super_admin', 'Manage all organization admins'),
  ('dashboard:global', 'super_admin', 'Access global dashboard'),
  ('logs:global', 'super_admin', 'Access global audit logs'),
  ('admins:approve', 'super_admin', 'Approve/reject admins'),
  ('settings:platform', 'super_admin', 'Manage platform settings'),
  ('users:read', 'organization', 'View users inside organization'),
  ('users:update', 'organization', 'Update users inside organization'),
  ('users:suspend', 'organization', 'Suspend users inside organization'),
  ('roles:assign', 'organization', 'Assign roles inside organization'),
  ('documents:approve', 'organization', 'Approve/reject documents'),
  ('documents:sign', 'organization', 'Digitally sign verified documents'),
  ('logs:organization', 'organization', 'View organization logs'),
  ('settings:organization', 'organization', 'Manage organization settings'),
  ('documents:create', 'staff', 'Create/upload documents'),
  ('documents:update_pending', 'staff', 'Update pending documents'),
  ('documents:view_status', 'staff', 'View upload status'),
  ('documents:view_own', 'student', 'View own documents'),
  ('documents:download_verified', 'student', 'Download verified certificates'),
  ('verification:read_own', 'student', 'View own verification status'),
  ('verification:perform', 'auditor', 'Verify authenticity'),
  ('audit:read', 'auditor', 'Read audit records')
on conflict (permission_key) do update set
  category = excluded.category,
  description = excluded.description;

with role_perm(role_key, permission_key) as (
  values
    -- super_admin
    ('super_admin', 'organizations:manage'),
    ('super_admin', 'admins:manage'),
    ('super_admin', 'dashboard:global'),
    ('super_admin', 'logs:global'),
    ('super_admin', 'admins:approve'),
    ('super_admin', 'settings:platform'),
    ('super_admin', 'users:read'),
    ('super_admin', 'users:update'),
    ('super_admin', 'users:suspend'),
    ('super_admin', 'roles:assign'),
    ('super_admin', 'documents:approve'),
    ('super_admin', 'documents:sign'),
    ('super_admin', 'logs:organization'),
    ('super_admin', 'settings:organization'),
    ('super_admin', 'documents:create'),
    ('super_admin', 'documents:update_pending'),
    ('super_admin', 'documents:view_status'),
    ('super_admin', 'documents:view_own'),
    ('super_admin', 'documents:download_verified'),
    ('super_admin', 'verification:read_own'),
    ('super_admin', 'verification:perform'),
    ('super_admin', 'audit:read'),
    -- organization_admin
    ('organization_admin', 'users:read'),
    ('organization_admin', 'users:update'),
    ('organization_admin', 'users:suspend'),
    ('organization_admin', 'roles:assign'),
    ('organization_admin', 'documents:approve'),
    ('organization_admin', 'documents:sign'),
    ('organization_admin', 'logs:organization'),
    ('organization_admin', 'settings:organization'),
    ('organization_admin', 'audit:read'),
    -- staff_uploader
    ('staff_uploader', 'documents:create'),
    ('staff_uploader', 'documents:update_pending'),
    ('staff_uploader', 'documents:view_status'),
    ('staff_uploader', 'documents:view_own'),
    ('staff_uploader', 'verification:read_own'),
    -- student_user
    ('student_user', 'documents:view_own'),
    ('student_user', 'documents:download_verified'),
    ('student_user', 'verification:read_own'),
    -- verifier_auditor
    ('verifier_auditor', 'verification:perform'),
    ('verifier_auditor', 'audit:read'),
    ('verifier_auditor', 'documents:view_status')
)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from role_perm rp
join public.roles r on r.role_key = rp.role_key
join public.permissions p on p.permission_key = rp.permission_key
on conflict (role_id, permission_id) do nothing;

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================
create or replace function public.get_user_org_id(p_user_id uuid)
returns uuid
language sql
stable
as $$
  select pr.organization_id
  from public.profiles pr
  where pr.user_id = p_user_id
  limit 1
$$;

create or replace function public.is_super_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = p_user_id
      and ur.status = 'active'
      and r.role_key = 'super_admin'
  )
$$;

create or replace function public.has_role(
  p_user_id uuid,
  p_role_key text,
  p_organization_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = p_user_id
      and ur.status = 'active'
      and r.role_key = p_role_key
      and (
        r.role_key = 'super_admin'
        or p_organization_id is null
        or ur.organization_id = p_organization_id
      )
  )
$$;

create or replace function public.has_permission(
  p_permission_key text,
  p_organization_id uuid default null,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id
    where ur.user_id = p_user_id
      and ur.status = 'active'
      and p.permission_key = p_permission_key
      and (
        r.role_key = 'super_admin'
        or p_organization_id is null
        or ur.organization_id = p_organization_id
      )
  )
$$;

create or replace function public.same_organization(
  p_organization_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when public.is_super_admin(p_user_id) then true
      else exists (
        select 1
        from public.profiles pr
        where pr.user_id = p_user_id
          and pr.organization_id = p_organization_id
      )
    end
$$;

create or replace function public.current_user_permissions(
  p_organization_id uuid default null
)
returns table(permission_key text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct p.permission_key
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  join public.role_permissions rp on rp.role_id = ur.role_id
  join public.permissions p on p.id = rp.permission_id
  where ur.user_id = auth.uid()
    and ur.status = 'active'
    and (
      r.role_key = 'super_admin'
      or p_organization_id is null
      or ur.organization_id = p_organization_id
    )
$$;

create or replace function public.compute_document_verification_hash(
  p_hash text,
  p_cid text,
  p_tx_hash text,
  p_status text,
  p_organization_id uuid
)
returns text
language sql
immutable
as $$
  select encode(
    digest(
      coalesce(p_hash, '') || '|' ||
      coalesce(p_cid, '') || '|' ||
      coalesce(p_tx_hash, '') || '|' ||
      coalesce(p_status, '') || '|' ||
      coalesce(p_organization_id::text, ''),
      'sha256'
    ),
    'hex'
  )
$$;

-- =============================================================================
-- IMMUTABLE AUDIT LOG HARDENING
-- =============================================================================
alter table public.audit_logs
  add column if not exists organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists role_key text not null default '',
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists previous_hash text not null default '',
  add column if not exists event_hash text not null default '';

create index if not exists idx_audit_org_created on public.audit_logs (organization_id, created_at desc);
create index if not exists idx_audit_role on public.audit_logs (role_key, created_at desc);
create index if not exists idx_audit_event_hash on public.audit_logs (event_hash);

create or replace function public.audit_log_enrich()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_event_hash text;
begin
  if new.organization_id is null and new.user_id is not null then
    new.organization_id := public.get_user_org_id(new.user_id);
  end if;

  select al.event_hash
  into previous_event_hash
  from public.audit_logs al
  where (
    (new.organization_id is null and al.organization_id is null)
    or al.organization_id = new.organization_id
  )
  order by al.created_at desc, al.id desc
  limit 1;

  new.previous_hash := coalesce(previous_event_hash, '');
  new.event_hash := encode(
    digest(
      coalesce(new.user_id::text, '') || '|' ||
      coalesce(new.role_key, '') || '|' ||
      coalesce(new.action, '') || '|' ||
      coalesce(new.resource_type, '') || '|' ||
      coalesce(new.resource_id, '') || '|' ||
      coalesce(new.status, '') || '|' ||
      coalesce(new.ip_address, '') || '|' ||
      coalesce(new.previous_hash, '') || '|' ||
      coalesce(new.metadata::text, ''),
      'sha256'
    ),
    'hex'
  );

  return new;
end;
$$;

drop trigger if exists trg_audit_log_enrich on public.audit_logs;
create trigger trg_audit_log_enrich
before insert on public.audit_logs
for each row execute function public.audit_log_enrich();

create or replace function public.prevent_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_logs are immutable';
end;
$$;

drop trigger if exists trg_prevent_audit_update on public.audit_logs;
create trigger trg_prevent_audit_update
before update on public.audit_logs
for each row execute function public.prevent_audit_mutation();

drop trigger if exists trg_prevent_audit_delete on public.audit_logs;
create trigger trg_prevent_audit_delete
before delete on public.audit_logs
for each row execute function public.prevent_audit_mutation();

-- =============================================================================
-- PROFILE/DOCUMENT DEFAULTS + VERSION TRACKING
-- =============================================================================
create or replace function public.profile_set_org_from_email_domain()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  domain_value text;
  org_match uuid;
begin
  if new.email is not null and new.organization_id is null then
    domain_value := lower(split_part(new.email, '@', 2));
    if domain_value is not null and domain_value <> '' then
      select o.id
      into org_match
      from public.organizations o
      where o.email_domain = domain_value
        and o.status = 'active'
      limit 1;

      if org_match is not null then
        new.organization_id := org_match;
      end if;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_set_org on public.profiles;
create trigger trg_profiles_set_org
before insert or update on public.profiles
for each row execute function public.profile_set_org_from_email_domain();

create or replace function public.assign_default_user_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  default_role_id uuid;
begin
  select id into default_role_id
  from public.roles
  where role_key = 'student_user'
  limit 1;

  if default_role_id is not null then
    insert into public.user_roles (user_id, organization_id, role_id, status)
    values (new.user_id, new.organization_id, default_role_id, 'active')
    on conflict (user_id, organization_id, role_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_assign_default_user_role on public.profiles;
create trigger trg_assign_default_user_role
after insert on public.profiles
for each row execute function public.assign_default_user_role();

create or replace function public.document_prepare_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inferred_org_id uuid;
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;

  if new.subject_user_id is null then
    new.subject_user_id := new.user_id;
  end if;

  if new.uploader_user_id is null then
    new.uploader_user_id := auth.uid();
  end if;

  if new.organization_id is null then
    select pr.organization_id
    into inferred_org_id
    from public.profiles pr
    where pr.user_id = coalesce(new.subject_user_id, new.user_id)
    limit 1;
    new.organization_id := inferred_org_id;
  end if;

  if new.workflow_status is null then
    new.workflow_status := 'draft';
  end if;

  if tg_op = 'INSERT' and new.submitted_at is null and new.workflow_status = 'pending' then
    new.submitted_at := now();
  end if;

  if tg_op = 'UPDATE' and new.workflow_status is distinct from old.workflow_status then
    if new.workflow_status = 'pending' and new.submitted_at is null then
      new.submitted_at := now();
    end if;
    if new.workflow_status in ('approved', 'rejected', 'revoked') then
      new.reviewed_at := now();
      new.reviewed_by := coalesce(new.reviewed_by, auth.uid());
    end if;
  end if;

  new.verification_hash := public.compute_document_verification_hash(
    new.hash,
    new.cid,
    new.tx_hash,
    new.workflow_status,
    new.organization_id
  );
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_document_prepare_defaults on public.documents;
create trigger trg_document_prepare_defaults
before insert or update on public.documents
for each row execute function public.document_prepare_defaults();

create or replace function public.document_create_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_version integer;
  should_version boolean;
begin
  if tg_op = 'INSERT' then
    insert into public.document_versions (
      document_id,
      organization_id,
      version_number,
      file_name,
      file_type,
      file_size,
      hash,
      cid,
      gateway_url,
      metadata,
      uploaded_by
    )
    values (
      new.id,
      new.organization_id,
      1,
      coalesce(new.file_name, ''),
      coalesce(new.file_type, ''),
      coalesce(new.file_size, 0),
      coalesce(new.hash, ''),
      coalesce(new.cid, ''),
      coalesce(new.gateway_url, ''),
      coalesce(new.metadata, '{}'::jsonb),
      coalesce(new.uploader_user_id, auth.uid())
    )
    on conflict do nothing;
    return new;
  end if;

  should_version := (
    new.hash is distinct from old.hash
    or new.cid is distinct from old.cid
    or new.file_name is distinct from old.file_name
    or new.file_size is distinct from old.file_size
    or new.file_type is distinct from old.file_type
    or new.gateway_url is distinct from old.gateway_url
    or new.metadata is distinct from old.metadata
  );

  if should_version then
    select coalesce(max(dv.version_number), 0) + 1
    into next_version
    from public.document_versions dv
    where dv.document_id = new.id;

    insert into public.document_versions (
      document_id,
      organization_id,
      version_number,
      file_name,
      file_type,
      file_size,
      hash,
      cid,
      gateway_url,
      metadata,
      uploaded_by
    )
    values (
      new.id,
      new.organization_id,
      next_version,
      coalesce(new.file_name, ''),
      coalesce(new.file_type, ''),
      coalesce(new.file_size, 0),
      coalesce(new.hash, ''),
      coalesce(new.cid, ''),
      coalesce(new.gateway_url, ''),
      coalesce(new.metadata, '{}'::jsonb),
      coalesce(new.uploader_user_id, auth.uid())
    );

    update public.documents
    set current_version = next_version
    where id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_document_create_version on public.documents;
create trigger trg_document_create_version
after insert or update on public.documents
for each row execute function public.document_create_version();

-- =============================================================================
-- ROLE ESCALATION SAFEGUARD
-- =============================================================================
create or replace function public.enforce_user_roles_guardrails()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_role_key text;
  actor_is_super_admin boolean;
begin
  select role_key into target_role_key from public.roles where id = new.role_id;
  actor_is_super_admin := public.is_super_admin(auth.uid());

  if target_role_key = 'super_admin' and not actor_is_super_admin then
    raise exception 'Only super admins can assign super_admin role';
  end if;

  if target_role_key <> 'super_admin' and new.organization_id is null then
    raise exception 'Organization-scoped roles require organization_id';
  end if;

  if target_role_key = 'super_admin' then
    new.organization_id := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_user_roles_guardrails on public.user_roles;
create trigger trg_user_roles_guardrails
before insert or update on public.user_roles
for each row execute function public.enforce_user_roles_guardrails();

-- =============================================================================
-- RLS: ENABLE
-- =============================================================================
alter table public.organizations enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.document_versions enable row level security;
alter table public.approvals enable row level security;
alter table public.signatures enable row level security;
alter table public.notifications enable row level security;

-- Profiles/documents/audit already had RLS enabled in base schema.

-- =============================================================================
-- RLS: ORGANIZATIONS
-- =============================================================================
drop policy if exists organizations_select_policy on public.organizations;
drop policy if exists organizations_manage_policy on public.organizations;

create policy organizations_select_policy on public.organizations
for select using (
  public.is_super_admin(auth.uid())
  or public.same_organization(id, auth.uid())
);

create policy organizations_manage_policy on public.organizations
for all using (
  public.is_super_admin(auth.uid())
)
with check (
  public.is_super_admin(auth.uid())
);

-- =============================================================================
-- RLS: ROLES/PERMISSIONS/ROLE_PERMISSIONS
-- =============================================================================
drop policy if exists roles_read_policy on public.roles;
drop policy if exists permissions_read_policy on public.permissions;
drop policy if exists role_permissions_read_policy on public.role_permissions;

create policy roles_read_policy on public.roles
for select using (auth.uid() is not null);

create policy permissions_read_policy on public.permissions
for select using (auth.uid() is not null);

create policy role_permissions_read_policy on public.role_permissions
for select using (auth.uid() is not null);

-- No direct writes from clients.

-- =============================================================================
-- RLS: USER ROLES
-- =============================================================================
drop policy if exists user_roles_select_policy on public.user_roles;
drop policy if exists user_roles_manage_policy on public.user_roles;

create policy user_roles_select_policy on public.user_roles
for select using (
  user_id = auth.uid()
  or public.has_permission('users:read', organization_id, auth.uid())
  or public.is_super_admin(auth.uid())
);

create policy user_roles_manage_policy on public.user_roles
for all using (
  public.has_permission('roles:assign', organization_id, auth.uid())
  or public.is_super_admin(auth.uid())
)
with check (
  public.has_permission('roles:assign', organization_id, auth.uid())
  or public.is_super_admin(auth.uid())
);

-- =============================================================================
-- RLS: PROFILES (replace "own-only" with role-aware access)
-- =============================================================================
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists profiles_delete_own on public.profiles;

create policy profiles_select_policy on public.profiles
for select using (
  user_id = auth.uid()
  or public.has_permission('users:read', organization_id, auth.uid())
  or public.is_super_admin(auth.uid())
);

create policy profiles_insert_policy on public.profiles
for insert with check (
  user_id = auth.uid()
  or public.has_permission('users:update', organization_id, auth.uid())
  or public.is_super_admin(auth.uid())
);

create policy profiles_update_policy on public.profiles
for update using (
  user_id = auth.uid()
  or public.has_permission('users:update', organization_id, auth.uid())
  or public.is_super_admin(auth.uid())
)
with check (
  (
    user_id = auth.uid()
    or public.has_permission('users:update', organization_id, auth.uid())
    or public.is_super_admin(auth.uid())
  )
  and (
    not public.has_role(user_id, 'super_admin', null) or public.is_super_admin(auth.uid())
  )
);

create policy profiles_delete_policy on public.profiles
for delete using (
  public.is_super_admin(auth.uid())
);

-- =============================================================================
-- RLS: DOCUMENTS (replace old policies)
-- =============================================================================
drop policy if exists documents_select_own on public.documents;
drop policy if exists documents_select_shared on public.documents;
drop policy if exists documents_insert_own on public.documents;
drop policy if exists documents_update_own on public.documents;
drop policy if exists documents_delete_own on public.documents;

create policy documents_select_policy on public.documents
for select using (
  public.is_super_admin(auth.uid())
  or (
    public.same_organization(organization_id, auth.uid())
    and (
      user_id = auth.uid()
      or subject_user_id = auth.uid()
      or public.has_permission('documents:view_status', organization_id, auth.uid())
      or public.has_permission('documents:approve', organization_id, auth.uid())
      or public.has_permission('verification:perform', organization_id, auth.uid())
    )
  )
  or (
    privacy_level = 'public'
    and public.has_permission('verification:perform', organization_id, auth.uid())
  )
);

create policy documents_insert_policy on public.documents
for insert with check (
  public.is_super_admin(auth.uid())
  or (
    public.same_organization(organization_id, auth.uid())
    and (
      user_id = auth.uid()
      or public.has_permission('documents:create', organization_id, auth.uid())
    )
  )
);

create policy documents_update_policy on public.documents
for update using (
  public.is_super_admin(auth.uid())
  or (
    public.same_organization(organization_id, auth.uid())
    and (
      public.has_permission('documents:approve', organization_id, auth.uid())
      or public.has_permission('documents:update_pending', organization_id, auth.uid())
      or uploader_user_id = auth.uid()
      or user_id = auth.uid()
    )
  )
)
with check (
  public.is_super_admin(auth.uid())
  or (
    public.same_organization(organization_id, auth.uid())
    and (
      public.has_permission('documents:approve', organization_id, auth.uid())
      or (
        public.has_permission('documents:update_pending', organization_id, auth.uid())
        and workflow_status in ('draft', 'pending', 'rejected')
      )
      or uploader_user_id = auth.uid()
      or user_id = auth.uid()
    )
  )
);

create policy documents_delete_policy on public.documents
for delete using (
  public.is_super_admin(auth.uid())
);

-- =============================================================================
-- RLS: DOCUMENT VERSIONS / APPROVALS / SIGNATURES / NOTIFICATIONS
-- =============================================================================
drop policy if exists document_versions_select_policy on public.document_versions;
drop policy if exists document_versions_manage_policy on public.document_versions;

create policy document_versions_select_policy on public.document_versions
for select using (
  public.is_super_admin(auth.uid())
  or (
    public.same_organization(organization_id, auth.uid())
    and (
      public.has_permission('documents:view_status', organization_id, auth.uid())
      or public.has_permission('documents:approve', organization_id, auth.uid())
      or public.has_permission('verification:perform', organization_id, auth.uid())
      or exists (
        select 1
        from public.documents d
        where d.id = document_id
          and (d.user_id = auth.uid() or d.subject_user_id = auth.uid())
      )
    )
  )
);

create policy document_versions_manage_policy on public.document_versions
for insert with check (
  public.is_super_admin(auth.uid())
  or public.has_permission('documents:create', organization_id, auth.uid())
  or public.has_permission('documents:update_pending', organization_id, auth.uid())
  or public.has_permission('documents:approve', organization_id, auth.uid())
);

drop policy if exists approvals_select_policy on public.approvals;
drop policy if exists approvals_insert_policy on public.approvals;

create policy approvals_select_policy on public.approvals
for select using (
  public.is_super_admin(auth.uid())
  or public.same_organization(organization_id, auth.uid())
);

create policy approvals_insert_policy on public.approvals
for insert with check (
  public.is_super_admin(auth.uid())
  or public.has_permission('documents:approve', organization_id, auth.uid())
);

drop policy if exists signatures_select_policy on public.signatures;
drop policy if exists signatures_insert_policy on public.signatures;
drop policy if exists signatures_update_policy on public.signatures;

create policy signatures_select_policy on public.signatures
for select using (
  public.is_super_admin(auth.uid())
  or public.same_organization(organization_id, auth.uid())
);

create policy signatures_insert_policy on public.signatures
for insert with check (
  public.is_super_admin(auth.uid())
  or public.has_permission('documents:sign', organization_id, auth.uid())
);

create policy signatures_update_policy on public.signatures
for update using (
  public.is_super_admin(auth.uid())
  or public.has_permission('documents:sign', organization_id, auth.uid())
)
with check (
  public.is_super_admin(auth.uid())
  or public.has_permission('documents:sign', organization_id, auth.uid())
);

drop policy if exists notifications_select_policy on public.notifications;
drop policy if exists notifications_insert_policy on public.notifications;
drop policy if exists notifications_update_policy on public.notifications;

create policy notifications_select_policy on public.notifications
for select using (
  recipient_user_id = auth.uid()
  or public.is_super_admin(auth.uid())
  or public.has_permission('users:read', organization_id, auth.uid())
);

create policy notifications_insert_policy on public.notifications
for insert with check (
  public.is_super_admin(auth.uid())
  or public.has_permission('users:update', organization_id, auth.uid())
  or public.has_permission('documents:approve', organization_id, auth.uid())
);

create policy notifications_update_policy on public.notifications
for update using (
  recipient_user_id = auth.uid()
  or public.is_super_admin(auth.uid())
)
with check (
  recipient_user_id = auth.uid()
  or public.is_super_admin(auth.uid())
);

-- =============================================================================
-- RLS: AUDIT LOGS (replace old policies)
-- =============================================================================
drop policy if exists audit_select_own on public.audit_logs;
drop policy if exists audit_insert on public.audit_logs;

create policy audit_select_policy on public.audit_logs
for select using (
  public.is_super_admin(auth.uid())
  or (
    public.same_organization(organization_id, auth.uid())
    and (
      user_id = auth.uid()
      or public.has_permission('logs:organization', organization_id, auth.uid())
      or public.has_permission('audit:read', organization_id, auth.uid())
    )
  )
);

create policy audit_insert_policy on public.audit_logs
for insert with check (
  (
    user_id = auth.uid()
    and public.same_organization(organization_id, auth.uid())
  )
  or public.is_super_admin(auth.uid())
  or public.has_permission('logs:organization', organization_id, auth.uid())
);

-- Do not create update/delete policies for audit_logs.

-- =============================================================================
-- REALTIME PUBLICATION EXTENSIONS
-- =============================================================================
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'approvals'
  ) then
    alter publication supabase_realtime add table public.approvals;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'audit_logs'
  ) then
    alter publication supabase_realtime add table public.audit_logs;
  end if;
end $$;

alter table public.approvals replica identity full;
alter table public.notifications replica identity full;
alter table public.audit_logs replica identity full;

commit;

