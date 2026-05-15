const bucketStore = globalThis.__trustdocApiRateBuckets || new Map();
globalThis.__trustdocApiRateBuckets = bucketStore;

export function enforceRateLimit(key, { windowMs = 60_000, max = 80 } = {}) {
  const now = Date.now();
  const bucket = bucketStore.get(key);

  if (!bucket || now - bucket.startedAt > windowMs) {
    bucketStore.set(key, {
      startedAt: now,
      count: 1,
    });
    return true;
  }

  if (bucket.count >= max) {
    return false;
  }

  bucket.count += 1;
  return true;
}

