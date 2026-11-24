import { setCorsHeaders, validateColabBaseUrl } from './_ssrf.js';
import {
  applyRateLimitHeaders,
  checkRateLimit,
  fetchWithAbort,
  readJsonBodySafe,
} from './_rateLimit.js';

const LTX_SPACE_HOST = 'https://lightricks-ltx-video-distilled.hf.space';

async function uploadImageToGradio(host, dataUrl) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error('Invalid start frame image Data URL.');
  const mime = match[1];
  const ext = mime.includes('png') ? 'png' : 'jpg';
  const buf = Buffer.from(match[2], 'base64');

  const form = new FormData();
  form.append('files', new Blob([buf], { type: mime }), `start_frame.${ext}`);

  const resp = await fetch(`${host}/gradio_api/upload`, {
    method: 'POST',
    body: form,
  });
  if (!resp.ok) {
    throw new Error(`Gradio image upload failed: HTTP ${resp.status}`);
  }
  const uploaded = await resp.json();
  if (!Array.isArray(uploaded) || !uploaded[0]) {
    throw new Error('Gradio upload returned no file path');
  }
  return {
    path: uploaded[0],
    meta: { _type: 'gradio.FileData' },
  };
}

async function submitHfLtxVideo(body) {
  const prompt = String(body.prompt || '').trim();
  const negativePrompt =
    String(body.negativePrompt || '').trim() ||
    'worst quality, inconsistent motion, blurry, jittery, distorted';
  const width = Math.max(384, Math.min(768, Math.round((Number(body.width) || 704) / 32) * 32));
  const height = Math.max(384, Math.min(768, Math.round((Number(body.height) || 512) / 32) * 32));
  const durationSec = Math.max(2, Math.min(5, Math.round(Number(body.durationSec) || 3)));
  const seed = Number.isInteger(Number(body.seed)) && Number(body.seed) >= 0 ? Number(body.seed) : 42;
  const isI2V = body.mode === 'i2v' && typeof body.startFrameDataUrl === 'string' && body.startFrameDataUrl.startsWith('data:image/');

  let uploadedImage = null;
  if (isI2V) {
    uploadedImage = await uploadImageToGradio(LTX_SPACE_HOST, body.startFrameDataUrl);
  }

  const endpoint = isI2V ? 'image_to_video' : 'text_to_video';
  const payloadData = [
    prompt,
    negativePrompt,
    uploadedImage,
    null,
    height,
    width,
    isI2V ? 'image-to-video' : 'text-to-video',
    durationSec,
    9,
    seed,
    false,
    1,
    true,
  ];

  const submitResp = await fetch(`${LTX_SPACE_HOST}/gradio_api/call/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: payloadData }),
  });

  if (!submitResp.ok) {
    throw new Error(`HF LTX-Video submit HTTP ${submitResp.status}`);
  }
  const { event_id: eventId } = await submitResp.json();
  if (!eventId) {
    throw new Error('HF LTX-Video did not return an event_id');
  }

  return {
    ok: true,
    provider: 'hf-ltx-video',
    taskId: eventId,
    endpoint,
    status: 'processing',
  };
}

async function pollHfLtxVideo(eventId, endpoint) {
  const safeEp = endpoint === 'image_to_video' ? 'image_to_video' : 'text_to_video';
  if (!/^[a-zA-Z0-9_-]{6,128}$/.test(eventId)) {
    return { ok: false, status: 'failed', error: 'Invalid HF eventId' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 22_000);
  let lastEvent = '';
  let lastData = '';

  try {
    const resp = await fetch(`${LTX_SPACE_HOST}/gradio_api/call/${safeEp}/${eventId}`, {
      signal: controller.signal,
    });
    if (!resp.ok) {
      return { ok: false, status: 'failed', fallback: 'ken-burns-local', error: `HF stream HTTP ${resp.status}` };
    }

    const reader = resp.body?.getReader();
    if (!reader) {
      return { ok: false, status: 'failed', fallback: 'ken-burns-local', error: 'Empty SSE body' };
    }

    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('event:')) {
          lastEvent = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          lastData = line.slice(5).trim();
          if (lastEvent === 'error') {
            return {
              ok: false,
              status: 'failed',
              fallback: 'ken-burns-local',
              error: `HF ZeroGPU busy/quota (${lastData || 'error'})`,
            };
          }
          if (lastEvent === 'complete') {
            const parsed = JSON.parse(lastData);
            const first = Array.isArray(parsed) ? parsed[0] : null;
            const videoObj = first?.video || first;
            const videoUrl =
              videoObj?.url ||
              (videoObj?.path ? `${LTX_SPACE_HOST}/gradio_api/file=${videoObj.path}` : null);
            if (!videoUrl) {
              return {
                ok: false,
                status: 'failed',
                fallback: 'ken-burns-local',
                error: 'HF LTX-Video completed without video URL',
              };
            }
            return {
              ok: true,
              status: 'completed',
              progress: 100,
              phase: 'Completed on HF LTX-Video ZeroGPU',
              videoUrl,
            };
          }
        }
      }
    }
    return {
      ok: false,
      status: 'failed',
      fallback: 'ken-burns-local',
      error: 'HF LTX-Video stream closed without output',
    };
  } catch (err) {
    if (err?.name === 'AbortError') {
      return {
        ok: true,
        status: 'processing',
        progress: 55,
        phase: 'Rendering on HF LTX-Video ZeroGPU...',
      };
    }
    return {
      ok: false,
      status: 'failed',
      fallback: 'ken-burns-local',
      error: err?.message || 'HF poll failed',
    };
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const rl = checkRateLimit(req, {
    keyPrefix: `video:${req.method}`,
    maxRequests: req.method === 'GET' ? 180 : 30,
    windowMs: 60_000,
  });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) {
    return res.status(429).json({ ok: false, error: `Rate limit exceeded. Retry in ${rl.retryAfterSec}s.` });
  }

  try {
    if (req.method === 'GET') {
      const provider = String(req.query?.provider || '');
      const taskId = String(req.query?.taskId || '');
      if (!taskId) {
        return res.status(400).json({ ok: false, error: 'Missing taskId' });
      }

      if (provider === 'colab-t4') {
        const colabUrl = String(req.query?.colabUrl || '');
        const check = validateColabBaseUrl(colabUrl);
        if (!check.ok) return res.status(400).json({ ok: false, error: check.error });
        if (!/^[a-zA-Z0-9_-]{4,64}$/.test(taskId)) {
          return res.status(400).json({ ok: false, error: 'Invalid Colab job id' });
        }
        const upstream = await fetchWithAbort(
          `${check.origin}/api/job/${taskId}`,
          { headers: { Accept: 'application/json' } },
          15_000
        );
        const data = await upstream.json();
        return res.status(upstream.status).json(data);
      }

      if (provider === 'hf-ltx-video') {
        const endpoint = String(req.query?.endpoint || 'text_to_video');
        const result = await pollHfLtxVideo(taskId, endpoint);
        return res.status(200).json(result);
      }

      return res.status(400).json({ ok: false, error: `Unknown provider: ${provider}` });
    }

    if (req.method === 'POST') {
      const body = await readJsonBodySafe(req, 4_500_000);
      const prompt = String(body.prompt || '').trim();
      if (!prompt) {
        return res.status(400).json({ ok: false, error: 'Prompt is required.' });
      }

      if (body.engine === 'colab-t4') {
        const check = validateColabBaseUrl(body.colabUrl);
        if (!check.ok) {
          return res.status(400).json({ ok: false, error: check.error });
        }
        const upstream = await fetchWithAbort(
          `${check.origin}/api/video`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt,
              negative_prompt: body.negativePrompt || '',
              width: body.width || 720,
              height: body.height || 480,
              duration_sec: body.durationSec || 4,
              steps: body.steps || 25,
              cfg_scale: body.cfgScale || 6.0,
              seed: body.seed ?? -1,
              model: body.model || 'cogvideox-2b',
              mode: body.mode || 't2v',
              start_frame_data_url: body.startFrameDataUrl || null,
            }),
          },
          25_000
        );
        const data = await upstream.json();
        return res.status(upstream.status).json({
          ok: upstream.ok,
          provider: 'colab-t4',
          taskId: data.job_id || data.taskId,
          status: data.status || 'queued',
          error: data.error,
        });
      }

      try {
        const submitted = await submitHfLtxVideo(body);
        return res.status(200).json(submitted);
      } catch (hfErr) {
        return res.status(200).json({
          ok: false,
          fallback: 'ken-burns-local',
          error: hfErr?.message || 'HF LTX-Video Space unavailable',
        });
      }
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    return res.status(502).json({ ok: false, error: err?.message || 'Video API error' });
  }
}
