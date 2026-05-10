# TrustDoc Project Audit Report

## 1) Architecture Upgrade Summary

### Completed
- Added production-ready auth foundation using Supabase Auth (email/password, Google OAuth, wallet sign-in bridge).
- Added protected/public route architecture with auth guards.
- Added user-scoped app state (documents, verification history, activity, settings) keyed by authenticated user.
- Added Supabase integration service for profile/documents/verification/activity persistence.
- Added SQL schema with RLS policies (`frontend/supabase/schema.sql`).
- Moved wallet control panel out of sidebar into Settings account center.
- Added full Settings account center (wallet management, account/profile, security, notifications, logout, delete account data).
- Implemented clickable dashboard stat cards with filter navigation to My Documents.
- Implemented URL-synced global search/filter/sort/pagination system across Dashboard and My Documents.
- Added realtime derived status model (`verified`, `pending`, `tampered`) from blockchain docs + pending tx + verification history.
- Added auth pages: Login, Register, Forgot Password, OAuth callback, Profile.
- Kept blockchain registration/verification functions intact (`registerDocumentOnChain`, `verifyDocumentOnChain`, polling, event subscriptions).

### Validated
- `npm run lint` passes.
- `npm run build` passes.

## 2) Auth Flow Explanation

1. User opens app.
2. Protected routes redirect to `/login` when not authenticated.
3. User can authenticate via:
   - Email/password
   - Google OAuth
   - Wallet sign-in bridge
4. Session tokens are persisted locally and refreshed before expiry.
5. On sign-in, user profile is created/upserted in `profiles`.
6. Wallet can be connected and linked in Settings/Profile.
7. App state (documents/history/activity/settings) loads scoped to that user.
8. Logout clears session and protected route access.

## 3) Database Structure

Implemented in `frontend/supabase/schema.sql`:

- `profiles`
  - `user_id` (PK, auth user reference)
  - `email`, `display_name`, `wallet_address`
  - `settings` JSONB
  - `created_at`, `updated_at`, `last_login_at`

- `documents`
  - `id` (PK)
  - `user_id` (FK -> profiles)
  - `hash`, `wallet_address`, `cid`, `doc_type`, `issued_by`, `tx_hash`
  - `gateway_url`, `is_revoked`, `timestamp`, `block_timestamp`, `metadata`
  - unique `(user_id, hash)`

- `verification_history`
  - `id` (PK)
  - `user_id` (FK)
  - `source`, `status`, `hash`, `issuer`, `tx_hash`, `confidence_score`, `created_at`

- `activity_logs`
  - `id` (PK)
  - `user_id` (FK)
  - `type`, `title`, `description`, `meta`, `created_at`

Security:
- RLS enabled on all tables.
- Owner-only `select/insert/update/delete` policies by `auth.uid() = user_id`.

## 4) User Flow Diagram

```text
[Open App]
   |
   v
[Auth Check] --no--> [Login/Register/Forgot]
   | yes
   v
[Protected Workspace]
   |
   +--> [Settings] --> [Connect Wallet] --> [Link Wallet]
   |         |
   |         +--> [Switch Network / Disconnect / Permissions]
   |
   +--> [Dashboard] --> [Stat Card Click] --> [My Documents + URL Filters]
   |
   +--> [Register Document] --> [Pinata + Contract Write] --> [Pending Tx] --> [Confirmed]
   |
   +--> [Verify Document] --> [On-chain + Signature + Metadata Checks]
   |
   +--> [Analytics] (user-scoped)
```

## 5) Security Checklist

- [x] Protected routes for authenticated modules
- [x] Session persistence + refresh flow
- [x] User-scoped local cache keys
- [x] User-scoped DB tables with RLS
- [x] Wallet-network enforcement for Polygon Amoy
- [x] Input sanitization for text/file metadata paths
- [x] Auth/session controls in centralized account center
- [x] Logout + wallet disconnect flows
- [x] Account data deletion flow (DB data)
- [ ] Optional: server-side wallet SIWE verification (recommended for stronger wallet auth model)
- [ ] Optional: CSP/security headers at hosting layer
- [ ] Optional: backend webhook/audit trail signing for compliance-grade logs

## 6) Deployment Checklist

- [x] Added `.env.example` with required vars
- [x] Added Supabase schema SQL script
- [x] Lint/build pass locally
- [ ] Configure Supabase Auth providers (Email + Google)
- [ ] Add OAuth redirect URL: `${VITE_APP_ORIGIN}/auth/callback`
- [ ] Apply `frontend/supabase/schema.sql` in Supabase SQL editor
- [ ] Set production env vars:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_APP_ORIGIN`
  - existing chain + Pinata vars
- [ ] Verify wallet/network behavior in production domain
- [ ] Run end-to-end smoke test with two separate user accounts
