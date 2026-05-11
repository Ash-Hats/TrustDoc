const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim();
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
const APP_ORIGIN = import.meta.env.VITE_APP_ORIGIN?.trim();

const AUTH_PATH = "/auth/v1";
const REST_PATH = "/rest/v1";

function resolveAppOrigin() {
  if (APP_ORIGIN) {
    return APP_ORIGIN.replace(/\/+$/, "");
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  return "";
}

function buildUrl(path) {
  if (!SUPABASE_URL) {
    return "";
  }

  return `${SUPABASE_URL.replace(/\/+$/, "")}${path}`;
}

function toQueryString(query = {}) {
  const entries = Object.entries(query).filter(([, value]) => value !== undefined && value !== null && value !== "");
  const params = new URLSearchParams();

  for (const [key, value] of entries) {
    params.set(key, String(value));
  }

  const result = params.toString();
  return result ? `?${result}` : "";
}

function parseErrorPayload(payload, fallbackMessage) {
  if (!payload) {
    return fallbackMessage;
  }

  return (
    payload.msg ||
    payload.message ||
    payload.error_description ||
    payload.error ||
    fallbackMessage
  );
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

async function request(
  path,
  { method = "GET", token = "", body, query, headers = {}, timeoutMs = 20000 } = {}
) {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }

  const url = `${buildUrl(path)}${toQueryString(query)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;

  try {
    response = await fetch(url, {
      method,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
        "X-Requested-With": "trustdoc-web-client",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      credentials: "omit",
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
    const message = parseErrorPayload(payload, "Supabase request failed.");
    throw new Error(message);
  }

  return payload;
}

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function getSupabaseSetupGuide() {
  return {
    requiredEnv: ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"],
    callbackUrl: `${resolveAppOrigin()}/auth/callback`,
  };
}

export async function signUpWithEmail({ email, password, displayName }) {
  const payload = await request(`${AUTH_PATH}/signup`, {
    method: "POST",
    body: {
      email,
      password,
      data: {
        display_name: displayName || "",
      },
    },
  });

  return {
    user: payload?.user || null,
    session: payload?.session || null,
  };
}

export async function signInWithEmail({ email, password }) {
  return request(`${AUTH_PATH}/token`, {
    method: "POST",
    query: { grant_type: "password" },
    body: { email, password },
  });
}

export async function refreshSession(refreshToken) {
  return request(`${AUTH_PATH}/token`, {
    method: "POST",
    query: { grant_type: "refresh_token" },
    body: { refresh_token: refreshToken },
  });
}

export async function signOutSession(accessToken) {
  if (!accessToken) {
    return;
  }

  await request(`${AUTH_PATH}/logout`, {
    method: "POST",
    token: accessToken,
  });
}

export async function requestPasswordReset(email) {
  const redirectTo = `${resolveAppOrigin()}/login`;
  await request(`${AUTH_PATH}/recover`, {
    method: "POST",
    body: { email, redirect_to: redirectTo },
  });
}

export async function getCurrentUser(accessToken) {
  return request(`${AUTH_PATH}/user`, {
    method: "GET",
    token: accessToken,
  });
}

export async function updateCurrentUser(accessToken, patch) {
  return request(`${AUTH_PATH}/user`, {
    method: "PUT",
    token: accessToken,
    body: patch,
  });
}

export function buildGoogleOAuthUrl(nextPath = "/dashboard") {
  if (!isSupabaseConfigured()) {
    return "";
  }

  const redirectTo = `${resolveAppOrigin()}/auth/callback?next=${encodeURIComponent(nextPath)}`;
  const url = new URL(buildUrl(`${AUTH_PATH}/authorize`));
  url.searchParams.set("provider", "google");
  url.searchParams.set("redirect_to", redirectTo);
  return url.toString();
}

export function parseSessionFromUrlHash(hashValue = "") {
  if (!hashValue) {
    return null;
  }

  const cleanHash = hashValue.startsWith("#") ? hashValue.slice(1) : hashValue;
  const params = new URLSearchParams(cleanHash);

  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  const tokenType = params.get("token_type");
  const expiresIn = Number(params.get("expires_in") || 0);

  if (!accessToken || !refreshToken) {
    return null;
  }

  return {
    accessToken,
    refreshToken,
    tokenType: tokenType || "bearer",
    expiresAt: Date.now() + Math.max(0, expiresIn - 30) * 1000,
  };
}

export function normalizeAuthSession(payload) {
  if (!payload?.access_token || !payload?.refresh_token) {
    return null;
  }

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    tokenType: payload.token_type || "bearer",
    expiresAt: Date.now() + Math.max(0, Number(payload.expires_in || 0) - 30) * 1000,
  };
}

async function restSelect(path, { token, query } = {}) {
  return request(`${REST_PATH}/${path}`, {
    method: "GET",
    token,
    query,
    headers: {
      Prefer: "return=representation",
    },
  });
}

async function restInsert(path, { token, body, query, headers = {} } = {}) {
  return request(`${REST_PATH}/${path}`, {
    method: "POST",
    token,
    query,
    body,
    headers: {
      Prefer: "return=representation",
      ...headers,
    },
  });
}

async function restPatch(path, { token, body, query } = {}) {
  return request(`${REST_PATH}/${path}`, {
    method: "PATCH",
    token,
    query,
    body,
    headers: {
      Prefer: "return=representation",
    },
  });
}

async function restDelete(path, { token, query } = {}) {
  return request(`${REST_PATH}/${path}`, {
    method: "DELETE",
    token,
    query,
    headers: {
      Prefer: "return=minimal",
    },
  });
}

export async function getProfile(token, userId) {
  const rows = await restSelect("profiles", {
    token,
    query: {
      select: "*",
      user_id: `eq.${userId}`,
      limit: 1,
    },
  });

  return rows?.[0] || null;
}

export async function upsertProfile(token, profile) {
  const rows = await restInsert("profiles", {
    token,
    body: [profile],
    query: {
      on_conflict: "user_id",
    },
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation",
    },
  });

  return rows?.[0] || null;
}

export async function updateProfileSettings(token, userId, settings) {
  const rows = await restPatch("profiles", {
    token,
    body: {
      settings,
      updated_at: new Date().toISOString(),
    },
    query: {
      user_id: `eq.${userId}`,
    },
  });

  return rows?.[0] || null;
}

export async function upsertDocumentRecords(token, userId, documents = []) {
  if (!documents.length) {
    return [];
  }

  const normalizePrivacyLevel = (value) => {
    const normalized = String(value || "private").toLowerCase();
    if (normalized === "shared" || normalized === "public") {
      return normalized;
    }
    return "private";
  };

  const payload = documents.map((document) => ({
    ...(document.id ? { id: document.id } : {}),
    user_id: userId,
    hash: document.hash,
    wallet_address: document.owner || "",
    cid: document.cid || "",
    doc_type: document.docType || "General",
    issued_by: document.issuedBy || "Unknown",
    tx_hash: document.txHash || "",
    gateway_url: document.gatewayUrl || "",
    is_revoked: Boolean(document.revoked),
    timestamp: Number(document.timestamp || 0),
    block_timestamp: Number(document.blockTimestamp || 0),
    privacy_level: normalizePrivacyLevel(document.privacyLevel),
    description: document.description || "",
    file_name: document.fileName || "",
    file_size: Number(document.fileSize || 0),
    file_type: document.fileType || "",
    metadata: {
      gasUsed: document.gasUsed || "",
      blockNumber: document.blockNumber || null,
      sharedWithWallets: Array.isArray(document.sharedWithWallets)
        ? document.sharedWithWallets
        : [],
      ...(document.metadata || {}),
    },
    updated_at: new Date().toISOString(),
  }));

  return restInsert("documents", {
    token,
    body: payload,
    query: {
      on_conflict: "user_id,hash",
    },
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation",
    },
  });
}

export async function upsertDocumentRecord(token, userId, document) {
  if (!document) {
    return null;
  }

  const rows = await upsertDocumentRecords(token, userId, [document]);
  return rows?.[0] || null;
}

export async function getUserDocumentRecords(token, userId) {
  return restSelect("documents", {
    token,
    query: {
      select: "*",
      user_id: `eq.${userId}`,
      order: "timestamp.desc",
    },
  });
}

export async function getDocumentRecordByHash(token, userId, hash) {
  const rows = await restSelect("documents", {
    token,
    query: {
      select: "*",
      user_id: `eq.${userId}`,
      hash: `eq.${hash}`,
      limit: 1,
    },
  });

  return rows?.[0] || null;
}

export async function addVerificationLog(token, payload) {
  const rows = await restInsert("verification_history", {
    token,
    body: [payload],
  });

  return rows?.[0] || null;
}

export async function getVerificationLogs(token, userId) {
  return restSelect("verification_history", {
    token,
    query: {
      select: "*",
      user_id: `eq.${userId}`,
      order: "created_at.desc",
      limit: 300,
    },
  });
}

export async function addActivityLog(token, payload) {
  const rows = await restInsert("activity_logs", {
    token,
    body: [payload],
  });

  return rows?.[0] || null;
}

export async function getActivityLogs(token, userId) {
  return restSelect("activity_logs", {
    token,
    query: {
      select: "*",
      user_id: `eq.${userId}`,
      order: "created_at.desc",
      limit: 300,
    },
  });
}

export async function deleteUserData(token, userId) {
  await Promise.all([
    restDelete("documents", { token, query: { user_id: `eq.${userId}` } }),
    restDelete("verification_history", { token, query: { user_id: `eq.${userId}` } }),
    restDelete("activity_logs", { token, query: { user_id: `eq.${userId}` } }),
    restDelete("wallet_sessions", { token, query: { user_id: `eq.${userId}` } }),
    restDelete("audit_logs", { token, query: { user_id: `eq.${userId}` } }),
    restDelete("suspicious_activity", { token, query: { user_id: `eq.${userId}` } }),
  ]);

  await restDelete("profiles", { token, query: { user_id: `eq.${userId}` } });
}

// ============================================================================
// WALLET MANAGEMENT
// ============================================================================

export async function createWalletSession(token, userId, walletData) {
  const rows = await restInsert("wallet_sessions", {
    token,
    body: [
      {
        user_id: userId,
        wallet_address: walletData.wallet_address,
        chain_id: walletData.chain_id || 80002,
        signature: walletData.signature,
        message: walletData.message,
        verified: true,
      },
    ],
    query: {
      on_conflict: "user_id,wallet_address",
    },
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation",
    },
  });

  return rows?.[0] || null;
}

export async function getWalletSessions(token, userId) {
  return restSelect("wallet_sessions", {
    token,
    query: {
      select: "*",
      user_id: `eq.${userId}`,
      verified: "eq.true",
      order: "last_activity_at.desc",
    },
  });
}

export async function removeWalletSession(token, userId, walletAddress) {
  await restDelete("wallet_sessions", {
    token,
    query: {
      user_id: `eq.${userId}`,
      wallet_address: `eq.${walletAddress.toLowerCase()}`,
    },
  });
}

export async function updateWalletActivity(token, userId, walletAddress) {
  await restPatch("wallet_sessions", {
    token,
    body: {
      last_activity_at: new Date().toISOString(),
    },
    query: {
      user_id: `eq.${userId}`,
      wallet_address: `eq.${walletAddress.toLowerCase()}`,
    },
  });
}

// ============================================================================
// DOCUMENT SHARING & PRIVACY
// ============================================================================

export async function shareDocument(token, userId, shareData) {
  const rows = await restInsert("document_sharing", {
    token,
    body: [
      {
        document_id: shareData.document_id,
        owner_id: userId,
        shared_with_user_id: shareData.shared_with_user_id || null,
        shared_with_wallet: shareData.shared_with_wallet || null,
        share_type: shareData.share_type || "view",
        expires_at: shareData.expires_at || null,
      },
    ],
  });

  return rows?.[0] || null;
}

export async function getDocumentShares(token, documentId) {
  return restSelect("document_sharing", {
    token,
    query: {
      select: "*",
      document_id: `eq.${documentId}`,
      order: "created_at.desc",
    },
  });
}

export async function removeDocumentShare(token, shareId) {
  await restDelete("document_sharing", {
    token,
    query: {
      id: `eq.${shareId}`,
    },
  });
}

export async function replaceDocumentShares(token, ownerId, documentId, shareWallets = []) {
  await restDelete("document_sharing", {
    token,
    query: {
      owner_id: `eq.${ownerId}`,
      document_id: `eq.${documentId}`,
    },
  });

  const normalizedWallets = Array.from(
    new Set(
      shareWallets
        .map((wallet) => String(wallet || "").trim().toLowerCase())
        .filter(Boolean)
    )
  );

  if (!normalizedWallets.length) {
    return [];
  }

  return restInsert("document_sharing", {
    token,
    body: normalizedWallets.map((wallet) => ({
      document_id: documentId,
      owner_id: ownerId,
      shared_with_wallet: wallet,
      share_type: "view",
    })),
    headers: {
      Prefer: "return=representation",
    },
  });
}

export async function updateDocumentPrivacy(token, documentId, userId, privacyLevel) {
  const rows = await restPatch("documents", {
    token,
    body: {
      privacy_level: privacyLevel,
      updated_at: new Date().toISOString(),
    },
    query: {
      id: `eq.${documentId}`,
      user_id: `eq.${userId}`,
    },
  });

  return rows?.[0] || null;
}

// ============================================================================
// AUDIT LOGGING
// ============================================================================

export async function logAuditEvent(token, userId, auditData) {
  const rows = await restInsert("audit_logs", {
    token,
    body: [
      {
        user_id: userId,
        action: auditData.action,
        resource_type: auditData.resource_type,
        resource_id: auditData.resource_id,
        changes: auditData.changes || {},
        ip_address: auditData.ip_address || "",
        user_agent: auditData.user_agent || navigator?.userAgent || "",
        status: auditData.status || "success",
        error_message: auditData.error_message || "",
      },
    ],
  });

  return rows?.[0] || null;
}

export async function getAuditLogs(token, userId, limit = 100) {
  return restSelect("audit_logs", {
    token,
    query: {
      select: "*",
      user_id: `eq.${userId}`,
      order: "created_at.desc",
      limit,
    },
  });
}

export async function logSuspiciousActivity(token, userId, activityData) {
  const rows = await restInsert("suspicious_activity", {
    token,
    body: [
      {
        user_id: userId,
        activity_type: activityData.activity_type,
        severity: activityData.severity || "medium",
        description: activityData.description,
        meta: activityData.meta || {},
      },
    ],
  });

  return rows?.[0] || null;
}

// ============================================================================
// PROFILE UPDATES - PRODUCTION
// ============================================================================

export async function completeProfileSetup(token, userId, profileData) {
  const rows = await restPatch("profiles", {
    token,
    body: {
      display_name: profileData.display_name || "",
      organization_name: profileData.organization_name || "",
      organization_role: profileData.organization_role || "",
      profile_photo_url: profileData.profile_photo_url || "",
      wallet_address: profileData.wallet_address || "",
      setup_completed: true,
      setup_step: "complete",
      updated_at: new Date().toISOString(),
    },
    query: {
      user_id: `eq.${userId}`,
    },
  });

  return rows?.[0] || null;
}

export async function updateProfileStep(token, userId, stepData) {
  const rows = await restPatch("profiles", {
    token,
    body: {
      setup_step: stepData.step,
      setup_completed: stepData.completed || false,
      updated_at: new Date().toISOString(),
      ...stepData,
    },
    query: {
      user_id: `eq.${userId}`,
    },
  });

  return rows?.[0] || null;
}
