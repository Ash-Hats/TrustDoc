-- TrustDoc Supabase Schema (PostgreSQL) - Production Edition
-- Run in Supabase SQL Editor after creating project and enabling email/OAuth providers.

create extension if not exists pgcrypto;

-- ============================================================================
-- USER PROFILE TABLE
-- ============================================================================
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text default '',
  organization_name text default '',
  organization_role text default '',
  wallet_address text default '',
  profile_photo_url text default '',
  setup_completed boolean not null default false,
  setup_step text default 'identity',
  bio text default '',
  settings jsonb not null default '{
    "theme": "dark",
    "notifications": true,
    "autoConnect": true,
    "securityMode": "strict"
  }'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz not null default now()
);

-- ============================================================================
-- DOCUMENTS TABLE - Now with Privacy Levels
-- ============================================================================
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  hash text not null,
  wallet_address text default '',
  cid text default '',
  doc_type text default 'General',
  issued_by text default 'Unknown',
  tx_hash text default '',
  gateway_url text default '',
  is_revoked boolean not null default false,
  timestamp bigint not null default 0,
  block_timestamp bigint not null default 0,
  privacy_level text not null default 'private' check (privacy_level in ('private', 'shared', 'public')),
  description text default '',
  file_name text default '',
  file_size integer default 0,
  file_type text default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, hash)
);

-- ============================================================================
-- DOCUMENT SHARING TABLE - For shared access control
-- ============================================================================
create table if not exists public.document_sharing (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  owner_id uuid not null references public.profiles(user_id) on delete cascade,
  shared_with_user_id uuid references public.profiles(user_id) on delete cascade,
  shared_with_wallet text default '',
  share_type text not null default 'view' check (share_type in ('view', 'verify')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz
);

-- ============================================================================
-- WALLET SESSION TABLE - For wallet management
-- ============================================================================
create table if not exists public.wallet_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  wallet_address text not null,
  chain_id integer not null default 80002,
  signature text not null,
  message text not null,
  verified boolean not null default false,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  unique(user_id, wallet_address)
);

-- ============================================================================
-- VERIFICATION HISTORY TABLE
-- ============================================================================
create table if not exists public.verification_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  source text not null default 'verify',
  status text not null default 'not-found',
  hash text not null,
  issuer text default 'Unknown',
  tx_hash text default '',
  confidence_score numeric(5,2) not null default 0,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- ACTIVITY LOGS TABLE
-- ============================================================================
create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  type text not null default 'info',
  title text not null default 'Activity',
  description text default '',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- AUDIT LOGS TABLE - For security and compliance
-- ============================================================================
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  action text not null,
  resource_type text not null,
  resource_id text not null,
  changes jsonb not null default '{}'::jsonb,
  ip_address text default '',
  user_agent text default '',
  status text not null default 'success',
  error_message text default '',
  created_at timestamptz not null default now()
);

-- ============================================================================
-- SUSPICIOUS ACTIVITY LOGS - For fraud detection
-- ============================================================================
create table if not exists public.suspicious_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  activity_type text not null,
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  description text not null,
  meta jsonb not null default '{}'::jsonb,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);


-- ============================================================================
-- INDEXES for performance
-- ============================================================================
create index if not exists idx_profiles_wallet_lower on public.profiles (lower(wallet_address));
create index if not exists idx_profiles_updated_at on public.profiles (updated_at desc);
create index if not exists idx_documents_user_ts on public.documents (user_id, timestamp desc);
create index if not exists idx_documents_hash on public.documents (hash);
create index if not exists idx_documents_privacy on public.documents (privacy_level);
create index if not exists idx_sharing_document on public.document_sharing (document_id);
create index if not exists idx_sharing_owner on public.document_sharing (owner_id);
create index if not exists idx_sharing_recipient on public.document_sharing (shared_with_user_id);
create index if not exists idx_wallet_sessions_user on public.wallet_sessions (user_id);
create index if not exists idx_wallet_sessions_verified on public.wallet_sessions (verified);
create index if not exists idx_verification_user_created on public.verification_history (user_id, created_at desc);
create index if not exists idx_activity_user_created on public.activity_logs (user_id, created_at desc);
create index if not exists idx_audit_user_created on public.audit_logs (user_id, created_at desc);
create index if not exists idx_audit_action on public.audit_logs (action);
create index if not exists idx_suspicious_unresolved on public.suspicious_activity (resolved, created_at desc);

-- ============================================================================
-- ROW LEVEL SECURITY - Enable RLS on all tables
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.documents enable row level security;
alter table public.document_sharing enable row level security;
alter table public.wallet_sessions enable row level security;
alter table public.verification_history enable row level security;
alter table public.activity_logs enable row level security;
alter table public.audit_logs enable row level security;
alter table public.suspicious_activity enable row level security;

-- ============================================================================
-- PROFILES POLICIES
-- ============================================================================
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists profiles_delete_own on public.profiles;

create policy profiles_select_own on public.profiles
  for select using (auth.uid() = user_id);
create policy profiles_insert_own on public.profiles
  for insert with check (auth.uid() = user_id);
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy profiles_delete_own on public.profiles
  for delete using (auth.uid() = user_id);

-- ============================================================================
-- DOCUMENTS POLICIES - Private by default, with sharing support
-- ============================================================================
drop policy if exists documents_select_own on public.documents;
drop policy if exists documents_select_shared on public.documents;
drop policy if exists documents_insert_own on public.documents;
drop policy if exists documents_update_own on public.documents;
drop policy if exists documents_delete_own on public.documents;

create policy documents_select_own on public.documents
  for select using (auth.uid() = user_id);

create policy documents_select_shared on public.documents
  for select using (
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
  );

create policy documents_insert_own on public.documents
  for insert with check (auth.uid() = user_id);

create policy documents_update_own on public.documents
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy documents_delete_own on public.documents
  for delete using (auth.uid() = user_id);

-- ============================================================================
-- DOCUMENT SHARING POLICIES
-- ============================================================================
drop policy if exists sharing_select_own on public.document_sharing;
drop policy if exists sharing_insert_own on public.document_sharing;
drop policy if exists sharing_update_own on public.document_sharing;
drop policy if exists sharing_delete_own on public.document_sharing;

create policy sharing_select_own on public.document_sharing
  for select using (auth.uid() = owner_id OR auth.uid() = shared_with_user_id);

create policy sharing_insert_own on public.document_sharing
  for insert with check (auth.uid() = owner_id);

create policy sharing_update_own on public.document_sharing
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy sharing_delete_own on public.document_sharing
  for delete using (auth.uid() = owner_id);

-- ============================================================================
-- WALLET SESSIONS POLICIES
-- ============================================================================
drop policy if exists wallet_select_own on public.wallet_sessions;
drop policy if exists wallet_insert_own on public.wallet_sessions;
drop policy if exists wallet_update_own on public.wallet_sessions;
drop policy if exists wallet_delete_own on public.wallet_sessions;

create policy wallet_select_own on public.wallet_sessions
  for select using (auth.uid() = user_id);

create policy wallet_insert_own on public.wallet_sessions
  for insert with check (auth.uid() = user_id);

create policy wallet_update_own on public.wallet_sessions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy wallet_delete_own on public.wallet_sessions
  for delete using (auth.uid() = user_id);

-- ============================================================================
-- VERIFICATION HISTORY POLICIES
-- ============================================================================
drop policy if exists verification_select_own on public.verification_history;
drop policy if exists verification_insert_own on public.verification_history;
drop policy if exists verification_update_own on public.verification_history;
drop policy if exists verification_delete_own on public.verification_history;

create policy verification_select_own on public.verification_history
  for select using (auth.uid() = user_id);

create policy verification_insert_own on public.verification_history
  for insert with check (auth.uid() = user_id);

create policy verification_update_own on public.verification_history
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy verification_delete_own on public.verification_history
  for delete using (auth.uid() = user_id);

-- ============================================================================
-- ACTIVITY LOGS POLICIES
-- ============================================================================
drop policy if exists activity_select_own on public.activity_logs;
drop policy if exists activity_insert_own on public.activity_logs;
drop policy if exists activity_update_own on public.activity_logs;
drop policy if exists activity_delete_own on public.activity_logs;

create policy activity_select_own on public.activity_logs
  for select using (auth.uid() = user_id);

create policy activity_insert_own on public.activity_logs
  for insert with check (auth.uid() = user_id);

create policy activity_update_own on public.activity_logs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy activity_delete_own on public.activity_logs
  for delete using (auth.uid() = user_id);

-- ============================================================================
-- AUDIT LOGS POLICIES - Users can only read their own
-- ============================================================================
drop policy if exists audit_select_own on public.audit_logs;
drop policy if exists audit_insert on public.audit_logs;

create policy audit_select_own on public.audit_logs
  for select using (auth.uid() = user_id);

create policy audit_insert on public.audit_logs
  for insert with check (auth.uid() = user_id);

-- ============================================================================
-- SUSPICIOUS ACTIVITY POLICIES - Users can only read their own
-- ============================================================================
drop policy if exists suspicious_select_own on public.suspicious_activity;
drop policy if exists suspicious_insert on public.suspicious_activity;

create policy suspicious_select_own on public.suspicious_activity
  for select using (auth.uid() = user_id);

create policy suspicious_insert on public.suspicious_activity
  for insert with check (auth.uid() = user_id);
