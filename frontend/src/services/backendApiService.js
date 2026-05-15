function toQueryString(query = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    params.set(key, String(value));
  }
  const rendered = params.toString();
  return rendered ? `?${rendered}` : "";
}

async function parseResponse(response, expect = "json") {
  if (expect === "text") {
    return response.text();
  }

  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function getApiOrigin() {
  const configured = import.meta.env.VITE_API_ORIGIN?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "";
}

export async function backendRequest(
  path,
  { method = "GET", token = "", query, body, expect = "json", timeoutMs = 20_000 } = {}
) {
  const base = getApiOrigin();
  const url = `${base}${path}${toQueryString(query)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "X-TrustDoc-Intent": "trusted-client",
      },
      credentials: "omit",
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Request timed out.", { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const payload = await parseResponse(response, expect);
  if (!response.ok) {
    const message = payload?.error || payload?.message || `Request failed with ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

export function getPortalBootstrap(token, portal = "user") {
  return backendRequest("/api/portal-bootstrap", {
    method: "GET",
    token,
    query: { portal },
  });
}

export function getOrganizations(token, query = {}) {
  return backendRequest("/api/organizations", {
    method: "GET",
    token,
    query,
  });
}

export function createOrganization(token, payload) {
  return backendRequest("/api/organizations", {
    method: "POST",
    token,
    body: payload,
  });
}

export function updateOrganization(token, payload) {
  return backendRequest("/api/organizations", {
    method: "PATCH",
    token,
    body: payload,
  });
}

export function getUsers(token, query = {}) {
  return backendRequest("/api/users", {
    method: "GET",
    token,
    query,
  });
}

export function updateUserManagement(token, payload) {
  return backendRequest("/api/users", {
    method: "PATCH",
    token,
    body: payload,
  });
}

export function getWorkflowDocuments(token, query = {}) {
  return backendRequest("/api/workflow-documents", {
    method: "GET",
    token,
    query,
  });
}

export function mutateWorkflowDocument(token, payload) {
  return backendRequest("/api/workflow-documents", {
    method: "POST",
    token,
    body: payload,
  });
}

export function getAuditLogs(token, query = {}) {
  return backendRequest("/api/audit-logs", {
    method: "GET",
    token,
    query,
  });
}

export function getAuditLogsCsv(token, query = {}) {
  return backendRequest("/api/audit-logs", {
    method: "GET",
    token,
    query: {
      ...query,
      export: "csv",
    },
    expect: "text",
  });
}

export function getNotifications(token, query = {}) {
  return backendRequest("/api/notifications", {
    method: "GET",
    token,
    query,
  });
}

export function markNotificationRead(token, notificationId) {
  return backendRequest("/api/notifications", {
    method: "PATCH",
    token,
    body: {
      action: "mark_read",
      notification_id: notificationId,
    },
  });
}

export function markAllNotificationsRead(token) {
  return backendRequest("/api/notifications", {
    method: "PATCH",
    token,
    body: {
      action: "mark_all_read",
    },
  });
}

export function getDocumentCertificate(token, documentId, { format = "json" } = {}) {
  return backendRequest("/api/document-certificate", {
    method: "GET",
    token,
    query: {
      document_id: documentId,
      format,
    },
    expect: format === "html" ? "text" : "json",
  });
}
