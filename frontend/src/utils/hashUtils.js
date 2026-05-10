/*
Changes:
- Added shared hash normalization utility for consistent 0x-prefixed 32-byte hashes.
- Ensures every frontend hash is validated once and encoded consistently.
- Prevents duplicate 0x prefixes and invalid hash formats.
*/

export function normalizeHash(hash) {
  const rawHash = String(hash || "").trim().toLowerCase();
  const clean = rawHash.startsWith("0x") ? rawHash.slice(2) : rawHash;

  if (!/^[0-9a-f]{64}$/.test(clean)) {
    throw new Error("Invalid hash format: expected 64 hex characters");
  }

  return `0x${clean}`;
}
