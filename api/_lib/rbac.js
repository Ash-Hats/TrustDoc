import { getAuthUser, restSelect } from "./supabase.js";

const SUPER_ADMIN_ROLE = "super_admin";

function normalizeRolePayload(rows = []) {
  return rows
    .map((row) => {
      const role = row?.roles || {};
      return {
        userRoleId: row.id,
        roleId: role.id || row.role_id || "",
        roleKey: role.role_key || "",
        roleName: role.name || "",
        organizationId: row.organization_id || null,
        status: row.status || "inactive",
      };
    })
    .filter((row) => row.roleKey);
}

function groupPermissionsByRole(permissionRows = []) {
  const map = new Map();
  for (const row of permissionRows || []) {
    const roleId = row?.role_id;
    const permission = row?.permissions?.permission_key;
    if (!roleId || !permission) {
      continue;
    }
    const set = map.get(roleId) || new Set();
    set.add(permission);
    map.set(roleId, set);
  }
  return map;
}

export async function loadActorContext(accessToken) {
  const user = await getAuthUser(accessToken);
  if (!user?.id) {
    return null;
  }

  const [profiles, userRoleRows] = await Promise.all([
    restSelect("profiles", {
      query: {
        select:
          "user_id,email,display_name,organization_id,account_status,role_approval_status,wallet_address,created_at,updated_at",
        user_id: `eq.${user.id}`,
        limit: 1,
      },
      useServiceKey: true,
    }),
    restSelect("user_roles", {
      query: {
        select: "id,role_id,organization_id,status,roles:role_id(id,role_key,name)",
        user_id: `eq.${user.id}`,
        status: "eq.active",
      },
      useServiceKey: true,
    }),
  ]);

  const profile = profiles?.[0] || null;
  const roleAssignments = normalizeRolePayload(userRoleRows);
  const roleIds = Array.from(
    new Set(
      roleAssignments
        .map((item) => item.roleId)
        .filter(Boolean)
    )
  );

  let permissionByRole = new Map();
  if (roleIds.length) {
    const inFilter = `in.(${roleIds.join(",")})`;
    const permissionRows = await restSelect("role_permissions", {
      query: {
        select: "role_id,permissions:permission_id(permission_key)",
        role_id: inFilter,
      },
      useServiceKey: true,
    });

    permissionByRole = groupPermissionsByRole(permissionRows);
  }

  const roleKeys = new Set(roleAssignments.map((item) => item.roleKey));
  const organizationIds = Array.from(
    new Set(roleAssignments.map((item) => item.organizationId).filter(Boolean))
  );

  const permissions = roleAssignments.flatMap((assignment) => {
    const permissionSet = permissionByRole.get(assignment.roleId) || new Set();
    return Array.from(permissionSet).map((permissionKey) => ({
      permissionKey,
      organizationId: assignment.organizationId,
      roleKey: assignment.roleKey,
    }));
  });

  const allowedPortals = ["user"];
  if (roleKeys.has(SUPER_ADMIN_ROLE)) {
    allowedPortals.push("admin", "superadmin");
  } else if (roleKeys.has("organization_admin")) {
    allowedPortals.push("admin");
  }

  return {
    user: {
      id: user.id,
      email: user.email || "",
    },
    profile,
    roleAssignments,
    roleKeys: Array.from(roleKeys),
    organizationIds,
    permissions,
    allowedPortals: Array.from(new Set(allowedPortals)),
  };
}

export function hasRole(actor, roleKey, organizationId = null) {
  if (!actor || !roleKey) {
    return false;
  }

  return actor.roleAssignments.some(
    (item) =>
      item.roleKey === roleKey &&
      (
        roleKey === SUPER_ADMIN_ROLE ||
        organizationId == null ||
        item.organizationId === organizationId
      )
  );
}

export function hasPermission(actor, permissionKey, organizationId = null) {
  if (!actor || !permissionKey) {
    return false;
  }

  if (hasRole(actor, SUPER_ADMIN_ROLE)) {
    return true;
  }

  return actor.permissions.some(
    (item) =>
      item.permissionKey === permissionKey &&
      (organizationId == null || item.organizationId === organizationId)
  );
}

export function canAccessPortal(actor, portal = "user") {
  const normalizedPortal = String(portal || "user").toLowerCase();
  if (!actor) {
    return false;
  }

  if (normalizedPortal === "superadmin") {
    return hasRole(actor, SUPER_ADMIN_ROLE);
  }

  if (normalizedPortal === "admin") {
    return hasRole(actor, SUPER_ADMIN_ROLE) || hasRole(actor, "organization_admin");
  }

  return true;
}

