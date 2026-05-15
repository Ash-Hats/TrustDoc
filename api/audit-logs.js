import {
  sendJson,
  sendText,
  setSecurityHeaders,
  setCorsHeaders,
  handleOptions,
  enforceTrustedOrigin,
  toCsv,
} from "./_lib/http.js";
import { enforceRateLimit } from "./_lib/rate-limit.js";
import { hasPermission, hasRole } from "./_lib/rbac.js";
import { restSelect } from "./_lib/supabase.js";
import { isUuid, sanitizeText, toInt } from "./_lib/validation.js";
import { requireActor, requestContext } from "./_lib/endpoint.js";

export default async function handler(request, response) {
  if (handleOptions(request, response, ["GET", "OPTIONS"])) {
    return;
  }

  setCorsHeaders(request, response, ["GET", "OPTIONS"]);
  setSecurityHeaders(response);

  if (request.method !== "GET") {
    response.setHeader("Allow", "GET, OPTIONS");
    return sendJson(response, 405, { error: "Method Not Allowed" });
  }

  if (!enforceTrustedOrigin(request)) {
    return sendJson(response, 403, { error: "Request origin not allowed." });
  }

  const context = requestContext(request);
  if (!enforceRateLimit(`audit:${context.ipAddress}`, { windowMs: 60_000, max: 120 })) {
    return sendJson(response, 429, { error: "Rate limit exceeded." });
  }

  let actor;
  try {
    actor = await requireActor(request);
  } catch (error) {
    return sendJson(response, 401, { error: error?.message || "Unauthorized." });
  }

  const limit = toInt(request.query?.limit, 50, { min: 1, max: 1000 });
  const page = toInt(request.query?.page, 1, { min: 1, max: 5000 });
  const offset = (page - 1) * limit;
  const action = sanitizeText(request.query?.action || "", { maxLength: 100 });
  const status = sanitizeText(request.query?.status || "", { maxLength: 40 });
  const userId = isUuid(request.query?.user_id) ? String(request.query.user_id) : "";
  const organizationId = isUuid(request.query?.organization_id) ? String(request.query.organization_id) : "";
  const exportType = String(request.query?.export || "").toLowerCase();
  const search = sanitizeText(request.query?.search || "", { maxLength: 120 }).toLowerCase();

  const isSuperAdmin = hasRole(actor, "super_admin");
  const scopedOrganizationId = isSuperAdmin ? organizationId : actor.profile?.organization_id || "";
  const canReadOrgLogs =
    isSuperAdmin ||
    hasPermission(actor, "logs:organization", scopedOrganizationId || null) ||
    hasPermission(actor, "audit:read", scopedOrganizationId || null);

  if (!canReadOrgLogs) {
    return sendJson(response, 403, { error: "Insufficient permissions." });
  }

  const query = {
    select:
      "id,user_id,organization_id,role_key,action,resource_type,resource_id,status,ip_address,user_agent,error_message,metadata,changes,previous_hash,event_hash,created_at",
    order: "created_at.desc",
    limit,
    offset,
  };

  if (!isSuperAdmin) {
    query.organization_id = `eq.${scopedOrganizationId}`;
  } else if (organizationId) {
    query.organization_id = `eq.${organizationId}`;
  }

  if (action) {
    query.action = `eq.${action}`;
  }

  if (status) {
    query.status = `eq.${status}`;
  }

  if (userId) {
    query.user_id = `eq.${userId}`;
  }

  let rows = await restSelect("audit_logs", {
    query,
    useServiceKey: true,
  });

  if (search) {
    rows = rows.filter((row) => {
      const haystack = [
        row.action,
        row.resource_type,
        row.resource_id,
        row.role_key,
        row.status,
        JSON.stringify(row.metadata || {}),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    });
  }

  if (exportType === "csv") {
    const csv = toCsv(rows);
    response.setHeader("Content-Disposition", "attachment; filename=\"trustdoc-audit-logs.csv\"");
    return sendText(response, 200, csv, "text/csv; charset=utf-8");
  }

  return sendJson(response, 200, { data: rows, page, limit });
}

