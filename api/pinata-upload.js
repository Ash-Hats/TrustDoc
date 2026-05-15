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
import { requireActor, requestContext } from "./_lib/endpoint.js";
import { writeAuditLog } from "./_lib/audit.js";

const PINATA_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS";
const MAX_METADATA_BYTES = 200_000;
const MAX_NAME_LENGTH = 140;

function sanitizeName(value) {
  return String(value || "trustdoc-metadata.json")
    .replace(/[^\w.\-]/g, "_")
    .slice(0, MAX_NAME_LENGTH);
}

function validateAndNormalizeBody(rawBody) {
  const body = typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody;
  const metadata = body?.metadata;

  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error("Request body must include a metadata object.");
  }

  const name = sanitizeName(body?.name);
  const serializedMetadata = JSON.stringify(metadata);
  if (!serializedMetadata || serializedMetadata === "{}") {
    throw new Error("Metadata cannot be empty.");
  }
  if (serializedMetadata.length > MAX_METADATA_BYTES) {
    throw new Error("Metadata payload is too large.");
  }

  return {
    metadata,
    name,
  };
}

function buildGatewayUrl(cid) {
  const gateway = String(process.env.PINATA_GATEWAY || "").trim();
  if (!gateway || !cid) {
    return "";
  }
  return `${gateway.replace(/\/+$/, "")}/ipfs/${cid}`;
}

export default async function handler(request, response) {
  if (handleOptions(request, response, ["POST", "OPTIONS"])) {
    return;
  }

  setCorsHeaders(request, response, ["POST", "OPTIONS"]);
  setSecurityHeaders(response);

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST, OPTIONS");
    return sendJson(response, 405, { error: "Method Not Allowed" });
  }

  if (!enforceTrustedOrigin(request)) {
    return sendJson(response, 403, { error: "Request origin not allowed." });
  }

  const context = requestContext(request);
  if (!enforceRateLimit(`pinata:${context.ipAddress}`, { windowMs: 60_000, max: 60 })) {
    return sendJson(response, 429, { error: "Rate limit exceeded. Please retry shortly." });
  }

  let actor;
  try {
    actor = await requireActor(request);
  } catch (error) {
    return sendJson(response, 401, { error: error?.message || "Unauthorized." });
  }

  const organizationId = actor.profile?.organization_id || null;
  const canUpload =
    hasRole(actor, "super_admin") ||
    hasPermission(actor, "documents:create", organizationId) ||
    hasPermission(actor, "documents:update_pending", organizationId) ||
    hasPermission(actor, "documents:approve", organizationId);

  if (!canUpload) {
    return sendJson(response, 403, { error: "Insufficient permissions for metadata upload." });
  }

  const jwt = String(process.env.PINATA_JWT || "").trim();
  if (!jwt) {
    return sendJson(response, 500, { error: "Server is missing PINATA_JWT configuration." });
  }

  let normalizedBody;
  try {
    const body = await parseJsonBody(request);
    normalizedBody = validateAndNormalizeBody(body);
  } catch (error) {
    return sendJson(response, 400, { error: error?.message || "Invalid request body." });
  }

  try {
    const upstreamResponse = await fetch(PINATA_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        pinataMetadata: {
          name: normalizedBody.name,
          keyvalues: {
            trustdoc_user_id: actor.user.id,
            trustdoc_org_id: organizationId || "",
          },
        },
        pinataContent: normalizedBody.metadata,
      }),
    });

    const rawText = await upstreamResponse.text();
    let upstreamData = {};
    if (rawText) {
      try {
        upstreamData = JSON.parse(rawText);
      } catch {
        upstreamData = { message: rawText.slice(0, 500) };
      }
    }

    if (!upstreamResponse.ok) {
      await writeAuditLog({
        actor,
        action: "pinata_upload_failed",
        resourceType: "pinata",
        resourceId: normalizedBody.name,
        status: "failed",
        metadata: { upstream: upstreamData },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        organizationId,
        errorMessage: upstreamData?.error?.reason || upstreamData?.message || "Pinata upload failed.",
      }).catch(() => null);

      return sendJson(response, 502, {
        error: upstreamData?.error?.reason || upstreamData?.message || "Pinata upload failed.",
      });
    }

    const cid =
      upstreamData?.IpfsHash ||
      upstreamData?.cid ||
      upstreamData?.ipfsHash ||
      upstreamData?.hash ||
      "";

    if (!cid) {
      return sendJson(response, 502, { error: "Pinata response did not include CID." });
    }

    await writeAuditLog({
      actor,
      action: "pinata_upload_success",
      resourceType: "pinata",
      resourceId: cid,
      status: "success",
      metadata: { name: normalizedBody.name, cid },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      organizationId,
    }).catch(() => null);

    return sendJson(response, 200, {
      cid,
      IpfsHash: cid,
      gatewayUrl: buildGatewayUrl(cid),
    });
  } catch (error) {
    await writeAuditLog({
      actor,
      action: "pinata_upload_exception",
      resourceType: "pinata",
      resourceId: normalizedBody?.name || "",
      status: "failed",
      metadata: {},
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      organizationId,
      errorMessage: error?.message || "Unexpected upload relay failure.",
    }).catch(() => null);

    return sendJson(response, 500, {
      error: error?.message || "Unexpected upload relay failure.",
    });
  }
}

