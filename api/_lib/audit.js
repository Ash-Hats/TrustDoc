import { restInsert } from "./supabase.js";

export async function writeAuditLog({
  actor = null,
  action,
  resourceType = "system",
  resourceId = "",
  status = "success",
  metadata = {},
  ipAddress = "",
  userAgent = "",
  organizationId = null,
  errorMessage = "",
}) {
  if (!action) {
    return null;
  }

  const roleKey = actor?.roleAssignments?.[0]?.roleKey || "";

  const row = {
    user_id: actor?.user?.id || null,
    organization_id: organizationId || actor?.profile?.organization_id || null,
    role_key: roleKey,
    action,
    resource_type: resourceType,
    resource_id: String(resourceId || ""),
    status,
    metadata: metadata || {},
    changes: metadata || {},
    ip_address: String(ipAddress || ""),
    user_agent: String(userAgent || "").slice(0, 600),
    error_message: String(errorMessage || "").slice(0, 400),
  };

  const rows = await restInsert("audit_logs", {
    body: [row],
    useServiceKey: true,
  });

  return rows?.[0] || null;
}

