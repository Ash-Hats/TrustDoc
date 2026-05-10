import { safeJsonParse } from "../utils/security";

const STORAGE_KEYS = {
  SETTINGS: "trustdoc.settings.v2",
  SESSION: "trustdoc.session.v2",
  VERIFICATIONS: "trustdoc.verifications.v2",
  ACTIVITY: "trustdoc.activity.v2",
  FILTERS: "trustdoc.filters.v1",
  AUTH_SESSION: "trustdoc.auth.session.v1",
};

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function buildScopedKey(baseKey, userId = "") {
  return userId ? `${baseKey}:${userId}` : baseKey;
}

export function getStorageValue(key, fallbackValue, userId = "") {
  const storage = getStorage();
  if (!storage) {
    return fallbackValue;
  }

  const scopedKey = buildScopedKey(key, userId);
  const raw = storage.getItem(scopedKey);
  if (!raw) {
    return fallbackValue;
  }

  return safeJsonParse(raw, fallbackValue);
}

export function setStorageValue(key, value, userId = "") {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  const scopedKey = buildScopedKey(key, userId);
  storage.setItem(scopedKey, JSON.stringify(value));
}

export function removeStorageValue(key, userId = "") {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  const scopedKey = buildScopedKey(key, userId);
  storage.removeItem(scopedKey);
}

export function getSettingsStorage(userId = "") {
  return getStorageValue(STORAGE_KEYS.SETTINGS, null, userId);
}

export function setSettingsStorage(settings, userId = "") {
  setStorageValue(STORAGE_KEYS.SETTINGS, settings, userId);
}

export function getSessionStorage() {
  return getStorageValue(STORAGE_KEYS.SESSION, null);
}

export function setSessionStorage(session) {
  setStorageValue(STORAGE_KEYS.SESSION, session);
}

export function clearSessionStorage() {
  removeStorageValue(STORAGE_KEYS.SESSION);
}

export function getVerificationHistoryStorage(userId = "") {
  return getStorageValue(STORAGE_KEYS.VERIFICATIONS, [], userId);
}

export function setVerificationHistoryStorage(items, userId = "") {
  setStorageValue(STORAGE_KEYS.VERIFICATIONS, items, userId);
}

export function getActivityStorage(userId = "") {
  return getStorageValue(STORAGE_KEYS.ACTIVITY, [], userId);
}

export function setActivityStorage(items, userId = "") {
  setStorageValue(STORAGE_KEYS.ACTIVITY, items, userId);
}

export function getFilterStorage(userId = "") {
  return getStorageValue(STORAGE_KEYS.FILTERS, null, userId);
}

export function setFilterStorage(filters, userId = "") {
  setStorageValue(STORAGE_KEYS.FILTERS, filters, userId);
}

export function clearUserScopedStorage(userId) {
  if (!userId) {
    return;
  }

  removeStorageValue(STORAGE_KEYS.SETTINGS, userId);
  removeStorageValue(STORAGE_KEYS.VERIFICATIONS, userId);
  removeStorageValue(STORAGE_KEYS.ACTIVITY, userId);
  removeStorageValue(STORAGE_KEYS.FILTERS, userId);
}

export function getAuthSessionStorage() {
  return getStorageValue(STORAGE_KEYS.AUTH_SESSION, null);
}

export function setAuthSessionStorage(payload) {
  setStorageValue(STORAGE_KEYS.AUTH_SESSION, payload);
}

export function clearAuthSessionStorage() {
  removeStorageValue(STORAGE_KEYS.AUTH_SESSION);
}
