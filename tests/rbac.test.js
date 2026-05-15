import test from "node:test";
import assert from "node:assert/strict";
import { canAccessPortal, hasPermission, hasRole } from "../api/_lib/rbac.js";

const superAdminActor = {
  roleAssignments: [
    { roleKey: "super_admin", organizationId: null },
  ],
  permissions: [],
};

const orgAdminActor = {
  roleAssignments: [
    { roleKey: "organization_admin", organizationId: "org-1" },
    { roleKey: "staff_uploader", organizationId: "org-1" },
  ],
  permissions: [
    { permissionKey: "documents:approve", organizationId: "org-1" },
    { permissionKey: "users:read", organizationId: "org-1" },
  ],
};

test("super admin role has global portal access", () => {
  assert.equal(canAccessPortal(superAdminActor, "user"), true);
  assert.equal(canAccessPortal(superAdminActor, "admin"), true);
  assert.equal(canAccessPortal(superAdminActor, "superadmin"), true);
});

test("organization admin portal scope is admin+user only", () => {
  assert.equal(canAccessPortal(orgAdminActor, "user"), true);
  assert.equal(canAccessPortal(orgAdminActor, "admin"), true);
  assert.equal(canAccessPortal(orgAdminActor, "superadmin"), false);
});

test("hasRole respects organization scope", () => {
  assert.equal(hasRole(orgAdminActor, "organization_admin", "org-1"), true);
  assert.equal(hasRole(orgAdminActor, "organization_admin", "org-2"), false);
  assert.equal(hasRole(orgAdminActor, "staff_uploader", "org-1"), true);
});

test("hasPermission enforces organization scope for non-super users", () => {
  assert.equal(hasPermission(orgAdminActor, "documents:approve", "org-1"), true);
  assert.equal(hasPermission(orgAdminActor, "documents:approve", "org-2"), false);
  assert.equal(hasPermission(orgAdminActor, "users:read", "org-1"), true);
  assert.equal(hasPermission(orgAdminActor, "users:read", "org-2"), false);
});

test("super admin bypasses fine-grained permission mapping", () => {
  assert.equal(hasPermission(superAdminActor, "users:read", "any-org"), true);
  assert.equal(hasPermission(superAdminActor, "documents:approve", null), true);
});

