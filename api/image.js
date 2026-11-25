import { setCorsHeaders } from './_ssrf.js';
import { applyRateLimitHeaders, checkRateLimit, readJsonBodySafe } from './_rateLimit.js';

/**
 * Unbreakable $0 Cloud Image Cascade:
 *  1) Hugging Face FLUX.1-schnell (ZeroGPU, 4 steps — honors optional user hfToken)
 *  2) Hugging Face SD 3.5 Large Turbo (separate ZeroGPU pool — handles bursts / 4x Quartets!)
 *  3) Hugging Face FLUX.1-dev (when flux-dev requested or as 3rd ZeroGPU pool)
 *  4) Pollinations Turbo (fast single attempt)
 *  5) AI Horde (stablehorde.net free anonymous community GPU pool — unlimited fallback!)
 */

function clampDim(val, fallback) {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(256, Math.min(1280, Math.round(n / 16) * 16));
}

function hfHeaders(hfToken, extra = {}) {
  const clean = String(hfToken || '').trim();
  return clean ? { ...extra, Authorization: `Bearer ${clean}` } : extra;
}

async function runGradioImageSpace({ host, endpoint = 'infer', data, provider, hfToken, timeoutMs = 28_000 }) {
  const submitCtrl = new AbortController();
  const submitTimer = setTimeout(() => submitCtrl.abort(), 14_000);
  let eventId;
  try {
    const submitResp = await fetch(`${host}/gradio_api/call/${endpoint}`, {
      method: 'POST',
      headers: hfHeaders(hfToken, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ data }),
      signal: submitCtrl.signal,
    });
    if (!submitResp.ok) {
      throw new Error(`${provider} submit HTTP ${submitResp.status}`);
    }
    const json = await submitResp.json();
    eventId = json?.event_id;
    if (!eventId) throw new Error(`${provider} missing event_id`);
  } finally {
    clearTimeout(submitTimer);
  }

  const sseCtrl = new AbortController();
  const sseTimer = setTimeout(() => sseCtrl.abort(), timeoutMs);
  try {
    const sseResp = await fetch(`${host}/gradio_api/call/${endpoint}/${eventId}`, {
      headers: hfHeaders(hfToken),
      signal: sseCtrl.signal,
    });
    if (!sseResp.ok) {
      throw new Error(`${provider} stream HTTP ${sseResp.status}`);
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
          throw new Error(`${provider} quota/error (${raw || 'busy'})`);
        }
        if (eventName === 'complete') {
          const parsed = JSON.parse(raw);
          const imgObj = Array.isArray(parsed) ? parsed[0] : null;
          const imgUrl =
            imgObj?.url || (imgObj?.path ? `${host}/gradio_api/file=${imgObj.path}` : null);
          if (!imgUrl) throw new Error(`${provider} missing image URL`);
          const imgResp = await fetch(imgUrl, { headers: hfHeaders(hfToken) });
          if (!imgResp.ok) throw new Error(`${provider} download HTTP ${imgResp.status}`);
          const mime = (imgResp.headers.get('content-type') || 'image/webp').split(';')[0];
          const buf = Buffer.from(await imgResp.arrayBuffer());
          if (buf.length < 1024) throw new Error(`${provider} empty image blob`);
          return {
            provider,
            mimeType: mime,
            dataUrl: `data:${mime};base64,${buf.toString('base64')}`,
          };
        }
      }
    }
    throw new Error(`${provider} stream ended without output`);
  } finally {
    clearTimeout(sseTimer);
  }
}

async function generateViaHfFluxSchnell({ prompt, width, height, seed, hfToken }) {
  return runGradioImageSpace({
    host: 'https://black-forest-labs-flux-1-schnell.hf.space',
    data: [prompt, seed, false, width, height, 4],
    provider: 'HF FLUX.1-schnell (ZeroGPU)',
    hfToken,
    timeoutMs: 26_000,
  });
}

async function generateViaHfSd35Turbo({ prompt, negativePrompt, width, height, seed, hfToken }) {
  const safeW = Math.max(512, Math.min(1280, Math.round(width / 16) * 16));
  const safeH = Math.max(512, Math.min(1280, Math.round(height / 16) * 16));
  return runGradioImageSpace({
    host: 'https://stabilityai-stable-diffusion-3-5-large-turbo.hf.space',
    data: [
      prompt,
      negativePrompt || 'blurry, low quality, distorted, watermark, text',
      seed,
      false,
      safeW,
      safeH,
      1.0,
      4,
    ],
    provider: 'HF SD 3.5 Large Turbo (ZeroGPU)',
    hfToken,
    timeoutMs: 28_000,
  });
}

async function generateViaPollinations({ prompt, width, height, seed, model }) {
  const safeModel = model === 'turbo' ? 'turbo' : 'flux';
  const urlPrompt = prompt.length > 850 ? prompt.slice(0, 850).trim() : prompt;
  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(urlPrompt)}` +
    `?width=${width}&height=${height}&seed=${seed}&model=${safeModel}&nologo=true&enhance=false`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 11_000);
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'FlowStudioPWA/1.0', Accept: 'image/*' },
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`Pollinations HTTP ${resp.status}`);
    const contentType = resp.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      throw new Error(`Pollinations non-image: ${contentType}`);
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length < 1024) throw new Error('Pollinations empty payload');
    return {
      provider: `Pollinations ${safeModel.toUpperCase()}`,
      mimeType: contentType.split(';')[0],
      dataUrl: `data:${contentType.split(';')[0]};base64,${buf.toString('base64')}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function generateViaAiHorde({ prompt, negativePrompt, width, height, seed }) {
  // AI Horde anonymous tier caps at 576x576 without kudos; keep aspect ratio cleanly within 64px grid
  const ar = width / Math.max(1, height);
  let w = 512;
  let h = 512;
  if (ar > 1.25) {
    w = 576;
    h = 384;
  } else if (ar < 0.8) {
    w = 384;
    h = 576;
  }
  const combinedPrompt = negativePrompt ? `${prompt.slice(0, 900)} ### ${negativePrompt.slice(0, 220)}` : prompt.slice(0, 900);

  const subResp = await fetch('https://stablehorde.net/api/v2/generate/async', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: '0000000000',
      'Client-Agent': 'FlowStudioPWA:1.0:cabardo',
    },
    body: JSON.stringify({
      prompt: combinedPrompt,
      params: { width: w, height: h, steps: 18, n: 1, seed: String(seed) },
      nsfw: false,
      censor_nsfw: true,
      r2: true,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const subData = await subResp.json().catch(() => ({}));
  if (!subResp.ok || !subData?.id) {
    throw new Error(`AI Horde submit HTTP ${subResp.status}: ${subData?.message || 'rejected'}`);
  }

  const jobId = subData.id;
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const chkResp = await fetch(`https://stablehorde.net/api/v2/generate/status/${jobId}`, {
      headers: { 'Client-Agent': 'FlowStudioPWA:1.0:cabardo' },
      signal: AbortSignal.timeout(8_000),
    });
    const chk = await chkResp.json().catch(() => ({}));
    if (chk?.faulted) throw new Error('AI Horde worker faulted');
    if (chk?.done && Array.isArray(chk.generations) && chk.generations[0]?.img) {
      const imgUrl = chk.generations[0].img;
      if (imgUrl.startsWith('https://')) {
        const imgResp = await fetch(imgUrl, { signal: AbortSignal.timeout(12_000) });
        if (!imgResp.ok) throw new Error(`AI Horde image download HTTP ${imgResp.status}`);
        const mime = (imgResp.headers.get('content-type') || 'image/webp').split(';')[0];
        const buf = Buffer.from(await imgResp.arrayBuffer());
        return {
          provider: 'AI Horde Community GPU ($0)',
          mimeType: mime,
          dataUrl: `data:${mime};base64,${buf.toString('base64')}`,
        };
      }
      return {
        provider: 'AI Horde Community GPU ($0)',
        mimeType: 'image/webp',
        dataUrl: `data:image/webp;base64,${imgUrl}`,
      };
    }
  }
  throw new Error('AI Horde timed out waiting for worker');
}

export default async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, usage: 'POST { prompt, width, height, seed, model }' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const rl = checkRateLimit(req, { keyPrefix: 'image', maxRequests: 60, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) {
    return res.status(429).json({ ok: false, error: `Rate limit exceeded. Retry in ${rl.retryAfterSec}s.` });
  }

  try {
    const body = await readJsonBodySafe(req, 64_000);
    const prompt = String(body.prompt || '').trim();
    if (!prompt) return res.status(400).json({ ok: false, error: 'Prompt is required.' });
    if (prompt.length > 4000) {
      return res.status(400).json({ ok: false, error: 'Prompt exceeds 4,000 characters.' });
    }

    const negativePrompt = String(body.negativePrompt || '').trim();
    const width = clampDim(body.width, 1024);
    const height = clampDim(body.height, 576);
    const seed =
      Number.isInteger(Number(body.seed)) && Number(body.seed) >= 0
        ? Number(body.seed)
        : Math.floor(Math.random() * 2_000_000_000);
    const model = String(body.model || 'flux');
    const hfToken = String(body.hfToken || '').trim() || undefined;

    // Distribute 4x Quartet bursts cleanly across multiple independent ZeroGPU pools by seed parity
    const preferSd35First = model === 'sd35-turbo' || (seed % 2 === 1 && model !== 'flux-dev');
    const providers = preferSd35First
      ? [
          () => generateViaHfSd35Turbo({ prompt, negativePrompt, width, height, seed, hfToken }),
          () => generateViaHfFluxSchnell({ prompt, width, height, seed, hfToken }),
          () => generateViaPollinations({ prompt, width, height, seed, model: 'turbo' }),
          () => generateViaAiHorde({ prompt, negativePrompt, width, height, seed }),
        ]
      : [
          () => generateViaHfFluxSchnell({ prompt, width, height, seed, hfToken }),
          () => generateViaHfSd35Turbo({ prompt, negativePrompt, width, height, seed, hfToken }),
          () => generateViaPollinations({ prompt, width, height, seed, model: 'turbo' }),
          () => generateViaAiHorde({ prompt, negativePrompt, width, height, seed }),
        ];

    const errors = [];
    for (const run of providers) {
      try {
        const result = await run();
        return res.status(200).json({ ok: true, width, height, seed, ...result });
      } catch (e) {
        errors.push(e?.message || 'provider failed');
      }
    }

    return res.status(502).json({
      ok: false,
      error: `All $0 image providers busy (${errors.join(' | ')}). Retry shortly or add a free HF token in Setup GPU.`,
    });
  } catch (err) {
    return res
      .status(err?.statusCode || 500)
      .json({ ok: false, error: err?.message || 'Internal image API error' });
  }
}
