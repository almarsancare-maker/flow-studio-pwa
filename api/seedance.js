import { setCorsHeaders } from './_ssrf.js';
import {
  applyRateLimitHeaders,
  checkRateLimit,
  fetchWithAbort,
  readJsonBodySafe,
} from './_rateLimit.js';

/**
 * Stateless, hardened BYOK / Server-Key relay for ByteDance Seedance (2.5 / 2.0 / 1.5 Pro / 1.0 Pro)
 * via Replicate or fal.ai.
 *
 * 100M-scale hardening:
 * - Strict payload ceiling (4.5 MB max for I2V base64 frames) -> HTTP 413
 * - Per-IP sliding-window rate limiting -> HTTP 429 + Retry-After
 * - Strict host & model allowlist (zero SSRF; tight Replicate/fal delivery hosts only)
 * - Explicit AbortController timeouts on every upstream call
 * - Video download content-type + 50 MB memory cap
 * - Zero secret logging or persistence
 */

const REPLICATE_MODEL_RE = /^bytedance\/seedance[a-z0-9.-]{0,40}$/i;
const FAL_MODEL_RE = /^(?:fal-ai\/)?bytedance\/seedance[a-z0-9._/-]{0,64}$/i;

const ALLOWED_DOWNLOAD_HOSTS = [
  /(?:^|\.)replicate\.delivery$/i,
  /(?:^|\.)replicate\.com$/i,
  /(?:^|\.)fal\.media$/i,
  /(?:^|\.)fal\.ai$/i,
  /(?:^|\.)fal\.run$/i,
];

const MAX_VIDEO_DOWNLOAD_BYTES = 50 * 1024 * 1024;
const UA_HEADERS = { 'User-Agent': 'CabardoStudio/1.0' };

export function validateSeedanceModel(provider, model) {
  if (typeof model !== 'string' || !model.trim()) {
    return { ok: false, error: 'Missing Seedance model ID.' };
  }
  const clean = model.trim().replace(/^\/+|\/+$/g, '');
  if (clean.includes('..') || clean.includes('?') || clean.includes('#') || clean.includes('\\')) {
    return { ok: false, error: 'Invalid characters in Seedance model ID.' };
  }
  if (provider === 'replicate') {
    if (!REPLICATE_MODEL_RE.test(clean)) {
      return { ok: false, error: `Disallowed Replicate model: ${clean}` };
    }
    return { ok: true, model: clean };
  }
  if (provider === 'fal') {
    if (!FAL_MODEL_RE.test(clean)) {
      return { ok: false, error: `Disallowed fal.ai model: ${clean}` };
    }
    return { ok: true, model: clean };
  }
  return { ok: false, error: `Unsupported provider: ${provider}` };
}

export function validateSeedancePollUrl(provider, rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return { ok: false, error: 'Missing poll URL.' };
  }
  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { ok: false, error: 'Invalid poll URL.' };
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) {
    return { ok: false, error: 'Poll URL must be plain HTTPS.' };
  }
  if (provider === 'replicate') {
    if (
      parsed.hostname !== 'api.replicate.com' ||
      !parsed.pathname.startsWith('/v1/predictions/') ||
      parsed.pathname.includes('..')
    ) {
      return { ok: false, error: 'Disallowed Replicate poll URL.' };
    }
    return { ok: true, url: parsed.toString() };
  }
  if (provider === 'fal') {
    if (parsed.hostname !== 'queue.fal.run' || parsed.pathname.includes('..')) {
      return { ok: false, error: 'Disallowed fal.ai poll URL.' };
    }
    return { ok: true, url: parsed.toString() };
  }
  return { ok: false, error: 'Unsupported provider.' };
}

export function validateSeedanceDownloadUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl || '').trim());
  } catch {
    return { ok: false, error: 'Invalid media URL.' };
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) {
    return { ok: false, error: 'Media URL must be plain HTTPS.' };
  }
  const allowed = ALLOWED_DOWNLOAD_HOSTS.some((re) => re.test(parsed.hostname));
  if (!allowed) {
    return { ok: false, error: `Disallowed media host: ${parsed.hostname}` };
  }
  return { ok: true, url: parsed.toString() };
}

function extractVideoUrl(obj) {
  if (!obj) return null;
  if (typeof obj === 'string' && obj.startsWith('https://')) return obj;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = extractVideoUrl(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof obj === 'object') {
    if (typeof obj.video?.url === 'string') return obj.video.url;
    if (typeof obj.video === 'string' && obj.video.startsWith('https://')) return obj.video;
    if (typeof obj.url === 'string' && obj.url.startsWith('https://')) return obj.url;
    if (obj.output) return extractVideoUrl(obj.output);
    if (obj.data) return extractVideoUrl(obj.data);
  }
  return null;
}

export default async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const body = await readJsonBodySafe(req, 4_500_000);
    const action = String(body.action || '');

    // Tighter rate limit on expensive submit/verify actions; generous on polling
    const rl = checkRateLimit(req, {
      keyPrefix: `seedance:${action === 'poll' ? 'poll' : 'exec'}`,
      maxRequests: action === 'poll' ? 180 : 25,
      windowMs: 60_000,
    });
    applyRateLimitHeaders(res, rl);
    if (!rl.allowed) {
      return res.status(429).json({
        ok: false,
        error: `Rate limit exceeded. Retry in ${rl.retryAfterSec}s.`,
      });
    }

    const provider = body.provider === 'fal' ? 'fal' : 'replicate';
    const userSuppliedKey = String(body.apiKey || '').trim();
    const envFallbackKey =
      provider === 'replicate'
        ? String(process.env.REPLICATE_API_TOKEN || '').trim()
        : String(process.env.FAL_KEY || '').trim();
    const apiKey = userSuppliedKey || envFallbackKey;

    if (action === 'download') {
      const dlCheck = validateSeedanceDownloadUrl(body.videoUrl);
      if (!dlCheck.ok) return res.status(400).json({ ok: false, error: dlCheck.error });
      const upstream = await fetchWithAbort(dlCheck.url, { headers: UA_HEADERS }, 40_000);
      if (!upstream.ok) {
        return res.status(502).json({ ok: false, error: `Video download HTTP ${upstream.status}` });
      }
      const ctype = (upstream.headers.get('content-type') || 'video/mp4').toLowerCase();
      if (!ctype.startsWith('video/') && !ctype.startsWith('application/octet-stream')) {
        return res.status(400).json({ ok: false, error: `Unexpected media type: ${ctype}` });
      }
      const contentLen = Number(upstream.headers.get('content-length') || 0);
      if (contentLen > MAX_VIDEO_DOWNLOAD_BYTES) {
        return res.status(413).json({ ok: false, error: 'Video exceeds 50 MB relay limit.' });
      }
      const buf = Buffer.from(await upstream.arrayBuffer());
      if (buf.length > MAX_VIDEO_DOWNLOAD_BYTES) {
        return res.status(413).json({ ok: false, error: 'Video exceeds 50 MB relay limit.' });
      }
      res.setHeader('Content-Type', ctype.split(';')[0]);
      return res.status(200).send(buf);
    }

    if (!apiKey) {
      return res.status(400).json({ ok: false, error: 'Enter your Seedance API key first.' });
    }

    // Optional studio PIN guard when server env STUDIO_PIN is configured
    const requiredPin = String(process.env.STUDIO_PIN || '').trim();
    if (requiredPin && !userSuppliedKey && String(body.studioPin || '').trim() !== requiredPin) {
      return res.status(401).json({ ok: false, error: 'Studio PIN required for server key.' });
    }

    if (action === 'verify') {
      if (provider === 'replicate') {
        const resp = await fetchWithAbort(
          'https://api.replicate.com/v1/account',
          { headers: { Authorization: `Bearer ${apiKey}`, ...UA_HEADERS } },
          15_000
        );
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          return res.status(200).json({
            ok: false,
            error: data.detail || `Replicate rejected key (HTTP ${resp.status})`,
          });
        }
        return res.status(200).json({
          ok: true,
          provider: 'replicate',
          usingServerKey: !userSuppliedKey && Boolean(envFallbackKey),
          account: data.username || data.name || 'Replicate Account Verified',
        });
      }

      const resp = await fetchWithAbort(
        'https://queue.fal.run/bytedance/seedance-2.0/text-to-video',
        {
          method: 'POST',
          headers: {
            Authorization: `Key ${apiKey}`,
            'Content-Type': 'application/json',
            ...UA_HEADERS,
          },
          body: JSON.stringify({}),
        },
        15_000
      );
      if (resp.status === 401 || resp.status === 403) {
        const errData = await resp.json().catch(() => ({}));
        return res.status(200).json({
          ok: false,
          error: errData.detail || `fal.ai rejected key (HTTP ${resp.status})`,
        });
      }
      return res.status(200).json({
        ok: true,
        provider: 'fal',
        usingServerKey: !userSuppliedKey && Boolean(envFallbackKey),
        account: 'fal.ai Key Verified (Seedance Ready)',
      });
    }

    if (action === 'submit') {
      const prompt = String(body.prompt || '').trim();
      if (!prompt) return res.status(400).json({ ok: false, error: 'Prompt is required.' });
      if (prompt.length > 4000) {
        return res.status(400).json({ ok: false, error: 'Prompt exceeds 4,000 characters.' });
      }

      const isI2V =
        body.mode === 'i2v' &&
        typeof body.startFrameDataUrl === 'string' &&
        body.startFrameDataUrl.startsWith('data:image/');
      const hasEndFrame =
        isI2V &&
        typeof body.endFrameDataUrl === 'string' &&
        body.endFrameDataUrl.startsWith('data:image/');

      const resolution = ['480p', '720p', '1080p'].includes(body.resolution)
        ? body.resolution
        : '720p';
      const aspectRatio = ['16:9', '9:16', '1:1', '21:9'].includes(body.aspectRatio)
        ? body.aspectRatio
        : '16:9';
      const durationSec = Math.max(4, Math.min(10, Math.round(Number(body.durationSec) || 5)));
      const seed =
        Number.isInteger(Number(body.seed)) && Number(body.seed) >= 0
          ? Number(body.seed)
          : undefined;
      const generateAudio = body.generateAudio !== false;

      if (provider === 'replicate') {
        const mCheck = validateSeedanceModel('replicate', body.model || 'bytedance/seedance-2.5');
        if (!mCheck.ok) return res.status(400).json({ ok: false, error: mCheck.error });

        const isSeedance2x =
          mCheck.model.includes('seedance-2.5') || mCheck.model.includes('seedance-2.0');
        const isSeedance1Pro = mCheck.model === 'bytedance/seedance-1-pro';
        const effectiveRes = isSeedance2x && resolution === '1080p' ? '720p' : resolution;
        const effectiveAr = isSeedance2x && isI2V ? 'adaptive' : aspectRatio;

        const input = {
          prompt,
          duration: durationSec,
          resolution: effectiveRes,
          aspect_ratio: effectiveAr,
          ...(!isSeedance1Pro ? { generate_audio: generateAudio } : {}),
          ...(isSeedance2x ? { watermark: false, output_format: 'mp4' } : {}),
          ...(seed !== undefined ? { seed } : {}),
          ...(isI2V ? { image: body.startFrameDataUrl } : {}),
          ...(hasEndFrame ? { last_frame_image: body.endFrameDataUrl } : {}),
        };

        const resp = await fetchWithAbort(
          `https://api.replicate.com/v1/models/${mCheck.model}/predictions`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              ...UA_HEADERS,
            },
            body: JSON.stringify({ input }),
          },
          25_000
        );
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data?.id) {
          return res.status(resp.status >= 400 ? resp.status : 502).json({
            ok: false,
            error: data.detail || data.error || `Replicate submit failed (HTTP ${resp.status})`,
          });
        }
        return res.status(200).json({
          ok: true,
          provider: 'replicate',
          taskId: data.id,
          pollUrl: data.urls?.get || `https://api.replicate.com/v1/predictions/${data.id}`,
          status: data.status || 'starting',
        });
      }

      let falModel = String(body.model || 'bytedance/seedance-2.5/text-to-video').trim();
      if (isI2V && falModel.endsWith('/text-to-video')) {
        falModel = falModel.replace(/\/text-to-video$/, '/image-to-video');
      } else if (!isI2V && falModel.endsWith('/image-to-video')) {
        falModel = falModel.replace(/\/image-to-video$/, '/text-to-video');
      } else if (!falModel.endsWith('/text-to-video') && !falModel.endsWith('/image-to-video')) {
        falModel = `${falModel}/${isI2V ? 'image-to-video' : 'text-to-video'}`;
      }

      const mCheck = validateSeedanceModel('fal', falModel);
      if (!mCheck.ok) return res.status(400).json({ ok: false, error: mCheck.error });

      const falInput = {
        prompt,
        resolution,
        duration: String(durationSec),
        aspect_ratio: aspectRatio,
        generate_audio: generateAudio,
        ...(seed !== undefined ? { seed } : {}),
        ...(isI2V ? { image_url: body.startFrameDataUrl } : {}),
        ...(hasEndFrame ? { end_image_url: body.endFrameDataUrl } : {}),
      };

      const resp = await fetchWithAbort(
        `https://queue.fal.run/${mCheck.model}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Key ${apiKey}`,
            'Content-Type': 'application/json',
            ...UA_HEADERS,
          },
          body: JSON.stringify(falInput),
        },
        25_000
      );
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data?.request_id) {
        return res.status(resp.status >= 400 ? resp.status : 502).json({
          ok: false,
          error: data.detail || data.message || `fal.ai submit failed (HTTP ${resp.status})`,
        });
      }
      return res.status(200).json({
        ok: true,
        provider: 'fal',
        taskId: data.request_id,
        pollUrl: data.status_url,
        responseUrl: data.response_url,
        status: data.status || 'IN_QUEUE',
      });
    }

    if (action === 'poll') {
      const pCheck = validateSeedancePollUrl(provider, body.pollUrl);
      if (!pCheck.ok) return res.status(400).json({ ok: false, error: pCheck.error });

      if (provider === 'replicate') {
        const resp = await fetchWithAbort(
          pCheck.url,
          { headers: { Authorization: `Bearer ${apiKey}`, ...UA_HEADERS } },
          15_000
        );
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          return res.status(resp.status).json({
            ok: false,
            status: 'failed',
            error: data.detail || `Replicate poll HTTP ${resp.status}`,
          });
        }
        if (data.status === 'failed' || data.status === 'canceled') {
          return res.status(200).json({
            ok: false,
            status: 'failed',
            error: data.error || `Replicate prediction ${data.status}`,
          });
        }
        if (data.status === 'succeeded') {
          const videoUrl = extractVideoUrl(data.output);
          if (!videoUrl) {
            return res.status(200).json({
              ok: false,
              status: 'failed',
              error: 'Seedance succeeded but returned no video URL.',
            });
          }
          return res.status(200).json({
            ok: true,
            status: 'completed',
            progress: 100,
            phase: 'Seedance video ready!',
            videoUrl,
          });
        }
        return res.status(200).json({
          ok: true,
          status: 'processing',
          progress: data.status === 'processing' ? 58 : 25,
          phase:
            data.status === 'processing'
              ? 'Diffusing cinema video on Seedance...'
              : 'Waiting in Replicate Seedance queue...',
        });
      }

      const resp = await fetchWithAbort(
        pCheck.url,
        { headers: { Authorization: `Key ${apiKey}`, ...UA_HEADERS } },
        15_000
      );
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        return res.status(resp.status).json({
          ok: false,
          status: 'failed',
          error: data.detail || `fal.ai poll HTTP ${resp.status}`,
        });
      }
      const st = String(data.status || '').toUpperCase();
      if (st === 'FAILED' || st === 'ERROR') {
        return res.status(200).json({
          ok: false,
          status: 'failed',
          error: data.error || 'fal.ai Seedance job failed',
        });
      }
      if (st === 'COMPLETED') {
        const rCheck = validateSeedancePollUrl('fal', body.responseUrl || data.response_url);
        if (!rCheck.ok) {
          return res.status(200).json({ ok: false, status: 'failed', error: rCheck.error });
        }
        const resResp = await fetchWithAbort(
          rCheck.url,
          { headers: { Authorization: `Key ${apiKey}`, ...UA_HEADERS } },
          15_000
        );
        const resData = await resResp.json().catch(() => ({}));
        const videoUrl = extractVideoUrl(resData);
        if (!videoUrl) {
          return res.status(200).json({
            ok: false,
            status: 'failed',
            error: 'fal.ai Seedance completed without a video URL.',
          });
        }
        return res.status(200).json({
          ok: true,
          status: 'completed',
          progress: 100,
          phase: 'Seedance video ready!',
          videoUrl,
        });
      }
      return res.status(200).json({
        ok: true,
        status: 'processing',
        progress: st === 'IN_PROGRESS' ? 60 : 25,
        phase:
          st === 'IN_PROGRESS'
            ? 'Diffusing cinema video on Seedance (fal.ai)...'
            : `Queued on fal.ai (position ${data.queue_position ?? '—'})...`,
      });
    }

    return res.status(400).json({ ok: false, error: `Unknown action: ${action}` });
  } catch (err) {
    const code = err?.statusCode || (err?.name === 'AbortError' ? 504 : 502);
    return res.status(code).json({
      ok: false,
      error: err?.name === 'AbortError' ? 'Upstream Seedance API timed out.' : err?.message || 'Seedance relay error',
    });
  }
}
