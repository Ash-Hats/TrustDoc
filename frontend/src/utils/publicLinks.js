function normalizePublicHash(hash) {
  const normalized = String(hash || "").trim();
  if (!normalized) {
    return "";
  }

  return normalized.startsWith("0x") ? normalized : `0x${normalized}`;
}

export function buildPublicDocumentPath(hash) {
  const normalizedHash = normalizePublicHash(hash);
  if (!normalizedHash) {
    return "/document";
  }

  return `/document/${encodeURIComponent(normalizedHash)}`;
}

export function buildPublicDocumentUrl(hash) {
  if (typeof window === "undefined") {
    return "";
  }

  return `${window.location.origin}${buildPublicDocumentPath(hash)}`;
}
