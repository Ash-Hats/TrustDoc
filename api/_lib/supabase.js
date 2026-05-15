import { getEnv } from "./env.js";

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

async function parseJsonSafe(response) {
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

function parseError(payload, fallbackMessage = "Supabase request failed.") {
  if (!payload) {
    return fallbackMessage;
  }
  return (
    payload.error_description ||
    payload.message ||
    payload.error ||
    payload.msg ||
    fallbackMessage
  );
}

export async function supabaseRequest(
  path,
  {
    method = "GET",
    query = {},
    body,
    token = "",
    useServiceKey = false,
    headers = {},
    timeoutMs = 20_000,
  } = {}
) {
  const env = getEnv();
  const apiKey = useServiceKey ? env.serviceRoleKey : env.supabaseAnonKey;
  const url = `${env.supabaseUrl}${path}${toQueryString(query)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        apikey: apiKey,
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Supabase request timed out.", { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const payload = await parseJsonSafe(response);
  if (!response.ok) {
    throw new Error(parseError(payload));
  }
  return payload;
}

export async function getAuthUser(accessToken) {
  if (!accessToken) {
    return null;
  }

  return supabaseRequest("/auth/v1/user", {
    method: "GET",
    token: accessToken,
    useServiceKey: true,
  });
}

export async function restSelect(table, { query = {}, token = "", useServiceKey = true } = {}) {
  return supabaseRequest(`/rest/v1/${table}`, {
    method: "GET",
    token,
    useServiceKey,
    query,
    headers: {
      Prefer: "return=representation",
    },
  });
}

export async function restInsert(
  table,
  { body, query = {}, token = "", useServiceKey = true, headers = {} } = {}
) {
  return supabaseRequest(`/rest/v1/${table}`, {
    method: "POST",
    token,
    useServiceKey,
    query,
    body,
    headers: {
      Prefer: "return=representation",
      ...headers,
    },
  });
}

export async function restPatch(
  table,
  { body, query = {}, token = "", useServiceKey = true, headers = {} } = {}
) {
  return supabaseRequest(`/rest/v1/${table}`, {
    method: "PATCH",
    token,
    useServiceKey,
    query,
    body,
    headers: {
      Prefer: "return=representation",
      ...headers,
    },
  });
}

export async function restDelete(table, { query = {}, token = "", useServiceKey = true } = {}) {
  return supabaseRequest(`/rest/v1/${table}`, {
    method: "DELETE",
    token,
    useServiceKey,
    query,
    headers: {
      Prefer: "return=minimal",
    },
  });
}

export async function restRpc(fnName, { body = {}, token = "", useServiceKey = true } = {}) {
  return supabaseRequest(`/rest/v1/rpc/${fnName}`, {
    method: "POST",
    token,
    useServiceKey,
    body,
  });
}

