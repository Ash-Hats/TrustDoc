import { parseAuthToken, getClientIp, getHeaderValue } from "./http.js";
import { loadActorContext, hasPermission } from "./rbac.js";

export async function requireActor(request) {
  const token = parseAuthToken(request);
  if (!token) {
    throw new Error("Missing bearer token.");
  }

  const actor = await loadActorContext(token);
  if (!actor?.user?.id) {
    throw new Error("Invalid or expired session.");
  }

  return actor;
}

export function requirePermission(actor, permissionKey, organizationId = null) {
  if (!hasPermission(actor, permissionKey, organizationId)) {
    throw new Error("Insufficient permissions.");
  }
}

export function requestContext(request) {
  return {
    ipAddress: getClientIp(request),
    userAgent: getHeaderValue(request?.headers?.["user-agent"]).slice(0, 600),
  };
}

