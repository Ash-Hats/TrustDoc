import {
  sendJson,
  setSecurityHeaders,
  setCorsHeaders,
  handleOptions,
  parseJsonBody,
  enforceTrustedOrigin,
} from "./_lib/http.js";
import { enforceRateLimit } from "./_lib/rate-limit.js";
import { restPatch, restSelect } from "./_lib/supabase.js";
import { isUuid, toInt } from "./_lib/validation.js";
import { requireActor, requestContext } from "./_lib/endpoint.js";

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
  if (!enforceRateLimit(`notifications:${context.ipAddress}`, { windowMs: 60_000, max: 150 })) {
    return sendJson(response, 429, { error: "Rate limit exceeded." });
  }

  let actor;
  try {
    actor = await requireActor(request);
  } catch (error) {
    return sendJson(response, 401, { error: error?.message || "Unauthorized." });
  }

  if (request.method === "GET") {
    const limit = toInt(request.query?.limit, 50, { min: 1, max: 200 });
    const page = toInt(request.query?.page, 1, { min: 1, max: 5000 });
    const offset = (page - 1) * limit;
    const unreadOnly = String(request.query?.unread_only || "").toLowerCase() === "true";

    const query = {
      select: "id,recipient_user_id,organization_id,type,title,message,metadata,is_read,read_at,created_at",
      recipient_user_id: `eq.${actor.user.id}`,
      order: "created_at.desc",
      limit,
      offset,
    };

    if (unreadOnly) {
      query.is_read = "eq.false";
    }

    const [rows, unreadRows] = await Promise.all([
      restSelect("notifications", {
        query,
        useServiceKey: true,
      }),
      restSelect("notifications", {
        query: {
          select: "id",
          recipient_user_id: `eq.${actor.user.id}`,
          is_read: "eq.false",
        },
        useServiceKey: true,
      }),
    ]);

    return sendJson(response, 200, {
      data: rows,
      page,
      limit,
      unreadCount: unreadRows.length,
    });
  }

  const body = await parseJsonBody(request);
  const action = String(body?.action || "").toLowerCase();

  if (action === "mark_read") {
    const notificationId = String(body?.notification_id || "");
    if (!isUuid(notificationId)) {
      return sendJson(response, 400, { error: "Valid notification_id is required." });
    }

    const rows = await restPatch("notifications", {
      body: {
        is_read: true,
        read_at: new Date().toISOString(),
      },
      query: {
        id: `eq.${notificationId}`,
        recipient_user_id: `eq.${actor.user.id}`,
      },
      useServiceKey: true,
    });

    return sendJson(response, 200, { data: rows?.[0] || null });
  }

  if (action === "mark_all_read") {
    await restPatch("notifications", {
      body: {
        is_read: true,
        read_at: new Date().toISOString(),
      },
      query: {
        recipient_user_id: `eq.${actor.user.id}`,
        is_read: "eq.false",
      },
      useServiceKey: true,
    });

    return sendJson(response, 200, { success: true });
  }

  return sendJson(response, 400, {
    error: "Unsupported action. Allowed: mark_read, mark_all_read.",
  });
}

