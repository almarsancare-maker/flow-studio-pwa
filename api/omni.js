import { setCorsHeaders } from './_ssrf.js';
import {
  applyRateLimitHeaders,
  checkRateLimit,
  fetchWithAbort,
  readJsonBodySafe,
} from './_rateLimit.js';

/**
 * Official Google Gemini Omni 1.2 Flash (`gemini-omni-1.2-flash`) Interactions API Relay.
 *
 * Capabilities:
 * - Text-to-Video (3s–15s, 360p / 720p / 1080p / 4k, native synchronized audio)
 * - First-Frame-to-Video (3s–15s) & First-and-Last-Frame Interpolation (3s–10s)
 * - Multi-Reference-to-Video (R2V, up to 6 Bible reference images)
 * - Turn-by-Turn Video Editing & Extension (3s–10s per turn, up to 30s) via previous_interaction_id
 *
 * Security:
 * - Strict URI/ID allowlists (generativelanguage.googleapis.com only — zero SSRF)
 * - Keys passed strictly via x-goog-api-key header, never in URLs or logs; errors redacted
 * - Rate limiting (HTTP 429) & payload caps (HTTP 413)
 */

const OMNI_MODEL = 'gemini-omni-1.2-flash';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com';
const INTERACTION_ID_RE = /^[a-zA-Z0-9._-]{4,160}$/;
const FILE_URI_RE =
  /^https:\/\/generativelanguage\.googleapis\.com\/(?:v1beta\/)?files\/([a-zA-Z0-9_-]{4,128})(?::download)?(?:\?alt=media)?$/;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export function sanitizeGeminiError(msg, apiKey = '') {
  let out = String(msg || 'Gemini Omni API error');
  if (apiKey && apiKey.length >= 8) {
    out = out.split(apiKey).join('[REDACTED_KEY]');
  }
  out = out.replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED_KEY]');
  out = out.replace(/AQ\.[0-9A-Za-z_-]{16,}/g, '[REDACTED_KEY]');
  out = out.replace(/([?&](?:key|api_key|token)=)[^&\s"'<>]+/gi, '$1[REDACTED]');
  return out.slice(0, 420);
}

export function validateGeminiInteractionId(id) {
  if (typeof id !== 'string' || !INTERACTION_ID_RE.test(id.trim())) {
    return { ok: false, error: 'Invalid Gemini interaction ID.' };
  }
  return { ok: true, id: id.trim() };
}

export function validateGeminiFileUri(rawUri) {
  const clean = String(rawUri || '').trim();
  const match = FILE_URI_RE.exec(clean);
  if (!match) {
    return { ok: false, error: 'Disallowed Gemini file URI.' };
  }
  const fileId = match[1];
  return {
    ok: true,
    fileId,
    downloadUrl: `${GEMINI_BASE}/v1beta/files/${fileId}:download?alt=media`,
  };
}

async function uploadDataUrlToGeminiFiles(apiKey, dataUrl, displayName) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error('Invalid image Data URL for Gemini Files upload.');
  const mimeType = match[1];
  const imgBuf = Buffer.from(match[2], 'base64');

  const boundary = `----CabardoOmni${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const metaJson = JSON.stringify({ file: { display_name: displayName, mime_type: mimeType } });
  const head = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaJson}\r\n` +
      `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    'utf8'
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  const body = Buffer.concat([head, imgBuf, tail]);

  const resp = await fetchWithAbort(
    `${GEMINI_BASE}/upload/v1beta/files?uploadType=multipart`,
    {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': String(body.length),
      },
      body,
    },
    30_000
  );
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(
      sanitizeGeminiError(data?.error?.message || `Files API upload HTTP ${resp.status}`, apiKey)
    );
  }
  const fileObj = data.file || data;
  const rawUri = fileObj?.uri || (fileObj?.name ? `${GEMINI_BASE}/v1beta/${fileObj.name}` : null);
  const fileIdMatch = /files\/([a-zA-Z0-9_-]+)/.exec(String(rawUri || ''));
  if (!fileIdMatch) throw new Error('Gemini Files API did not return a valid file URI.');
  return {
    uri: `${GEMINI_BASE}/files/${fileIdMatch[1]}`,
    mime_type: fileObj.mimeType || fileObj.mime_type || mimeType,
  };
}

function extractOmniVideoUri(interaction) {
  if (!interaction || typeof interaction !== 'object') return null;
  const candidates = [];
  if (Array.isArray(interaction.outputs)) candidates.push(...interaction.outputs);
  if (Array.isArray(interaction.steps)) {
    for (const step of interaction.steps) {
      if (Array.isArray(step?.content)) candidates.push(...step.content);
    }
  }
  for (const part of candidates) {
    if (part?.type === 'video' && typeof part?.uri === 'string') {
      return part.uri;
    }
  }
  if (typeof interaction.output_video?.uri === 'string') {
    return interaction.output_video.uri;
  }
  return null;
}

export default async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  let apiKey = '';
  try {
    const body = await readJsonBodySafe(req, 4_500_000);
    const action = String(body.action || '');

    const rl = checkRateLimit(req, {
      keyPrefix: `omni:${action === 'poll' ? 'poll' : 'exec'}`,
      maxRequests: action === 'poll' ? 180 : 20,
      windowMs: 60_000,
    });
    applyRateLimitHeaders(res, rl);
    if (!rl.allowed) {
      return res
        .status(429)
        .json({ ok: false, error: `Rate limit exceeded. Retry in ${rl.retryAfterSec}s.` });
    }

    const userKey = String(body.apiKey || '').trim();
    const envKey = String(process.env.GEMINI_API_KEY || '').trim();
    apiKey = userKey || envKey;

    if (!apiKey) {
      return res.status(400).json({
        ok: false,
        error: 'Enter your Google AI Studio GEMINI_API_KEY first (aistudio.google.com/apikey).',
      });
    }

    // ── VERIFY GEMINI API KEY ──────────────────────────────────────────
    if (action === 'verify') {
      const resp = await fetchWithAbort(
        `${GEMINI_BASE}/v1beta/models/${OMNI_MODEL}`,
        { headers: { 'x-goog-api-key': apiKey } },
        15_000
      );
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        return res.status(200).json({
          ok: false,
          error: sanitizeGeminiError(
            data?.error?.message || `Gemini API rejected key (HTTP ${resp.status})`,
            apiKey
          ),
        });
      }
      return res.status(200).json({
        ok: true,
        usingServerKey: !userKey && Boolean(envKey),
        model: data.displayName || OMNI_MODEL,
      });
    }

    // ── DOWNLOAD GENERATED MP4 FROM GEMINI FILES API ───────────────────
    if (action === 'download') {
      const check = validateGeminiFileUri(body.videoUri);
      if (!check.ok) return res.status(400).json({ ok: false, error: check.error });
      const resp = await fetchWithAbort(
        check.downloadUrl,
        { headers: { 'x-goog-api-key': apiKey } },
        45_000
      );
      if (!resp.ok) {
        return res.status(502).json({
          ok: false,
          error: `Gemini video download failed (HTTP ${resp.status})`,
        });
      }
      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.length > MAX_VIDEO_BYTES) {
        return res.status(413).json({ ok: false, error: 'Video exceeds 50 MB relay cap.' });
      }
      res.setHeader('Content-Type', resp.headers.get('content-type') || 'video/mp4');
      return res.status(200).send(buf);
    }

    // ── SUBMIT ASYNC GEMINI OMNI 1.2 FLASH INTERACTION ─────────────────
    if (action === 'submit') {
      let promptText = String(body.prompt || '').trim();
      if (!promptText) return res.status(400).json({ ok: false, error: 'Prompt is required.' });
      if (promptText.length > 4000) {
        return res.status(400).json({ ok: false, error: 'Prompt exceeds 4,000 characters.' });
      }

      const prevId = body.previousInteractionId
        ? validateGeminiInteractionId(body.previousInteractionId)
        : null;
      if (prevId && !prevId.ok) return res.status(400).json({ ok: false, error: prevId.error });

      const turnAction = body.omniTurnAction === 'extend' ? 'extend' : body.omniTurnAction === 'edit' ? 'edit' : null;
      const isI2V =
        !prevId &&
        body.mode === 'i2v' &&
        typeof body.startFrameDataUrl === 'string' &&
        body.startFrameDataUrl.startsWith('data:image/');
      const hasEndFrame =
        isI2V &&
        typeof body.endFrameDataUrl === 'string' &&
        body.endFrameDataUrl.startsWith('data:image/');

      const refList = Array.isArray(body.referenceImages)
        ? body.referenceImages
            .filter((x) => typeof x === 'string' && x.startsWith('data:image/'))
            .slice(0, 4)
        : [];

      const inputParts = [];

      if (isI2V) {
        const f1 = await uploadDataUrlToGeminiFiles(apiKey, body.startFrameDataUrl, 'first_frame');
        inputParts.push({ type: 'image', uri: f1.uri, mime_type: f1.mime_type });
        if (hasEndFrame) {
          const f2 = await uploadDataUrlToGeminiFiles(apiKey, body.endFrameDataUrl, 'last_frame');
          inputParts.push({ type: 'image', uri: f2.uri, mime_type: f2.mime_type });
        }
      }

      for (let i = 0; i < refList.length; i++) {
        const refUp = await uploadDataUrlToGeminiFiles(apiKey, refList[i], `bible_ref_${i + 1}`);
        inputParts.push({ type: 'image', uri: refUp.uri, mime_type: refUp.mime_type });
      }

      // Natural-language role binding per official gemini-omni-1.2-flash guide
      const lower = promptText.toLowerCase();
      const appendHint = (hint) => {
        const sep = /[.!?]$/.test(promptText) ? '' : '.';
        promptText = `${promptText}${sep} ${hint}`;
      };
      if (turnAction === 'extend' && !/(extend|continue|keep going)/i.test(lower)) {
        promptText = `Extend this video. ${promptText}`;
      } else if (isI2V && hasEndFrame && !lower.includes('starting frame') && !lower.includes('first frame')) {
        appendHint('Use the first image as the starting frame and the second image as the final frame.');
      } else if (isI2V && !lower.includes('starting frame') && !lower.includes('first frame')) {
        appendHint(
          refList.length > 0
            ? 'Use the first image as the starting frame and any additional images as character/environment references.'
            : 'Use this image as the starting frame.'
        );
      } else if (!isI2V && refList.length > 0 && !lower.includes('reference')) {
        appendHint('Use the provided reference image(s) for consistent character and environment styling.');
      }

      inputParts.push({ type: 'text', text: promptText });

      // Enforce official Omni Flash 1.2 duration caps (3s–10s for 2-frame/extend, 3s–15s otherwise)
      const maxDur = hasEndFrame || turnAction === 'extend' ? 10 : 15;
      const clampedDur = Math.max(3, Math.min(maxDur, Math.round(Number(body.durationSec) || 8)));
      const resolution = ['360p', '720p', '1080p', '4k'].includes(body.resolution)
        ? body.resolution
        : '720p';
      const aspectRatio = body.aspectRatio === '9:16' ? '9:16' : '16:9';

      const responseFormat = {
        type: 'video',
        delivery: 'uri',
        duration: `${clampedDur}s`,
        resolution,
        ...(turnAction !== 'extend' ? { aspect_ratio: aspectRatio } : {}),
      };

      const payload = {
        model: OMNI_MODEL,
        input: inputParts,
        response_format: responseFormat,
        background: true,
        ...(prevId ? { previous_interaction_id: prevId.id } : {}),
      };

      const resp = await fetchWithAbort(
        `${GEMINI_BASE}/v1beta/interactions`,
        {
          method: 'POST',
          headers: {
            'x-goog-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
        35_000
      );
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data?.id) {
        return res.status(resp.status >= 400 ? resp.status : 502).json({
          ok: false,
          billingRequired: resp.status === 402 || resp.status === 429 || /billing|quota|paid/i.test(String(data?.error?.message || '')),
          error: sanitizeGeminiError(
            data?.error?.message || `Gemini Omni submit failed (HTTP ${resp.status})`,
            apiKey
          ),
        });
      }

      const immediateUri = extractOmniVideoUri(data);
      return res.status(200).json({
        ok: true,
        interactionId: data.id,
        status: data.status || (immediateUri ? 'completed' : 'in_progress'),
        videoUri: immediateUri,
      });
    }

    // ── POLL INTERACTION STATUS ────────────────────────────────────────
    if (action === 'poll') {
      const check = validateGeminiInteractionId(body.interactionId);
      if (!check.ok) return res.status(400).json({ ok: false, error: check.error });

      const resp = await fetchWithAbort(
        `${GEMINI_BASE}/v1beta/interactions/${check.id}`,
        { headers: { 'x-goog-api-key': apiKey } },
        15_000
      );
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        return res.status(resp.status).json({
          ok: false,
          status: 'failed',
          error: sanitizeGeminiError(data?.error?.message || `Omni poll HTTP ${resp.status}`, apiKey),
        });
      }

      const st = String(data.status || '').toLowerCase();
      if (st === 'failed' || st === 'cancelled' || st === 'canceled') {
        return res.status(200).json({
          ok: false,
          status: 'failed',
          error: sanitizeGeminiError(data?.error?.message || `Omni interaction ${st}`, apiKey),
        });
      }

      const videoUri = extractOmniVideoUri(data);
      if (st === 'completed' || videoUri) {
        if (!videoUri) {
          return res.status(200).json({
            ok: false,
            status: 'failed',
            error:
              'Omni completed with empty video output (note: video uploads/edits have regional restrictions in EEA/UK/CH).',
          });
        }
        return res.status(200).json({
          ok: true,
          status: 'completed',
          progress: 100,
          phase: 'Gemini Omni 1.2 Flash video ready!',
          interactionId: data.id || check.id,
          videoUri,
        });
      }

      return res.status(200).json({
        ok: true,
        status: 'processing',
        progress: 52,
        phase: 'Generating native audio & video on Gemini Omni 1.2 Flash...',
      });
    }

    return res.status(400).json({ ok: false, error: `Unknown action: ${action}` });
  } catch (err) {
    const code = err?.statusCode || (err?.name === 'AbortError' ? 504 : 502);
    return res.status(code).json({
      ok: false,
      error: sanitizeGeminiError(
        err?.name === 'AbortError' ? 'Gemini Omni API timed out.' : err?.message,
        apiKey
      ),
    });
  }
}
