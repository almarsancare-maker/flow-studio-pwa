/**
 * Lightweight per-IP sliding-window rate limiter & safe JSON body parser
 * designed for serverless edge/node containers under high concurrency.
 */

const buckets = new Map();
const MAX_BUCKETS = 10_000;

export function getClientIp(req) {
  const xff = req.headers?.['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim();
  }
  const realIp = req.headers?.['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

export function checkRateLimit(req, { keyPrefix = 'api', maxRequests = 30, windowMs = 60_000 } = {}) {
  const now = Date.now();
  const ip = getClientIp(req);
  const key = `${keyPrefix}:${ip}`;

  // Prevent unbounded memory growth under DDoS / 100M-user IP churn
  if (buckets.size >= MAX_BUCKETS && !buckets.has(key)) {
    const cutoff = now - windowMs;
    for (const [k, entry] of buckets) {
      if (entry.resetAt <= now || entry.lastSeen < cutoff) {
        buckets.delete(k);
      }
      if (buckets.size < MAX_BUCKETS * 0.8) break;
    }
    if (buckets.size >= MAX_BUCKETS) {
      buckets.clear();
    }
  }

  let entry = buckets.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs, lastSeen: now };
    buckets.set(key, entry);
  }
  entry.lastSeen = now;
  entry.count += 1;

  const remaining = Math.max(0, maxRequests - entry.count);
  const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
  return {
    allowed: entry.count <= maxRequests,
    remaining,
    retryAfterSec,
    limit: maxRequests,
  };
}

export function applyRateLimitHeaders(res, rl) {
  res.setHeader('X-RateLimit-Limit', String(rl.limit));
  res.setHeader('X-RateLimit-Remaining', String(rl.remaining));
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfterSec));
  }
}

export async function readJsonBodySafe(req, maxBytes = 4_500_000) {
  if (req.body && typeof req.body === 'object') {
    const est = Buffer.byteLength(JSON.stringify(req.body), 'utf8');
    if (est > maxBytes) {
      const err = new Error(`Payload too large (max ${Math.round(maxBytes / 1024)} KB)`);
      err.statusCode = 413;
      throw err;
    }
    return req.body;
  }
  if (typeof req.body === 'string') {
    if (Buffer.byteLength(req.body, 'utf8') > maxBytes) {
      const err = new Error(`Payload too large (max ${Math.round(maxBytes / 1024)} KB)`);
      err.statusCode = 413;
      throw err;
    }
    return req.body.trim() ? JSON.parse(req.body) : {};
  }

  let total = 0;
  const chunks = [];
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) {
      const err = new Error(`Payload too large (max ${Math.round(maxBytes / 1024)} KB)`);
      err.statusCode = 413;
      throw err;
    }
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const err = new Error('Malformed JSON request body.');
    err.statusCode = 400;
    throw err;
  }
}

export async function fetchWithAbort(url, options = {}, timeoutMs = 30_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
