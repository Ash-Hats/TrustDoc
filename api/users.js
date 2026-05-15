import {
  sendJson,
  setSecurityHeaders,
  setCorsHeaders,
  handleOptions,
  parseJsonBody,
  enforceTrustedOrigin,
} from "./_lib/http.js";
import { enforceRateLimit } from "./_lib/rate-limit.js";
import { hasPermission, hasRole } from "./_lib/rbac.js";
import { restDelete, restInsert, restPatch, restSelect } from "./_lib/supabase.js";
import {
  isUuid,
  normalizeStatus,
  requireValue,
  sanitizeText,
  toInt,
} from "./_lib/validation.js";
import { requireActor, requestContext } from "./_lib/endpoint.js";
import { writeAuditLog } from "./_lib/audit.js";

async function findRoleByKey(roleKey) {
  const rows = await restSelect("roles", {
    query: {
      select: "id,role_key,name",
      role_key: `eq.${roleKey}`,
      limit: 1,
    },
    useServiceKey: true,
  });
  return rows?.[0] || null;
}

function isSameOrg(actor, organizationId) {
  return Boolean(organizationId && actor.organizationIds.includes(organizationId));
}

function canManageTargetOrg(actor, organizationId) {
  return hasRole(actor, "super_admin") || isSameOrg(actor, organizationId);
}

export default async function handler(request, response) {
  if (handleOptions(request, response, ["GET", "PATCH", "OPTIONS"])) {
    return;
  }

  setCorsHeaders(request, response, ["GET", "PATCH", "OPTIONS"]);
  setSecurityHeaders(response);

  if (!["GET", "PATCH"].includes(request.method || "")) {
    response.setHeader("Allow", "GET, PATCH, OPTIONS");
    return sendJson(response, 405, { error: "Method Not Allowed" });
  }

  if (!enforceTrustedOrigin(request)) {
    return sendJson(response, 403, { error: "Request origin not allowed." });
  }

  const context = requestContext(request);
  if (!enforceRateLimit(`users:${context.ipAddress}`, { windowMs: 60_000, max: 120 })) {
    return sendJson(response, 429, { error: "Rate limit exceeded." });
  }

  let actor;
  try {
    actor = await requireActor(request);
  } catch (error) {
    return sendJson(response, 401, { error: error?.message || "Unauthorized." });
  }

  if (request.method === "GET") {
    const limit = toInt(request.query?.limit, 30, { min: 1, max: 200 });
    const page = toInt(request.query?.page, 1, { min: 1, max: 5000 });
    const offset = (page - 1) * limit;
    const queryOrgId = String(request.query?.organization_id || "");
    const search = sanitizeText(request.query?.search, { maxLength: 120 }).toLowerCase();
    const status = normalizeStatus(
      request.query?.status,
      ["all", "active", "pending", "suspended", "deactivated"],
      "all"
    );

    let targetOrgId = queryOrgId && isUuid(queryOrgId) ? queryOrgId : actor.profile?.organization_id || "";
    if (hasRole(actor, "super_admin") && queryOrgId === "all") {
      targetOrgId = "";
    }

    if (!hasRole(actor, "super_admin") && !hasPermission(actor, "users:read", targetOrgId || null)) {
      return sendJson(response, 403, { error: "Insufficient permissions." });
    }

    const query = {
      select:
        "user_id,email,display_name,organization_id,account_status,role_approval_status,wallet_address,created_at,updated_at,user_roles(id,organization_id,status,roles:role_id(role_key,name))",
      order: "created_at.desc",
      limit,
      offset,
    };

    if (targetOrgId) {
      query.organization_id = `eq.${targetOrgId}`;
    }
    if (status !== "all") {
      query.account_status = `eq.${status}`;
    }

    let rows = await restSelect("profiles", {
      query,
      useServiceKey: true,
    });

    if (search) {
      rows = rows.filter((item) => {
        const email = String(item.email || "").toLowerCase();
        const name = String(item.display_name || "").toLowerCase();
        return email.includes(search) || name.includes(search);
      });
    }

    return sendJson(response, 200, { data: rows, page, limit });
  }

  const body = await parseJsonBody(request);
  const action = String(body?.action || "").toLowerCase();
  const targetUserId = String(body?.user_id || "");
  if (!isUuid(targetUserId)) {
    return sendJson(response, 400, { error: "Valid user_id is required." });
  }

  const profileRows = await restSelect("profiles", {
    query: {
      select: "user_id,organization_id,account_status,role_approval_status,display_name,email",
      user_id: `eq.${targetUserId}`,
      limit: 1,
    },
    useServiceKey: true,
  });
  const targetProfile = profileRows?.[0];
  if (!targetProfile) {
    return sendJson(response, 404, { error: "Target user not found." });
  }

  const targetOrgId = targetProfile.organization_id || null;
  if (!canManageTargetOrg(actor, targetOrgId) && !hasPermission(actor, "users:update", targetOrgId)) {
    return sendJson(response, 403, { error: "Insufficient permissions for target organization." });
  }

  try {
    if (action === "suspend_user" || action === "activate_user") {
      const nextStatus = action === "suspend_user" ? "suspended" : "active";
      if (action === "suspend_user" && !hasPermission(actor, "users:suspend", targetOrgId)) {
        return sendJson(response, 403, { error: "Insufficient permissions to suspend users." });
      }

      const rows = await restPatch("profiles", {
        body: {
          account_status: nextStatus,
          updated_at: new Date().toISOString(),
        },
        query: {
          user_id: `eq.${targetUserId}`,
        },
        useServiceKey: true,
      });

      await writeAuditLog({
        actor,
        action,
        resourceType: "user",
        resourceId: targetUserId,
        status: "success",
        metadata: { account_status: nextStatus },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        organizationId: targetOrgId,
      }).catch(() => null);

      return sendJson(response, 200, { data: rows?.[0] || null });
    }

    if (action === "assign_role") {
      const roleKey = sanitizeText(body?.role_key, { maxLength: 60 }).toLowerCase();
      requireValue(roleKey, "role_key is required.");
      const role = await findRoleByKey(roleKey);
      if (!role) {
        return sendJson(response, 400, { error: "Unknown role_key." });
      }

      const requestedOrgId = isUuid(body?.organization_id)
        ? body.organization_id
        : targetOrgId;

      if (!requestedOrgId && role.role_key !== "super_admin") {
        return sendJson(response, 400, { error: "organization_id is required for non-super-admin roles." });
      }

      if (role.role_key === "super_admin" && !hasRole(actor, "super_admin")) {
        return sendJson(response, 403, { error: "Only super admins can assign super_admin role." });
      }

      if (role.role_key === "organization_admin" && !hasRole(actor, "super_admin")) {
        return sendJson(response, 403, { error: "Only super admins can assign organization_admin role." });
      }

      if (!hasRole(actor, "super_admin") && !canManageTargetOrg(actor, requestedOrgId)) {
        return sendJson(response, 403, { error: "You can only assign roles in your organization." });
      }

      const inserted = await restInsert("user_roles", {
        body: [
          {
            user_id: targetUserId,
            organization_id: role.role_key === "super_admin" ? null : requestedOrgId,
            role_id: role.id,
            status: "active",
            assigned_by: actor.user.id,
          },
        ],
        query: {
          on_conflict: "user_id,organization_id,role_id",
        },
        headers: {
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        useServiceKey: true,
      });

      await writeAuditLog({
        actor,
        action: "assign_role",
        resourceType: "user_role",
        resourceId: targetUserId,
        status: "success",
        metadata: { role_key: role.role_key, organization_id: requestedOrgId },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        organizationId: requestedOrgId,
      }).catch(() => null);

      return sendJson(response, 200, { data: inserted?.[0] || null });
    }

    if (action === "revoke_role") {
      const userRoleId = String(body?.user_role_id || "");
      if (!isUuid(userRoleId)) {
        return sendJson(response, 400, { error: "Valid user_role_id is required." });
      }

      const roleRows = await restSelect("user_roles", {
        query: {
          select: "id,user_id,organization_id,roles:role_id(role_key)",
          id: `eq.${userRoleId}`,
          limit: 1,
        },
        useServiceKey: true,
      });
      const targetUserRole = roleRows?.[0] || null;
      if (!targetUserRole) {
        return sendJson(response, 404, { error: "user_role not found." });
      }

      const roleKey = targetUserRole?.roles?.role_key || "";
      const roleOrgId = targetUserRole.organization_id || null;
      if (roleKey === "super_admin" && !hasRole(actor, "super_admin")) {
        return sendJson(response, 403, { error: "Only super admins can revoke super_admin role." });
      }

      if (!hasRole(actor, "super_admin") && !canManageTargetOrg(actor, roleOrgId)) {
        return sendJson(response, 403, { error: "Insufficient permissions for role revocation." });
      }

      await restDelete("user_roles", {
        query: {
          id: `eq.${userRoleId}`,
        },
        useServiceKey: true,
      });

      await writeAuditLog({
        actor,
        action: "revoke_role",
        resourceType: "user_role",
        resourceId: userRoleId,
        status: "success",
        metadata: { role_key: roleKey, target_user_id: targetUserRole.user_id },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        organizationId: roleOrgId,
      }).catch(() => null);

      return sendJson(response, 200, { success: true });
    }

    if (action === "approve_admin" || action === "reject_admin") {
      if (!hasPermission(actor, "admins:approve")) {
        return sendJson(response, 403, { error: "Only super admins can approve/reject admins." });
      }

      const nextApproval = action === "approve_admin" ? "approved" : "rejected";
      const rows = await restPatch("profiles", {
        body: {
          role_approval_status: nextApproval,
          approved_by: action === "approve_admin" ? actor.user.id : null,
          approved_at: action === "approve_admin" ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        },
        query: {
          user_id: `eq.${targetUserId}`,
        },
        useServiceKey: true,
      });

      await writeAuditLog({
        actor,
        action,
        resourceType: "user",
        resourceId: targetUserId,
        status: "success",
        metadata: { role_approval_status: nextApproval },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        organizationId: targetOrgId,
      }).catch(() => null);

      return sendJson(response, 200, { data: rows?.[0] || null });
    }

    return sendJson(response, 400, {
      error:
        "Unsupported action. Allowed: suspend_user, activate_user, assign_role, revoke_role, approve_admin, reject_admin.",
    });
  } catch (error) {
    await writeAuditLog({
      actor,
      action: action || "user_mutation_failed",
      resourceType: "user",
      resourceId: targetUserId,
      status: "failed",
      metadata: { action, target_org_id: targetOrgId },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      organizationId: targetOrgId,
      errorMessage: error?.message || "User mutation failed.",
    }).catch(() => null);

    return sendJson(response, 500, { error: error?.message || "User mutation failed." });
  }
}

