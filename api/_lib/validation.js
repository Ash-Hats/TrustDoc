export function sanitizeText(value, { maxLength = 200 } = {}) {
  return String(value || "")
    .replace(/[<>`$\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function normalizeSlug(value) {
  return sanitizeText(value, { maxLength: 120 })
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function normalizeStatus(value, allowed, fallback) {
  const normalized = String(value || fallback).toLowerCase().trim();
  if (allowed.includes(normalized)) {
    return normalized;
  }
  return fallback;
}

export function requireValue(value, message) {
  if (value === undefined || value === null || String(value).trim() === "") {
    throw new Error(message);
  }
  return value;
}

export function toInt(value, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  if (parsed < min) {
    return min;
  }
  if (parsed > max) {
    return max;
  }
  return parsed;
}

export function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

export function isEthAddress(value) {
  return /^0x[a-f0-9]{40}$/i.test(String(value || ""));
}

export function assertPasswordPolicy(password) {
  const raw = String(password || "");
  const minLength = 10;
  const hasUpper = /[A-Z]/.test(raw);
  const hasLower = /[a-z]/.test(raw);
  const hasDigit = /[0-9]/.test(raw);
  const hasSpecial = /[^A-Za-z0-9]/.test(raw);

  if (raw.length < minLength || !hasUpper || !hasLower || !hasDigit || !hasSpecial) {
    throw new Error(
      "Password policy violation: minimum 10 chars with uppercase, lowercase, number, and symbol."
    );
  }
}

