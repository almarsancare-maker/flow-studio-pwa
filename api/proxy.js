import { setCorsHeaders, validateColabBaseUrl, validateColabPath } from './_ssrf.js';
import { applyRateLimitHeaders, checkRateLimit, readJsonBodySafe } from './_rateLimit.js';

export default async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const rl = checkRateLimit(req, { keyPrefix: 'proxy', maxRequests: 90, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) {
    return res.status(429).json({ ok: false, error: `Rate limit exceeded. Retry in ${rl.retryAfterSec}s.` });
  }

  try {
    let colabUrl = '';
    let targetPath = '';
    let forwardMethod = 'GET';
    let payload = undefined;

    if (req.method === 'GET') {
      colabUrl = String(req.query?.colabUrl || '');
      targetPath = String(req.query?.path || '/api/health');
      forwardMethod = 'GET';
    } else if (req.method === 'POST') {
      const body = await readJsonBodySafe(req, 4_500_000);
      colabUrl = String(body.colabUrl || '');
      targetPath = String(body.path || '/api/health');
      forwardMethod = body.method === 'GET' ? 'GET' : 'POST';
      payload = body.payload;
    } else {
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    const baseCheck = validateColabBaseUrl(colabUrl);
    if (!baseCheck.ok) {
      return res.status(400).json({ ok: false, error: baseCheck.error });
    }

    const pathCheck = validateColabPath(targetPath);
    if (!pathCheck.ok) {
      return res.status(400).json({ ok: false, error: pathCheck.error });
    }

    const upstreamUrl = `${baseCheck.origin}${pathCheck.path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 50_000);

    try {
      const upstream = await fetch(upstreamUrl, {
        method: forwardMethod,
        headers:
          forwardMethod === 'POST'
            ? { 'Content-Type': 'application/json', Accept: 'application/json' }
            : { Accept: '*/*' },
        body: forwardMethod === 'POST' ? JSON.stringify(payload ?? {}) : undefined,
        signal: controller.signal,
      });

      const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
      const arrayBuf = await upstream.arrayBuffer();
      const buf = Buffer.from(arrayBuf);

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(upstream.status).send(buf);
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err) {
    const message =
      err?.name === 'AbortError'
        ? 'Colab tunnel timed out (50s). Check if your Colab T4 cell is still running.'
        : err?.message || 'Proxy error';
    return res.status(502).json({ ok: false, error: message });
  }
}
