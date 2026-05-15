import { canAccessPortal, hasRole } from "./_lib/rbac.js";
import { restSelect } from "./_lib/supabase.js";
import { sendJson, setSecurityHeaders, setCorsHeaders, handleOptions } from "./_lib/http.js";
import { enforceRateLimit } from "./_lib/rate-limit.js";
import { requireActor, requestContext } from "./_lib/endpoint.js";
import { writeAuditLog } from "./_lib/audit.js";

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

  const context = requestContext(request);
  if (!enforceRateLimit(`bootstrap:${context.ipAddress}`, { windowMs: 60_000, max: 120 })) {
    return sendJson(response, 429, { error: "Rate limit exceeded." });
  }

  let actor;
  try {
    actor = await requireActor(request);
  } catch (error) {
    return sendJson(response, 401, { error: error?.message || "Unauthorized." });
  }

  const portal = String(request.query?.portal || "user").toLowerCase();
  if (!canAccessPortal(actor, portal)) {
    await writeAuditLog({
      actor,
      action: "portal_access_denied",
      resourceType: "portal",
      resourceId: portal,
      status: "failed",
      metadata: { portal },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      organizationId: actor.profile?.organization_id || null,
      errorMessage: "Unauthorized portal access attempt.",
    }).catch(() => null);

    return sendJson(response, 403, { error: "Unauthorized portal access." });
  }

  let organizations = [];
  if (hasRole(actor, "super_admin")) {
    organizations = await restSelect("organizations", {
      query: {
        select: "id,name,slug,logo_url,email_domain,status,created_at,updated_at",
        order: "created_at.asc",
        limit: 300,
      },
      useServiceKey: true,
    });
  } else if (actor.profile?.organization_id) {
    organizations = await restSelect("organizations", {
      query: {
        select: "id,name,slug,logo_url,email_domain,status,created_at,updated_at",
        id: `eq.${actor.profile.organization_id}`,
        limit: 1,
      },
      useServiceKey: true,
    });
  }

  await writeAuditLog({
    actor,
    action: "portal_bootstrap_loaded",
    resourceType: "session",
    resourceId: actor.user.id,
    status: "success",
    metadata: { portal },
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    organizationId: actor.profile?.organization_id || null,
  }).catch(() => null);

  return sendJson(response, 200, {
    actor,
    organizations,
    activePortal: portal,
  });
}

