import { setCorsHeaders } from './_ssrf.js';
import { applyRateLimitHeaders, checkRateLimit, readJsonBodySafe } from './_rateLimit.js';

function clampDim(val, fallback) {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(256, Math.min(1280, Math.round(n / 16) * 16));
}

async function generateViaPollinations({ prompt, width, height, seed, model }) {
  const safeModel = model === 'turbo' ? 'turbo' : 'flux';
  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
    `?width=${width}&height=${height}&seed=${seed}&model=${safeModel}&nologo=true&enhance=false`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'FlowStudioPWA/1.0',
        Accept: 'image/*',
      },
      signal: controller.signal,
    });
    if (!resp.ok) {
      throw new Error(`Pollinations returned HTTP ${resp.status}`);
    }
    const contentType = resp.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      throw new Error(`Pollinations returned unexpected content-type: ${contentType}`);
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length < 1024) {
      throw new Error('Pollinations returned an empty image payload');
    }
    return {
      provider: `Pollinations ${safeModel.toUpperCase()}`,
      mimeType: contentType.split(';')[0],
      dataUrl: `data:${contentType.split(';')[0]};base64,${buf.toString('base64')}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function generateViaHfFluxSchnell({ prompt, width, height, seed }) {
  const host = 'https://black-forest-labs-flux-1-schnell.hf.space';
  const submitResp = await fetch(`${host}/gradio_api/call/infer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: [prompt, seed, false, width, height, 4],
    }),
  });
  if (!submitResp.ok) {
    throw new Error(`HF FLUX.1-schnell submit failed: HTTP ${submitResp.status}`);
  }
  const { event_id: eventId } = await submitResp.json();
  if (!eventId) {
    throw new Error('HF FLUX.1-schnell did not return an event_id');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 28_000);
  try {
    const sseResp = await fetch(`${host}/gradio_api/call/infer/${eventId}`, {
      signal: controller.signal,
    });
    if (!sseResp.ok) {
      throw new Error(`HF FLUX.1-schnell stream failed: HTTP ${sseResp.status}`);
    }
    const text = await sseResp.text();
    const lines = text.split('\n');
    let eventName = '';
    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        const raw = line.slice(5).trim();
        if (eventName === 'error') {
          throw new Error(`HF ZeroGPU error: ${raw}`);
        }
        if (eventName === 'complete') {
          const parsed = JSON.parse(raw);
          const imgObj = Array.isArray(parsed) ? parsed[0] : null;
          const imgUrl = imgObj?.url || (imgObj?.path ? `${host}/gradio_api/file=${imgObj.path}` : null);
          if (!imgUrl) throw new Error('HF FLUX.1-schnell response missing image URL');
          const imgResp = await fetch(imgUrl);
          if (!imgResp.ok) throw new Error(`Failed to fetch HF image: HTTP ${imgResp.status}`);
          const mime = (imgResp.headers.get('content-type') || 'image/webp').split(';')[0];
          const buf = Buffer.from(await imgResp.arrayBuffer());
          return {
            provider: 'HF FLUX.1-schnell (ZeroGPU)',
            mimeType: mime,
            dataUrl: `data:${mime};base64,${buf.toString('base64')}`,
          };
        }
      }
    }
    throw new Error('HF FLUX.1-schnell stream ended without completion event');
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, usage: 'POST { prompt, width, height, seed, model }' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const rl = checkRateLimit(req, { keyPrefix: 'image', maxRequests: 40, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) {
    return res.status(429).json({ ok: false, error: `Rate limit exceeded. Retry in ${rl.retryAfterSec}s.` });
  }

  try {
    const body = await readJsonBodySafe(req, 64_000);
    const prompt = String(body.prompt || '').trim();
    if (!prompt) {
      return res.status(400).json({ ok: false, error: 'Prompt is required.' });
    }
    if (prompt.length > 4000) {
      return res.status(400).json({ ok: false, error: 'Prompt exceeds 4,000 characters.' });
    }

    const width = clampDim(body.width, 1024);
    const height = clampDim(body.height, 576);
    const seed = Number.isInteger(Number(body.seed)) && Number(body.seed) >= 0
      ? Number(body.seed)
      : Math.floor(Math.random() * 2_000_000_000);
    const model = body.model === 'turbo' ? 'turbo' : 'flux';

    const errors = [];
    try {
      const result = await generateViaPollinations({ prompt, width, height, seed, model });
      return res.status(200).json({ ok: true, width, height, seed, ...result });
    } catch (e1) {
      errors.push(e1?.message || 'Pollinations failed');
    }

    try {
      const result = await generateViaHfFluxSchnell({ prompt, width, height, seed });
      return res.status(200).json({ ok: true, width, height, seed, ...result });
    } catch (e2) {
      errors.push(e2?.message || 'HF FLUX.1-schnell failed');
    }

    return res.status(502).json({
      ok: false,
      error: `All $0 image providers failed (${errors.join(' | ')}). Connect Colab T4 or retry shortly.`,
    });
  } catch (err) {
    return res
      .status(err?.statusCode || 500)
      .json({ ok: false, error: err?.message || 'Internal image API error' });
  }
}
