# TrustDoc Enterprise Upgrade Deliverables

## 1) Updated Code Scope

Implemented production-oriented multi-organization authority architecture with secure server-enforced RBAC:

- Database enterprise migration:
  - `frontend/supabase/enterprise_upgrade.sql`
- Backend secure API layer:
  - `api/_lib/env.js`
  - `api/_lib/http.js`
  - `api/_lib/rate-limit.js`
  - `api/_lib/supabase.js`
  - `api/_lib/rbac.js`
  - `api/_lib/audit.js`
  - `api/_lib/validation.js`
  - `api/_lib/endpoint.js`
  - `api/_lib/workflow-rules.js`
  - `api/portal-bootstrap.js`
  - `api/organizations.js`
  - `api/users.js`
  - `api/workflow-documents.js`
  - `api/audit-logs.js`
  - `api/notifications.js`
  - `api/document-certificate.js`
  - `api/pinata-upload.js` (hardened)
- Frontend RBAC + portal + workflow integration:
  - `frontend/src/context/AuthContext.jsx`
  - `frontend/src/components/ProtectedRoute.jsx`
  - `frontend/src/components/PublicOnlyRoute.jsx`
  - `frontend/src/components/Sidebar.jsx`
  - `frontend/src/layouts/AppLayout.jsx`
  - `frontend/src/App.jsx`
  - `frontend/src/services/backendApiService.js`
  - `frontend/src/services/supabaseService.js`
  - `frontend/src/context/AppContext.jsx`
  - `frontend/src/utils/pinata.js`
  - `frontend/src/utils/documentFilters.js`
  - `frontend/src/pages/Login.jsx`
  - `frontend/src/pages/AuthCallback.jsx`
  - `frontend/src/pages/MyDocuments.jsx`
  - New pages:
    - `frontend/src/pages/AdminLogin.jsx`
    - `frontend/src/pages/SuperAdminLogin.jsx`
    - `frontend/src/pages/AdminDashboard.jsx`
    - `frontend/src/pages/ApprovalQueue.jsx`
    - `frontend/src/pages/UserManagement.jsx`
    - `frontend/src/pages/AuditLogs.jsx`
    - `frontend/src/pages/SuperAdminDashboard.jsx`
    - `frontend/src/pages/OrganizationManagement.jsx`
- Config/env updates:
  - `vercel.json`
  - `frontend/.env.example`
  - `frontend/.env`
- Test suite:
  - `tests/rbac.test.js`
  - `tests/workflow-rules.test.js`
  - `tests/validation.test.js`
  - `tests/auth-helpers.test.js`
  - `package.json` test script

## 2) Folder Structure (Enterprise Additions)

```text
api/
  _lib/
    audit.js
    endpoint.js
    env.js
    http.js
    rate-limit.js
    rbac.js
    supabase.js
    validation.js
    workflow-rules.js
  audit-logs.js
  document-certificate.js
  notifications.js
  organizations.js
  pinata-upload.js
  portal-bootstrap.js
  users.js
  workflow-documents.js

frontend/
  src/
    pages/
      AdminDashboard.jsx
      AdminLogin.jsx
      ApprovalQueue.jsx
      AuditLogs.jsx
      OrganizationManagement.jsx
      SuperAdminDashboard.jsx
      SuperAdminLogin.jsx
      UserManagement.jsx
    services/
      backendApiService.js
  supabase/
    enterprise_upgrade.sql

tests/
  auth-helpers.test.js
  rbac.test.js
  validation.test.js
  workflow-rules.test.js
```

## 3) SQL Schema (Enterprise Layer)

Migration file: `frontend/supabase/enterprise_upgrade.sql`

### Added/Upgraded Core Tables

- `organizations`
- `roles`
- `permissions`
- `role_permissions`
- `user_roles`
- `document_versions`
- `approvals`
- `signatures`
- `notifications`
- `audit_logs` (hardened immutable chain-hash fields)

### Backward-Compatible Alterations

- `profiles`:
  - `organization_id`, `account_status`, `approved_by`, `approved_at`, `role_approval_status`
- `documents`:
  - `organization_id`, `uploader_user_id`, `subject_user_id`, `workflow_status`, `rejection_reason`,
  - `submitted_at`, `reviewed_at`, `reviewed_by`, `approved_signature_id`,
  - `current_version`, `verification_hash`

### ER-Level Relationship Summary

- Organization has many Users (`profiles.organization_id`)
- User has many Role assignments (`user_roles`)
- Role has many Permissions via (`role_permissions`)
- Document belongs to Organization and User scope
- Document has many Versions (`document_versions`)
- Document has many Approvals (`approvals`)
- Document has many Signatures (`signatures`)
- User receives many Notifications (`notifications`)
- Audit logs tie user + role + organization + resource action with immutable hash chain

## 4) API Routes Documentation

All protected routes require `Authorization: Bearer <access_token>`.

- `GET /api/portal-bootstrap?portal=user|admin|superadmin`
  - Returns role/permission context and allowed portals.
- `GET /api/organizations`
  - List organizations (super admin global, org admin scoped).
- `POST /api/organizations`
  - Create organization (super admin).
- `PATCH /api/organizations`
  - Update organization (super admin full / org admin limited own-org).
- `GET /api/users`
  - List users with roles by org scope.
- `PATCH /api/users`
  - Actions: `suspend_user`, `activate_user`, `assign_role`, `revoke_role`, `approve_admin`, `reject_admin`.
- `GET /api/workflow-documents`
  - Modes: `pending_queue`, `mine`, org/global views with status filters.
- `POST /api/workflow-documents`
  - Actions: `create_draft`, `edit_pending`, `submit_pending`, `approve`, `reject`, `revoke`.
- `GET /api/audit-logs`
  - Filter/search logs; `export=csv` supported.
- `GET /api/notifications`
  - Get user notifications + unread count.
- `PATCH /api/notifications`
  - Actions: `mark_read`, `mark_all_read`.
- `GET /api/document-certificate?document_id=<uuid>&format=json|html`
  - Returns certificate payload or printable certificate HTML.
- `POST /api/pinata-upload`
  - Authenticated metadata upload relay with RBAC check.

## 5) RBAC Flow Explanation

- Sign-in succeeds via Supabase Auth.
- Frontend immediately calls `/api/portal-bootstrap`.
- Backend validates JWT with Supabase Auth API and loads:
  - profile
  - organization membership
  - role assignments
  - effective permissions
- Backend authorizes every protected API mutation by permission+org scope.
- Super admin role bypass applies only in backend enforcement logic.
- Role escalation prevention:
  - Non-super-admin cannot assign/revoke `super_admin`.
  - `organization_admin` assignment restricted to super admin.
  - DB trigger `enforce_user_roles_guardrails` enforces invariants.

## 6) Deployment Steps

1. Apply baseline schema (if new environment): `frontend/supabase/schema.sql`
2. Apply enterprise migration:
   - `frontend/supabase/enterprise_upgrade.sql`
3. Ensure env variables (server + client) are configured:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `APP_ORIGIN`
   - `VITE_APP_ORIGIN`
   - `TRUSTDOC_ALLOWED_ORIGINS`
   - `PINATA_JWT`
   - `PINATA_GATEWAY`
   - `VITE_PINATA_UPLOAD_ENDPOINT`
   - `VITE_PINATA_GATEWAY`
4. Build frontend:
   - `cd frontend && npm run build`
5. Run tests:
   - `npm test`
6. Deploy with Vercel using root `vercel.json`.

## 7) Security Checklist

- RLS enabled on enterprise tables.
- Backend-side permission checks for all privileged actions.
- Role escalation guarded in API and DB trigger.
- CSRF/origin mitigation through strict trusted-origin checks.
- Rate limiting on all API routes.
- Strict input validation/sanitization for API payloads.
- Immutable audit logs:
  - update/delete blocked by trigger
  - chain-hash event integrity fields
- Pinata upload relay now requires authenticated session + RBAC.
- Sensitive operations executed with service role only in backend APIs.

## 8) Bug Audit Report (Resolved)

- Fixed missing upload endpoint env and 405 preflight failures.
- Fixed local API routing fallback logic for upload reliability.
- Fixed frontend lint/runtime state-in-effect issues in settings/profile and new pages.
- Added defensive timeout+error handling in backend API client layer.
- Added portal-specific auth redirects to avoid role mismatch routing bugs.
- Added workflow metadata mapping into document sync to avoid state drift.

## 9) Optimization Report

- Split privileged API logic into reusable modules (`api/_lib/*`) for maintainability.
- Added centralized `backendApiService` to reduce duplicated fetch logic.
- Added reusable RBAC helpers (`hasRole`, `hasPermission`, `canAccessPortal`).
- Added deterministic workflow state helpers (`workflow-rules.js`) and tests.
- Added pagination/filter patterns to admin endpoints.
- Added CSV export for audit logs without external dependencies.

## 10) Production Recommendations

- Move from local in-memory rate limiting to distributed store (Redis) before high-scale production.
- Add scheduled security job to validate audit hash-chain integrity daily.
- Add SOC-style alerting for repeated failed portal access attempts.
- Add object-level malware scanning for uploaded documents prior to final approval.
- Add DB migration runner pipeline (CI/CD) with rollback scripts.
- Add E2E tests for:
  - multi-role login redirects
  - concurrent approvals conflict handling
  - organization boundary isolation
  - certificate download and verification UX
