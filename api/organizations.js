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
import { restInsert, restPatch, restSelect } from "./_lib/supabase.js";
import { normalizeSlug, normalizeStatus, sanitizeText, toInt, isUuid } from "./_lib/validation.js";
import { requireActor, requestContext } from "./_lib/endpoint.js";
import { writeAuditLog } from "./_lib/audit.js";

function normalizeOrgPayload(input = {}) {
  return {
    name: sanitizeText(input.name, { maxLength: 140 }),
    slug: normalizeSlug(input.slug || input.name),
    logo_url: sanitizeText(input.logo_url, { maxLength: 300 }),
    email_domain: sanitizeText(input.email_domain, { maxLength: 120 }).toLowerCase() || null,
    status: normalizeStatus(
      input.status,
      ["active", "pending", "suspended", "archived"],
      "active"
    ),
  };
}

export default async function handler(request, response) {
  if (handleOptions(request, response, ["GET", "POST", "PATCH", "OPTIONS"])) {
    return;
  }

  setCorsHeaders(request, response, ["GET", "POST", "PATCH", "OPTIONS"]);
  setSecurityHeaders(response);

  if (!["GET", "POST", "PATCH"].includes(request.method || "")) {
    response.setHeader("Allow", "GET, POST, PATCH, OPTIONS");
    return sendJson(response, 405, { error: "Method Not Allowed" });
  }

  if (!enforceTrustedOrigin(request)) {
    return sendJson(response, 403, { error: "Request origin not allowed." });
  }

  const context = requestContext(request);
  if (!enforceRateLimit(`organizations:${context.ipAddress}`, { windowMs: 60_000, max: 80 })) {
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
    const search = sanitizeText(request.query?.search, { maxLength: 120 }).toLowerCase();
    const status = normalizeStatus(
      request.query?.status,
      ["all", "active", "pending", "suspended", "archived"],
      "all"
    );

    if (hasRole(actor, "super_admin")) {
      const query = {
        select: "id,name,slug,logo_url,email_domain,status,created_at,updated_at",
        order: "created_at.desc",
        limit,
        offset,
      };
      if (status !== "all") {
        query.status = `eq.${status}`;
      }

      let rows = await restSelect("organizations", { query, useServiceKey: true });
      if (search) {
        rows = rows.filter((row) => row.name?.toLowerCase().includes(search) || row.slug?.toLowerCase().includes(search));
      }
      return sendJson(response, 200, { data: rows, page, limit });
    }

    if (!actor.profile?.organization_id) {
      return sendJson(response, 200, { data: [], page: 1, limit });
    }

    if (!hasPermission(actor, "settings:organization", actor.profile.organization_id)) {
      return sendJson(response, 403, { error: "Insufficient permissions." });
    }

    const rows = await restSelect("organizations", {
      query: {
        select: "id,name,slug,logo_url,email_domain,status,created_at,updated_at",
        id: `eq.${actor.profile.organization_id}`,
        limit: 1,
      },
      useServiceKey: true,
    });
    return sendJson(response, 200, { data: rows, page: 1, limit: 1 });
  }

  if (request.method === "POST") {
    if (!hasPermission(actor, "organizations:manage")) {
      return sendJson(response, 403, { error: "Only super admins can create organizations." });
    }

    const body = await parseJsonBody(request);
    const payload = normalizeOrgPayload(body || {});

    if (!payload.name || !payload.slug) {
      return sendJson(response, 400, { error: "Organization name and slug are required." });
    }

    const inserted = await restInsert("organizations", {
      body: [
        {
          ...payload,
          created_by: actor.user.id,
        },
      ],
      useServiceKey: true,
    });

    const created = inserted?.[0] || null;
    await writeAuditLog({
      actor,
      action: "organization_created",
      resourceType: "organization",
      resourceId: created?.id || "",
      status: "success",
      metadata: { name: created?.name, slug: created?.slug, status: created?.status },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      organizationId: created?.id || null,
    }).catch(() => null);

    return sendJson(response, 201, { data: created });
  }

  if (!enforceTrustedOrigin(request)) {
    return sendJson(response, 403, { error: "Request origin not allowed." });
  }

  const body = await parseJsonBody(request);
  const organizationId = String(body?.organization_id || "");
  if (!isUuid(organizationId)) {
    return sendJson(response, 400, { error: "Valid organization_id is required." });
  }

  const normalized = normalizeOrgPayload(body || {});
  const isSuperAdmin = hasRole(actor, "super_admin");
  const isOrgAdmin = hasPermission(actor, "settings:organization", organizationId);
  if (!isSuperAdmin && !isOrgAdmin) {
    return sendJson(response, 403, { error: "Insufficient permissions." });
  }

  const patch = isSuperAdmin
    ? {
        name: normalized.name || undefined,
        slug: normalized.slug || undefined,
        logo_url: normalized.logo_url || "",
        email_domain: normalized.email_domain,
        status: normalized.status,
        updated_at: new Date().toISOString(),
      }
    : {
        name: normalized.name || undefined,
        logo_url: normalized.logo_url || "",
        updated_at: new Date().toISOString(),
      };

  const rows = await restPatch("organizations", {
    body: patch,
    query: {
      id: `eq.${organizationId}`,
    },
    useServiceKey: true,
  });

  const updated = rows?.[0] || null;
  await writeAuditLog({
    actor,
    action: "organization_updated",
    resourceType: "organization",
    resourceId: organizationId,
    status: "success",
    metadata: patch,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    organizationId,
  }).catch(() => null);

  return sendJson(response, 200, { data: updated });
}

