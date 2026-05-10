// CHANGES: Added shared hash normalization utility and rawHash helper for consistent hash formatting.

export function normalizeHash(hash) {
  const rawHash = String(hash || "").trim().toLowerCase();
  const clean = rawHash.startsWith("0x") ? rawHash.slice(2) : rawHash;

  if (!/^[0-9a-f]{64}$/.test(clean)) {
    throw new Error(`Invalid hash: expected 64 hex chars, got "${clean}"`);
  }

  return `0x${clean}`;
}

export function rawHash(hash) {
  return normalizeHash(hash).slice(2);
}
