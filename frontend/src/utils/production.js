/**
 * Production Utilities
 * Helper functions for production-grade features
 */

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {Object} options - Retry options
 * @returns {Promise}
 */
export async function retryWithBackoff(
  fn,
  {
    maxAttempts = 3,
    initialDelayMs = 1000,
    maxDelayMs = 10000,
    backoffMultiplier = 2,
    shouldRetry = (error) => true,
  } = {}
) {
  let lastError;
  let delayMs = initialDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts || !shouldRetry(error)) {
        throw error;
      }

      // Calculate delay with jitter
      const jitteredDelay = delayMs * (0.5 + Math.random());
      await new Promise((resolve) => setTimeout(resolve, jitteredDelay));

      // Exponential backoff
      delayMs = Math.min(delayMs * backoffMultiplier, maxDelayMs);
    }
  }

  throw lastError;
}

/**
 * Debounce a function
 * @param {Function} fn - Function to debounce
 * @param {number} delayMs - Delay in milliseconds
 * @returns {Function}
 */
export function debounce(fn, delayMs = 300) {
  let timeoutId;

  return function debounced(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      fn(...args);
    }, delayMs);
  };
}

/**
 * Throttle a function
 * @param {Function} fn - Function to throttle
 * @param {number} limitMs - Time limit in milliseconds
 * @returns {Function}
 */
export function throttle(fn, limitMs = 300) {
  let lastCallTime = 0;

  return function throttled(...args) {
    const now = Date.now();

    if (now - lastCallTime >= limitMs) {
      lastCallTime = now;
      fn(...args);
    }
  };
}

/**
 * Memoize a function result
 * @param {Function} fn - Function to memoize
 * @returns {Function}
 */
export function memoize(fn) {
  const cache = new Map();

  return function memoized(...args) {
    const key = JSON.stringify(args);

    if (cache.has(key)) {
      return cache.get(key);
    }

    const result = fn(...args);
    cache.set(key, result);

    // Limit cache size to prevent memory leaks
    if (cache.size > 100) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }

    return result;
  };
}

/**
 * Create a timeout promise
 * @param {number} delayMs - Delay in milliseconds
 * @returns {Promise}
 */
export function delay(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * Race multiple promises with a timeout
 * @param {Promise} promise - Promise to race
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise}
 */
export async function withTimeout(promise, timeoutMs = 30000) {
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Safe JSON parse
 * @param {string} jsonString - String to parse
 * @param {*} fallback - Fallback value if parse fails
 * @returns {*}
 */
export function safeJsonParse(jsonString, fallback = null) {
  try {
    return JSON.parse(jsonString);
  } catch {
    return fallback;
  }
}

/**
 * Safe JSON stringify
 * @param {*} value - Value to stringify
 * @param {string} fallback - Fallback value if stringify fails
 * @returns {string}
 */
export function safeJsonStringify(value, fallback = '{}') {
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

/**
 * Check if value is empty
 * @param {*} value - Value to check
 * @returns {boolean}
 */
export function isEmpty(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/**
 * Deep clone an object
 * @param {Object} obj - Object to clone
 * @returns {Object}
 */
export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof Array) return obj.map((item) => deepClone(item));
  if (obj instanceof Object) {
    const clonedObj = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        clonedObj[key] = deepClone(obj[key]);
      }
    }
    return clonedObj;
  }
  return obj;
}

/**
 * Merge objects deeply
 * @param {Object} target - Target object
 * @param {Object} source - Source object
 * @returns {Object}
 */
export function deepMerge(target, source) {
  const result = { ...target };

  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      if (
        typeof source[key] === 'object' &&
        source[key] !== null &&
        !Array.isArray(source[key]) &&
        typeof result[key] === 'object' &&
        result[key] !== null
      ) {
        result[key] = deepMerge(result[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
  }

  return result;
}

/**
 * Sanitize HTML
 * @param {string} html - HTML to sanitize
 * @returns {string}
 */
export function sanitizeHtml(html) {
  const div = document.createElement('div');
  div.textContent = html;
  return div.innerHTML;
}

/**
 * Format bytes to human readable size
 * @param {number} bytes - Number of bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Generate UUID v4
 * @returns {string}
 */
export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Check if browser supports a feature
 * @param {string} feature - Feature to check
 * @returns {boolean}
 */
export function supportsFeature(feature) {
  const features = {
    localStorage: typeof Storage !== 'undefined',
    sessionStorage: typeof Storage !== 'undefined',
    indexedDB: typeof indexedDB !== 'undefined',
    serviceWorker: 'serviceWorker' in navigator,
    fetch: typeof fetch !== 'undefined',
    cryptoSubtle: typeof crypto?.subtle !== 'undefined',
    webWorkers: typeof Worker !== 'undefined',
  };

  return features[feature] ?? false;
}

/**
 * Get client info
 * @returns {Object}
 */
export function getClientInfo() {
  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory: navigator.deviceMemory,
    connection: navigator.connection?.effectiveType,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Rate limit a function
 * @param {Function} fn - Function to rate limit
 * @param {number} limitMs - Minimum time between calls
 * @returns {Function}
 */
export function rateLimit(fn, limitMs = 1000) {
  let isExecuting = false;

  return async function limitedFn(...args) {
    if (isExecuting) {
      return;
    }

    isExecuting = true;

    try {
      return await fn(...args);
    } finally {
      setTimeout(() => {
        isExecuting = false;
      }, limitMs);
    }
  };
}

/**
 * Create abort controller with timeout
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {AbortController}
 */
export function createTimeoutAbort(timeoutMs = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // Store timeoutId for cleanup
  controller.cleanup = () => clearTimeout(timeoutId);

  return controller;
}

export default {
  retryWithBackoff,
  debounce,
  throttle,
  memoize,
  delay,
  withTimeout,
  safeJsonParse,
  safeJsonStringify,
  isEmpty,
  deepClone,
  deepMerge,
  sanitizeHtml,
  formatBytes,
  generateUUID,
  supportsFeature,
  getClientInfo,
  rateLimit,
  createTimeoutAbort,
};
