# TrustDoc Final Production Audit Report

Date: May 10, 2026  
Scope: Web app (`frontend`), Supabase schema/policies, wallet lifecycle, realtime synchronization, deployment readiness.

## 1. Final Production Audit Report

### Completed in this pass
- Implemented real Supabase Realtime subscription plumbing using `@supabase/supabase-js`.
- Integrated live subscriptions for:
  - `documents`
  - `verification_history`
  - `activity_logs`
  - `wallet_sessions`
- Added debounced cache invalidation + refresh orchestration in app state.
- Added sync telemetry in app context and surfaced in Settings/Dashboard.
- Hardened wallet lifecycle handling (account change, chain change, session/log refresh, suspicious activity logging).
- Added document privacy controls in UI and database update flow (`private`, `shared`, `public`).
- Added shared-wallet access update flow (document share replacement per document).
- Added onboarding improvements:
  - Identity + organization + profile photo URL + wallet linking in setup flow.
  - Profile setup completion audit logging.
- Removed UI theme/accent switching controls from Settings to keep only production-relevant settings.
- Added Supabase realtime/storage setup SQL:
  - `frontend/supabase/realtime_setup.sql`

### Residual risk notes
- Smart contract currently stores CID/docType/issuedBy in addition to hash/ownership timestamp.  
  Recommendation for strict minimal on-chain metadata: deploy a v2 contract for mainnet cutover while preserving current Amoy compatibility.
- Encrypted file storage is architecture-ready via private buckets/policies, but current document registration flow stores metadata (not raw files) to IPFS by default.

---

## 2. Database Architecture

Primary tables:
- `profiles`: identity, setup progress, linked wallet, settings
- `documents`: user-scoped document registry mirror + privacy metadata
- `document_sharing`: wallet/user-level sharing access
- `wallet_sessions`: signed wallet sessions and activity tracking
- `verification_history`: verification logs
- `activity_logs`: operational timeline
- `audit_logs`: compliance/security audit trail
- `suspicious_activity`: anomaly and abuse tracking

Security model:
- RLS enabled on all tables
- Owner-only policies for profile/private data
- Shared/public access policy for documents through `privacy_level` + `document_sharing`

Added production SQL:
- `frontend/supabase/schema.sql`
- `frontend/supabase/realtime_setup.sql`

---

## 3. Realtime Flow Explanation

Current runtime flow:
1. Authenticated user session token is attached to Supabase Realtime client.
2. App subscribes to table change streams (`documents`, `verification_history`, `activity_logs`, `wallet_sessions`) with user-scoped filters.
3. Incoming realtime events trigger debounced refresh and cache invalidation.
4. UI updates live:
   - dashboard counts
   - records table
   - activity timelines
   - wallet status/session indicators
5. Polling remains as resilience fallback.

Operational behavior:
- Realtime status is exposed as `connected`, `connecting`, `error`, or `disabled`.
- Last sync timestamps are surfaced in UI.

---

## 4. Privacy Model Explanation

Privacy levels:
- `private`: owner-only metadata access
- `shared`: owner + explicitly shared users/wallets
- `public`: verification-capable through share/public policy path

On-chain vs off-chain:
- On-chain: hash proof + ownership/timestamp (+ existing contract metadata fields from current contract version)
- Off-chain: user/private metadata, sharing ACL, audit/security logs

File privacy:
- Current flow does not upload raw files on-chain.
- Storage hardening SQL is provided for private Supabase buckets.

---

## 5. User Access Flow

1. User signs up/logs in.
2. Protected routes enforce setup completion.
3. Identity setup captures:
   - display name
   - organization details
   - optional profile photo URL
   - wallet linking step
4. On completion, user lands in dashboard.
5. RLS + user scoping ensure no cross-user private data exposure.

---

## 6. Wallet Management Flow

Supported lifecycle:
- connect wallet
- disconnect wallet
- switch wallet/account
- relink wallet to profile
- network validation (Polygon Amoy)
- manual switch fallback guidance for MetaMask/browser limitations

Runtime listeners:
- `accountsChanged`
- `chainChanged`

On wallet/chain changes:
- session and local wallet state refresh
- document refresh
- wallet activity update
- suspicious activity logging for unlinked wallet changes

---

## 7. Security Checklist

- [x] RLS enabled + scoped policies
- [x] User-scoped local storage segmentation
- [x] Profile setup gate for protected routes
- [x] Wallet mismatch detection and suspicious logging
- [x] Verification failure/tamper logging
- [x] Audit event logging for sensitive actions
- [x] File extension/size validation in registration flow
- [x] Session refresh + expiry handling
- [x] Network mismatch enforcement (Amoy)
- [x] Realtime token-authenticated subscriptions

Recommended next hardening:
- [ ] Add WAF/rate limiting at edge/API gateway
- [ ] Add server-side signed upload URLs for file storage flow
- [ ] Add SIEM alert integration for suspicious events

---

## 8. Performance Checklist

- [x] Route lazy loading in app router
- [x] Debounced search/filtering
- [x] Realtime debounced invalidation
- [x] Polling fallback with bounded interval
- [x] RPC fallback strategy in blockchain utils
- [x] Pagination for document lists
- [x] Memoized data transforms for analytics/filtering

Recommended next pass:
- [ ] Split large analytics bundle further
- [ ] Add virtualized table rendering for very large datasets

---

## 9. Deployment Checklist

- [ ] Supabase project created
- [ ] `schema.sql` executed
- [ ] `realtime_setup.sql` executed
- [ ] Auth providers configured
- [ ] Storage buckets created (`documents`, `profile-photos`)
- [ ] Frontend env variables set in Vercel
- [ ] Contract deployed on Amoy and address injected
- [ ] Production build validated
- [ ] Domain + HTTPS configured
- [ ] Monitoring/alerts enabled

---

## 10. Step-by-Step Deployment Guide

### A. Deploy frontend on Vercel
1. Push repository to GitHub.
2. Import project in Vercel.
3. Set Root Directory to `frontend`.
4. Configure env vars (see section D).
5. Deploy and validate `/login`, `/setup/identity`, `/dashboard`, `/verify`.

### B. Configure Supabase
1. Create project.
2. Run:
   - `frontend/supabase/schema.sql`
   - `frontend/supabase/realtime_setup.sql`
3. Enable email auth (and OAuth providers if used).
4. Create private storage buckets:
   - `documents`
   - `profile-photos`
5. Validate RLS with a non-owner test account.

### C. Deploy smart contract (Polygon Amoy)
1. Configure root `.env` with `AMOY_RPC_URL` and deployer `PRIVATE_KEY`.
2. Run:
   - `npx hardhat compile`
   - `npx hardhat run scripts/deploy.js --network amoy`
3. Save deployed contract address.
4. Set `VITE_CONTRACT_ADDRESS` in Vercel frontend env.
5. Verify contract on explorer if needed.

### D. Configure environment variables
Frontend (`frontend` project):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_AMOY_RPC_URL`
- `VITE_CONTRACT_ADDRESS`
- `VITE_APP_ORIGIN`
- `VITE_PINATA_JWT`
- `VITE_PINATA_GATEWAY`

Backend/Hardhat (root):
- `AMOY_RPC_URL`
- `PRIVATE_KEY`

### E. Connect custom domain
1. Add domain in Vercel.
2. Update DNS records per Vercel instructions.
3. Set `VITE_APP_ORIGIN` to final HTTPS domain.
4. Update Supabase redirect URLs:
   - `https://<domain>/auth/callback`

### F. Test production build
1. Run `npm run build` in `frontend`.
2. Validate:
   - signup/login/logout
   - identity setup redirect gating
   - wallet connect/switch/disconnect
   - register + verify document
   - privacy updates (`private/shared/public`)
   - realtime updates with two sessions

### G. Monitor errors
1. Enable Vercel logs and function logs.
2. Review Supabase logs (DB/Auth/Realtime).
3. Query:
   - `audit_logs`
   - `suspicious_activity`
4. Add external error tracking (Sentry recommended).

### H. Maintain realtime sync
1. Keep publication membership in `supabase_realtime` up to date for target tables.
2. Monitor channel connection counts in Supabase dashboard.
3. Keep polling fallback enabled for degraded realtime.
4. Rotate auth tokens and validate realtime auth continuity during session refresh.

