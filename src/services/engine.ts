import type { EngineSettings, FreeImageModel, MediaShot } from '../types/studio';
import { renderLocalMotionClipFromImage } from '../utils/sequenceStitcher';

export interface ColabHealthStatus {
  online: boolean;
  gpuName?: string;
  vramTotalGb?: number;
  vramFreeGb?: number;
  models?: string[];
  error?: string;
}

export interface SeedanceKeyStatus {
  valid: boolean;
  account?: string;
  usingServerKey?: boolean;
  error?: string;
}

export interface ServerKeyCapabilities {
  gemini: boolean;
  replicate: boolean;
  fal: boolean;
}

export interface GenerationResult {
  blob: Blob;
  mimeType: string;
  providerLabel: string;
  seed: number;
  thumbnailDataUrl?: string;
  omniInteractionId?: string;
  hasSyncedAudio?: boolean;
}

const HF_FLUX_HOST = 'https://black-forest-labs-flux-1-schnell.hf.space';
const HF_FLUX_DEV_HOST = 'https://black-forest-labs-flux-1-dev.hf.space';
const HF_SD35_HOST = 'https://stabilityai-stable-diffusion-3-5-large-turbo.hf.space';
const HF_LTX_HOST = 'https://lightricks-ltx-video-distilled.hf.space';
const HF_WAN22_I2V_HOST = 'https://zerogpu-aoti-wan2-2-fp8da-aoti-faster.hf.space';
const HF_WAN22_FLF_HOST = 'https://multimodalart-wan-2-2-first-last-frame.hf.space';
const HF_MMAUDIO_HOST = 'https://hkchengrex-mmaudio.hf.space';

const WAN_DEFAULT_NEG =
  'worst quality, low quality, blurry, jittery, distorted, static, deformed hands, watermark, text, subtitles';

function dataUrlToBlob(dataUrl: string): { blob: Blob; mimeType: string } {
  const [header, b64] = dataUrl.split(',');
  const mimeMatch = /data:([^;]+);base64/.exec(header || '');
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
  const binary = atob(b64 || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return { blob: new Blob([bytes], { type: mimeType }), mimeType };
}

function blobToDataUrlFast(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Blob read failed'));
    reader.readAsDataURL(blob);
  });
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 30_000
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

async function readGradioSseComplete(
  sseUrl: string,
  timeoutMs: number,
  onHeartbeat?: () => void
): Promise<unknown> {
  const resp = await fetchWithTimeout(sseUrl, { method: 'GET' }, timeoutMs);
  if (!resp.ok) {
    throw new Error(`Gradio stream HTTP ${resp.status}`);
  }
  const reader = resp.body?.getReader();
  if (!reader) {
    throw new Error('Empty Gradio SSE body');
  }
  const decoder = new TextDecoder();
  let buffer = '';
  let eventName = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
        if (eventName === 'heartbeat' || eventName === 'generating') {
          onHeartbeat?.();
        }
      } else if (line.startsWith('data:')) {
        const raw = line.slice(5).trim();
        if (eventName === 'error') {
          throw new Error(`ZeroGPU space error: ${raw || 'quota/busy'}`);
        }
        if (eventName === 'complete') {
          return JSON.parse(raw);
        }
      }
    }
  }
  throw new Error('Gradio SSE closed before completion');
}

async function uploadBlobToGradio(
  host: string,
  blob: Blob,
  filename: string
): Promise<{
  path: string;
  url: string;
  orig_name: string;
  mime_type: string;
  is_stream: boolean;
  meta: { _type: string };
}> {
  const mimeType = blob.type || 'application/octet-stream';
  const form = new FormData();
  form.append('files', blob, filename);

  const upResp = await fetchWithTimeout(
    `${host}/gradio_api/upload`,
    { method: 'POST', body: form },
    25_000
  );
  if (!upResp.ok) throw new Error(`Gradio upload HTTP ${upResp.status}`);
  const paths = (await upResp.json()) as string[];
  if (!Array.isArray(paths) || !paths[0]) throw new Error('Gradio upload returned no path');
  return {
    path: paths[0],
    url: `${host}/gradio_api/file=${paths[0]}`,
    orig_name: filename,
    mime_type: mimeType,
    is_stream: false,
    meta: { _type: 'gradio.FileData' },
  };
}

async function uploadDataUrlToGradio(
  host: string,
  dataUrl: string,
  prefix = 'frame'
): Promise<{
  path: string;
  url: string;
  orig_name: string;
  mime_type: string;
  is_stream: boolean;
  meta: { _type: string };
}> {
  const { blob, mimeType } = dataUrlToBlob(dataUrl);
  const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
  return uploadBlobToGradio(host, blob, `${prefix}.${ext}`);
}

function extractGradioVideoUrl(parsed: unknown, host: string): string | null {
  const arr = Array.isArray(parsed) ? parsed : [parsed];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as { video?: { url?: string; path?: string }; url?: string; path?: string };
    const v = obj.video || obj;
    if (v?.url) return v.url;
    if (v?.path) return `${host}/gradio_api/file=${v.path}`;
  }
  return null;
}

// ── Free Image Generators (Browser-Direct Cascade) ────────────────────
async function generateImageViaDirectHfFlux(
  prompt: string,
  width: number,
  height: number,
  seed: number
): Promise<{ blob: Blob; mimeType: string; dataUrl: string; provider: string; seed: number }> {
  const safeW = Math.max(256, Math.min(1280, Math.round(width / 16) * 16));
  const safeH = Math.max(256, Math.min(1280, Math.round(height / 16) * 16));
  const submit = await fetchWithTimeout(
    `${HF_FLUX_HOST}/gradio_api/call/infer`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [prompt, seed, false, safeW, safeH, 4] }),
    },
    15_000
  );
  if (!submit.ok) throw new Error(`HF FLUX submit HTTP ${submit.status}`);
  const { event_id: eventId } = (await submit.json()) as { event_id?: string };
  if (!eventId) throw new Error('HF FLUX missing event_id');

  const parsed = await readGradioSseComplete(
    `${HF_FLUX_HOST}/gradio_api/call/infer/${eventId}`,
    35_000
  );
  const arr = Array.isArray(parsed) ? parsed : [];
  const imgObj = arr[0] as { url?: string; path?: string } | undefined;
  const imgUrl =
    imgObj?.url || (imgObj?.path ? `${HF_FLUX_HOST}/gradio_api/file=${imgObj.path}` : null);
  if (!imgUrl) throw new Error('HF FLUX returned no image URL');

  const imgResp = await fetchWithTimeout(imgUrl, {}, 20_000);
  if (!imgResp.ok) throw new Error(`HF FLUX image download HTTP ${imgResp.status}`);
  const blob = await imgResp.blob();
  if (blob.size < 1024) throw new Error('HF FLUX empty image blob');
  const dataUrl = await blobToDataUrlFast(blob);
  return {
    blob,
    mimeType: blob.type || 'image/webp',
    dataUrl,
    provider: 'HF FLUX.1-schnell (Direct ZeroGPU)',
    seed: typeof arr[1] === 'number' ? arr[1] : seed,
  };
}

async function generateImageViaDirectHfFluxDev(
  prompt: string,
  width: number,
  height: number,
  seed: number,
  steps = 24
): Promise<{ blob: Blob; mimeType: string; dataUrl: string; provider: string; seed: number }> {
  const safeW = Math.max(256, Math.min(1280, Math.round(width / 16) * 16));
  const safeH = Math.max(256, Math.min(1280, Math.round(height / 16) * 16));
  const safeSteps = Math.max(16, Math.min(32, Math.round(steps || 24)));
  const submit = await fetchWithTimeout(
    `${HF_FLUX_DEV_HOST}/gradio_api/call/infer`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [prompt, seed, false, safeW, safeH, 3.5, safeSteps] }),
    },
    18_000
  );
  if (!submit.ok) throw new Error(`HF FLUX.1-dev submit HTTP ${submit.status}`);
  const { event_id: eventId } = (await submit.json()) as { event_id?: string };
  if (!eventId) throw new Error('HF FLUX.1-dev missing event_id');

  const parsed = await readGradioSseComplete(
    `${HF_FLUX_DEV_HOST}/gradio_api/call/infer/${eventId}`,
    55_000
  );
  const arr = Array.isArray(parsed) ? parsed : [];
  const imgObj = arr[0] as { url?: string; path?: string } | undefined;
  const imgUrl =
    imgObj?.url || (imgObj?.path ? `${HF_FLUX_DEV_HOST}/gradio_api/file=${imgObj.path}` : null);
  if (!imgUrl) throw new Error('HF FLUX.1-dev returned no image URL');

  const imgResp = await fetchWithTimeout(imgUrl, {}, 20_000);
  if (!imgResp.ok) throw new Error(`HF FLUX.1-dev download HTTP ${imgResp.status}`);
  const blob = await imgResp.blob();
  if (blob.size < 1024) throw new Error('HF FLUX.1-dev empty image blob');
  const dataUrl = await blobToDataUrlFast(blob);
  return {
    blob,
    mimeType: blob.type || 'image/webp',
    dataUrl,
    provider: 'HF FLUX.1-dev Pro ($0 ZeroGPU)',
    seed: typeof arr[1] === 'number' ? arr[1] : seed,
  };
}

async function generateImageViaDirectHfSd35(
  prompt: string,
  negativePrompt: string,
  width: number,
  height: number,
  seed: number
): Promise<{ blob: Blob; mimeType: string; dataUrl: string; provider: string; seed: number }> {
  const safeW = Math.max(512, Math.min(1280, Math.round(width / 16) * 16));
  const safeH = Math.max(512, Math.min(1280, Math.round(height / 16) * 16));
  const submit = await fetchWithTimeout(
    `${HF_SD35_HOST}/gradio_api/call/infer`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: [prompt, negativePrompt || WAN_DEFAULT_NEG, seed, false, safeW, safeH, 1.0, 4],
      }),
    },
    18_000
  );
  if (!submit.ok) throw new Error(`HF SD 3.5 submit HTTP ${submit.status}`);
  const { event_id: eventId } = (await submit.json()) as { event_id?: string };
  if (!eventId) throw new Error('HF SD 3.5 missing event_id');

  const parsed = await readGradioSseComplete(
    `${HF_SD35_HOST}/gradio_api/call/infer/${eventId}`,
    40_000
  );
  const arr = Array.isArray(parsed) ? parsed : [];
  const imgObj = arr[0] as { url?: string; path?: string } | undefined;
  const imgUrl =
    imgObj?.url || (imgObj?.path ? `${HF_SD35_HOST}/gradio_api/file=${imgObj.path}` : null);
  if (!imgUrl) throw new Error('HF SD 3.5 returned no image URL');

  const imgResp = await fetchWithTimeout(imgUrl, {}, 20_000);
  if (!imgResp.ok) throw new Error(`HF SD 3.5 download HTTP ${imgResp.status}`);
  const blob = await imgResp.blob();
  if (blob.size < 1024) throw new Error('HF SD 3.5 empty image blob');
  const dataUrl = await blobToDataUrlFast(blob);
  return {
    blob,
    mimeType: blob.type || 'image/webp',
    dataUrl,
    provider: 'HF SD 3.5 Large Turbo ($0 ZeroGPU)',
    seed: typeof arr[1] === 'number' ? arr[1] : seed,
  };
}

/**
 * $0 Synchronized AI Video-to-Audio Foley & Sound Design powered by open-weight
 * MMAudio on Hugging Face ZeroGPU (CORS-enabled direct from browser).
 * Analyzes actual video frames + prompt and returns an MP4 muxed with synced audio.
 */
export async function synthesizeSyncedVideoAudio(
  videoBlob: Blob,
  prompt: string,
  durationSec = 5,
  seed = -1,
  onProgress?: (pct: number, phase: string) => void
): Promise<{ blob: Blob; mimeType: string }> {
  onProgress?.(92, 'Uploading clip to Free MMAudio ($0 Synced AI Foley)...');
  const ext = (videoBlob.type || '').includes('webm') ? 'webm' : 'mp4';
  const uploadedVid = await uploadBlobToGradio(HF_MMAUDIO_HOST, videoBlob, `clip.${ext}`);

  const dur = Math.max(2, Math.min(10, Number(durationSec) || 5));
  onProgress?.(95, 'Synthesizing frame-synced AI Foley & ambience ($0 MMAudio)...');
  const submit = await fetchWithTimeout(
    `${HF_MMAUDIO_HOST}/gradio_api/call/video_to_audio`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: [
          uploadedVid,
          `${prompt}, crisp realistic cinematic sound effects, atmospheric room tone, synced foley`,
          'distortion, harsh static, clipping, low quality',
          seed,
          25,
          4.5,
          dur,
        ],
      }),
    },
    20_000
  );
  if (!submit.ok) throw new Error(`MMAudio submit HTTP ${submit.status}`);
  const { event_id: eventId } = (await submit.json()) as { event_id?: string };
  if (!eventId) throw new Error('MMAudio missing event_id');

  const parsed = await readGradioSseComplete(
    `${HF_MMAUDIO_HOST}/gradio_api/call/video_to_audio/${eventId}`,
    50_000
  );
  const outUrl = extractGradioVideoUrl(parsed, HF_MMAUDIO_HOST);
  if (!outUrl) throw new Error('MMAudio completed without output video URL');

  onProgress?.(98, 'Downloading audio-synced MP4 into IndexedDB Vault...');
  const resp = await fetchWithTimeout(outUrl, {}, 25_000);
  if (!resp.ok) throw new Error(`MMAudio download HTTP ${resp.status}`);
  const outBlob = await resp.blob();
  if (outBlob.size < 4096) throw new Error('MMAudio returned empty video blob');
  return { blob: outBlob, mimeType: outBlob.type || 'video/mp4' };
}

async function generateImageViaDirectPollinations(
  prompt: string,
  width: number,
  height: number,
  seed: number,
  model: 'flux' | 'turbo'
): Promise<{ blob: Blob; mimeType: string; dataUrl: string; provider: string; seed: number }> {
  const safeW = Math.max(256, Math.min(1280, Math.round(width / 16) * 16));
  const safeH = Math.max(256, Math.min(1280, Math.round(height / 16) * 16));
  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
    `?width=${safeW}&height=${safeH}&seed=${seed}&model=${model}&nologo=true&enhance=false`;

  const resp = await fetchWithTimeout(url, { mode: 'cors' }, 20_000);
  if (!resp.ok) throw new Error(`Pollinations HTTP ${resp.status}`);
  const ctype = resp.headers.get('content-type') || '';
  if (!ctype.startsWith('image/')) throw new Error(`Pollinations non-image: ${ctype}`);
  const blob = await resp.blob();
  if (blob.size < 1024) throw new Error('Pollinations empty image');
  const dataUrl = await blobToDataUrlFast(blob);
  return {
    blob,
    mimeType: blob.type || 'image/jpeg',
    dataUrl,
    provider: `Pollinations ${model.toUpperCase()} (Direct)`,
    seed,
  };
}

async function generateImageViaServerApi(
  prompt: string,
  width: number,
  height: number,
  seed: number,
  model: 'flux' | 'turbo'
): Promise<{ dataUrl: string; blob: Blob; mimeType: string; provider: string; seed: number }> {
  const resp = await fetchWithTimeout(
    '/api/image',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, width, height, seed, model }),
    },
    40_000
  );
  const data = await resp.json();
  if (!resp.ok || !data?.ok || !data?.dataUrl) {
    throw new Error(data?.error || `Image API error (HTTP ${resp.status})`);
  }
  const { blob, mimeType } = dataUrlToBlob(data.dataUrl);
  return {
    dataUrl: data.dataUrl,
    blob,
    mimeType,
    provider: data.provider || 'Cloud FLUX',
    seed: typeof data.seed === 'number' ? data.seed : seed,
  };
}

async function generateFreeImageCascade(
  prompt: string,
  width: number,
  height: number,
  seed: number,
  model: FreeImageModel,
  onProgress: (pct: number, phase: string) => void,
  negativePrompt = '',
  steps = 24
): Promise<{ dataUrl: string; blob: Blob; mimeType: string; provider: string; seed: number }> {
  const errors: string[] = [];
  const pollFallbackModel: 'flux' | 'turbo' = model === 'turbo' ? 'turbo' : 'flux';

  if (model === 'flux-dev') {
    try {
      onProgress(22, 'Rendering Cinema Pro still via HF FLUX.1-dev ($0 ZeroGPU)...');
      return await generateImageViaDirectHfFluxDev(prompt, width, height, seed, steps);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : 'HF FLUX.1-dev failed');
    }
    try {
      onProgress(52, 'Switching to HF FLUX.1-schnell ZeroGPU...');
      return await generateImageViaDirectHfFlux(prompt, width, height, seed);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : 'HF FLUX.1-schnell failed');
    }
  } else if (model === 'sd35-turbo') {
    try {
      onProgress(22, 'Rendering HD still via Stability SD 3.5 Large Turbo ($0 ZeroGPU)...');
      return await generateImageViaDirectHfSd35(prompt, negativePrompt, width, height, seed);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : 'HF SD 3.5 failed');
    }
    try {
      onProgress(52, 'Switching to HF FLUX.1-schnell ZeroGPU...');
      return await generateImageViaDirectHfFlux(prompt, width, height, seed);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : 'HF FLUX.1-schnell failed');
    }
  } else if (model === 'turbo') {
    try {
      onProgress(25, 'Rendering fast keyframe via Pollinations Turbo...');
      return await generateImageViaDirectPollinations(prompt, width, height, seed, 'turbo');
    } catch (e) {
      errors.push(e instanceof Error ? e.message : 'Pollinations turbo failed');
    }
    try {
      onProgress(55, 'Switching to HF FLUX.1-schnell ZeroGPU...');
      return await generateImageViaDirectHfFlux(prompt, width, height, seed);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : 'HF FLUX failed');
    }
  } else {
    try {
      onProgress(25, 'Rendering HD keyframe via HF FLUX.1-schnell ZeroGPU...');
      return await generateImageViaDirectHfFlux(prompt, width, height, seed);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : 'HF FLUX failed');
    }
    try {
      onProgress(55, 'Switching to Pollinations FLUX...');
      return await generateImageViaDirectPollinations(prompt, width, height, seed, 'flux');
    } catch (e) {
      errors.push(e instanceof Error ? e.message : 'Pollinations flux failed');
    }
  }

  try {
    onProgress(70, 'Switching to Pollinations FLUX backup...');
    return await generateImageViaDirectPollinations(prompt, width, height, seed, pollFallbackModel);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : 'Pollinations backup failed');
  }

  try {
    onProgress(82, 'Trying Vercel /api/image backup relay...');
    return await generateImageViaServerApi(prompt, width, height, seed, pollFallbackModel);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : 'Server API failed');
  }

  throw new Error(`All $0 image providers failed (${errors.join(' | ')})`);
}

// ── Multi-Space $0 AI Video Cascade (Wan 2.2 14B FLF -> Wan 2.2 14B FP8 -> LTX-Video) ──
async function generateVideoViaWan22FirstLastFrame(
  shot: MediaShot,
  startFrame: string,
  endFrame: string,
  onProgress: (pct: number, phase: string) => void
): Promise<GenerationResult> {
  onProgress(20, 'Uploading Start & End frames to Free Wan 2.2 14B (ZeroGPU)...');
  const [startFile, endFile] = await Promise.all([
    uploadDataUrlToGradio(HF_WAN22_FLF_HOST, startFrame, 'start'),
    uploadDataUrlToGradio(HF_WAN22_FLF_HOST, endFrame, 'end'),
  ]);

  onProgress(35, 'Morphing Start → End Frame on Wan 2.2 14B ($0 ZeroGPU)...');
  const dur = Math.max(2.1, Math.min(5.0, shot.durationSec || 3.5));
  const submit = await fetchWithTimeout(
    `${HF_WAN22_FLF_HOST}/gradio_api/call/generate_video`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: [
          startFile,
          endFile,
          shot.compiledPrompt,
          shot.negativePrompt || WAN_DEFAULT_NEG,
          dur,
          6,
          1.0,
          1.0,
          shot.seed,
          false,
        ],
      }),
    },
    20_000
  );
  if (!submit.ok) throw new Error(`Wan 2.2 FLF submit HTTP ${submit.status}`);
  const { event_id: eventId } = (await submit.json()) as { event_id?: string };
  if (!eventId) throw new Error('Wan 2.2 FLF missing event_id');

  let tick = 42;
  const parsed = await readGradioSseComplete(
    `${HF_WAN22_FLF_HOST}/gradio_api/call/generate_video/${eventId}`,
    90_000,
    () => {
      tick = Math.min(88, tick + 6);
      onProgress(tick, 'Diffusing Wan 2.2 14B First→Last Frame ($0 ZeroGPU)...');
    }
  );
  const videoUrl = extractGradioVideoUrl(parsed, HF_WAN22_FLF_HOST);
  if (!videoUrl) throw new Error('Wan 2.2 FLF returned no video URL');

  onProgress(94, 'Caching Wan 2.2 MP4 into IndexedDB Vault...');
  const vidResp = await fetchWithTimeout(videoUrl, {}, 30_000);
  if (!vidResp.ok) throw new Error(`Wan 2.2 FLF MP4 HTTP ${vidResp.status}`);
  const blob = await vidResp.blob();
  return {
    blob,
    mimeType: blob.type || 'video/mp4',
    providerLabel: 'Wan 2.2 14B First→Last ($0 ZeroGPU)',
    seed: shot.seed,
    thumbnailDataUrl: startFrame,
  };
}

async function generateVideoViaWan22Fast(
  shot: MediaShot,
  keyframeDataUrl: string,
  onProgress: (pct: number, phase: string) => void
): Promise<GenerationResult> {
  onProgress(28, 'Uploading keyframe to Free Wan 2.2 14B FP8 Lightning...');
  const imgFile = await uploadDataUrlToGradio(HF_WAN22_I2V_HOST, keyframeDataUrl, 'start');
  const dur = Math.max(2.0, Math.min(5.0, shot.durationSec || 3.5));

  onProgress(40, 'Diffusing Wan 2.2 14B FP8 6-step video ($0 ZeroGPU)...');
  const submit = await fetchWithTimeout(
    `${HF_WAN22_I2V_HOST}/gradio_api/call/generate_video`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: [
          imgFile,
          shot.compiledPrompt,
          6,
          shot.negativePrompt || WAN_DEFAULT_NEG,
          dur,
          1,
          1,
          shot.seed,
          false,
        ],
      }),
    },
    20_000
  );
  if (!submit.ok) throw new Error(`Wan 2.2 FP8 submit HTTP ${submit.status}`);
  const { event_id: eventId } = (await submit.json()) as { event_id?: string };
  if (!eventId) throw new Error('Wan 2.2 FP8 missing event_id');

  let tick = 48;
  const parsed = await readGradioSseComplete(
    `${HF_WAN22_I2V_HOST}/gradio_api/call/generate_video/${eventId}`,
    90_000,
    () => {
      tick = Math.min(88, tick + 6);
      onProgress(tick, 'Diffusing Wan 2.2 14B cinema frames ($0 ZeroGPU)...');
    }
  );
  const videoUrl = extractGradioVideoUrl(parsed, HF_WAN22_I2V_HOST);
  if (!videoUrl) throw new Error('Wan 2.2 FP8 returned no video URL');

  onProgress(94, 'Caching Wan 2.2 14B MP4 into IndexedDB Vault...');
  const vidResp = await fetchWithTimeout(videoUrl, {}, 30_000);
  if (!vidResp.ok) throw new Error(`Wan 2.2 FP8 MP4 HTTP ${vidResp.status}`);
  const blob = await vidResp.blob();
  return {
    blob,
    mimeType: blob.type || 'video/mp4',
    providerLabel: 'Wan 2.2 14B FP8 ($0 ZeroGPU)',
    seed: shot.seed,
    thumbnailDataUrl: keyframeDataUrl,
  };
}

async function generateVideoViaDirectHfLtx(
  shot: MediaShot,
  onProgress: (pct: number, phase: string) => void
): Promise<GenerationResult> {
  const isI2V =
    shot.mode === 'i2v' &&
    typeof shot.startFrameDataUrl === 'string' &&
    shot.startFrameDataUrl.startsWith('data:image/');

  let uploadedImage = null;
  if (isI2V && shot.startFrameDataUrl) {
    onProgress(52, 'Uploading Start Frame to HF LTX-Video ZeroGPU...');
    uploadedImage = await uploadDataUrlToGradio(HF_LTX_HOST, shot.startFrameDataUrl, 'start');
  }

  const endpoint = isI2V ? 'image_to_video' : 'text_to_video';
  const width = Math.max(384, Math.min(768, Math.round(shot.width / 32) * 32));
  const height = Math.max(384, Math.min(768, Math.round(shot.height / 32) * 32));
  const durationSec = Math.max(2, Math.min(5, Math.round(shot.durationSec || 3)));

  onProgress(58, `Diffusing AI video on HF LTX-Video ZeroGPU (${isI2V ? 'I2V' : 'T2V'})...`);
  const submit = await fetchWithTimeout(
    `${HF_LTX_HOST}/gradio_api/call/${endpoint}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: [
          shot.compiledPrompt,
          shot.negativePrompt || WAN_DEFAULT_NEG,
          uploadedImage,
          null,
          height,
          width,
          isI2V ? 'image-to-video' : 'text-to-video',
          durationSec,
          9,
          shot.seed,
          false,
          1,
          true,
        ],
      }),
    },
    20_000
  );
  if (!submit.ok) throw new Error(`LTX submit HTTP ${submit.status}`);
  const { event_id: eventId } = (await submit.json()) as { event_id?: string };
  if (!eventId) throw new Error('LTX missing event_id');

  let tick = 64;
  const parsed = await readGradioSseComplete(
    `${HF_LTX_HOST}/gradio_api/call/${endpoint}/${eventId}`,
    75_000,
    () => {
      tick = Math.min(88, tick + 5);
      onProgress(tick, 'Diffusing motion frames on HF LTX-Video ZeroGPU...');
    }
  );

  const videoUrl = extractGradioVideoUrl(parsed, HF_LTX_HOST);
  if (!videoUrl) throw new Error('LTX completed without video URL');

  onProgress(93, 'Downloading LTX-Video MP4 into local Vault...');
  const vidResp = await fetchWithTimeout(videoUrl, {}, 30_000);
  if (!vidResp.ok) throw new Error(`LTX MP4 download HTTP ${vidResp.status}`);
  const blob = await vidResp.blob();
  if (blob.size < 2048) throw new Error('LTX returned empty video');

  return {
    blob,
    mimeType: blob.type || 'video/mp4',
    providerLabel: `HF LTX-Video ($0 ZeroGPU ${isI2V ? 'I2V' : 'T2V'})`,
    seed: shot.seed,
    thumbnailDataUrl: shot.startFrameDataUrl,
  };
}

// ── Public Service API ────────────────────────────────────────────────
export async function fetchServerCapabilities(): Promise<ServerKeyCapabilities> {
  try {
    const resp = await fetchWithTimeout('/api/health', {}, 8_000);
    if (!resp.ok) return { gemini: false, replicate: false, fal: false };
    const data = await resp.json();
    return {
      gemini: Boolean(data?.serverKeys?.gemini),
      replicate: Boolean(data?.serverKeys?.replicate),
      fal: Boolean(data?.serverKeys?.fal),
    };
  } catch {
    return { gemini: false, replicate: false, fal: false };
  }
}

export async function verifyGeminiOmniApiKey(apiKey: string): Promise<SeedanceKeyStatus> {
  const cleaned = apiKey.trim();
  try {
    const resp = await fetchWithTimeout(
      '/api/omni',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', apiKey: cleaned }),
      },
      15_000
    );
    const data = await resp.json();
    if (!resp.ok || !data?.ok) {
      return { valid: false, error: data?.error || `HTTP ${resp.status}` };
    }
    return {
      valid: true,
      usingServerKey: Boolean(data.usingServerKey),
      account: data.model || 'gemini-omni-1.2-flash',
    };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : 'Verification failed' };
  }
}

export async function verifySeedanceApiKey(
  provider: 'replicate' | 'fal',
  apiKey: string
): Promise<SeedanceKeyStatus> {
  const cleaned = apiKey.trim();
  try {
    const resp = await fetchWithTimeout(
      '/api/seedance',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', provider, apiKey: cleaned }),
      },
      15_000
    );
    const data = await resp.json();
    if (!resp.ok || !data?.ok) {
      return { valid: false, error: data?.error || `HTTP ${resp.status}` };
    }
    return {
      valid: true,
      usingServerKey: Boolean(data.usingServerKey),
      account: data.account || 'Verified',
    };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : 'Verification failed' };
  }
}

export async function pingColabBackend(colabUrl: string): Promise<ColabHealthStatus> {
  const cleaned = colabUrl.trim().replace(/\/+$/, '');
  if (!cleaned) {
    return { online: false, error: 'Enter your https://*.trycloudflare.com Colab tunnel URL first.' };
  }
  try {
    const resp = await fetchWithTimeout(
      `/api/proxy?colabUrl=${encodeURIComponent(cleaned)}&path=%2Fapi%2Fhealth`,
      {},
      15_000
    );
    const data = await resp.json();
    if (!resp.ok || !data?.ok) {
      return { online: false, error: data?.error || `HTTP ${resp.status}` };
    }
    return {
      online: true,
      gpuName: data.gpu_name || 'NVIDIA T4',
      vramTotalGb: data.vram_total_gb,
      vramFreeGb: data.vram_free_gb,
      models: data.models || ['sdxl-turbo', 'sdxl-base', 'cogvideox-2b', 'ltx-video'],
    };
  } catch (err) {
    return { online: false, error: err instanceof Error ? err.message : 'Connection failed' };
  }
}

export async function runImageGeneration(
  shot: MediaShot,
  settings: EngineSettings,
  onProgress: (pct: number, phase: string) => void
): Promise<GenerationResult> {
  const useColab = settings.activeEngine === 'colab-t4' && settings.colabUrl.trim().length > 0;

  if (useColab) {
    onProgress(18, `Sending keyframe to Colab T4 (${settings.colabModelImage})...`);
    const resp = await fetchWithTimeout(
      '/api/proxy',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          colabUrl: settings.colabUrl.trim().replace(/\/+$/, ''),
          path: '/api/image',
          method: 'POST',
          payload: {
            prompt: shot.compiledPrompt,
            negative_prompt: shot.negativePrompt,
            width: shot.width,
            height: shot.height,
            steps: shot.steps,
            cfg_scale: shot.cfgScale,
            seed: shot.seed,
            model: settings.colabModelImage,
          },
        }),
      },
      55_000
    );
    const data = await resp.json();
    if (!resp.ok || !data?.ok || !data?.data_url) {
      throw new Error(data?.error || `Colab T4 image error (HTTP ${resp.status})`);
    }
    onProgress(92, 'Saving Colab T4 keyframe into local IndexedDB vault...');
    const { blob, mimeType } = dataUrlToBlob(data.data_url);
    return {
      blob,
      mimeType,
      providerLabel: `Colab T4 (${settings.colabModelImage})`,
      seed: typeof data.seed === 'number' ? data.seed : shot.seed,
      thumbnailDataUrl: data.data_url,
    };
  }

  const result = await generateFreeImageCascade(
    shot.compiledPrompt,
    shot.width,
    shot.height,
    shot.seed,
    settings.freeImageModel,
    onProgress,
    shot.negativePrompt,
    shot.steps
  );
  onProgress(96, 'Caching permanently in IndexedDB Vault...');
  return {
    blob: result.blob,
    mimeType: result.mimeType,
    providerLabel: result.provider,
    seed: result.seed,
    thumbnailDataUrl: result.dataUrl,
  };
}

export async function runVideoGeneration(
  shot: MediaShot,
  settings: EngineSettings,
  onProgress: (pct: number, phase: string) => void
): Promise<GenerationResult> {
  // Engine 3: Official Google Gemini Omni 1.2 Flash (3s–15s, 360p–4K, First/Last Frame, R2V, Turn Edit/Extend)
  if (settings.activeEngine === 'gemini-omni' || shot.previousOmniInteractionId) {
    const apiKey = settings.geminiApiKey.trim();
    onProgress(
      12,
      shot.previousOmniInteractionId
        ? `Chaining Gemini Omni 1.2 Flash turn (${shot.omniTurnAction || 'edit'})...`
        : `Submitting to Gemini Omni 1.2 Flash (${settings.omniResolution})...`
    );

    const submitResp = await fetchWithTimeout(
      '/api/omni',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit',
          apiKey,
          mode: shot.mode,
          prompt: shot.compiledPrompt,
          aspectRatio: shot.aspectRatio,
          durationSec: shot.durationSec,
          resolution: settings.omniResolution,
          startFrameDataUrl: shot.startFrameDataUrl,
          endFrameDataUrl: shot.endFrameDataUrl,
          referenceImages: shot.referenceImages,
          previousInteractionId: shot.previousOmniInteractionId,
          omniTurnAction: shot.omniTurnAction,
        }),
      },
      45_000
    );
    const submitData = await submitResp.json();

    if (submitData?.billingRequired && !shot.previousOmniInteractionId) {
      onProgress(18, 'Gemini API billing required — auto-falling back to $0 Wan 2.2 14B Cascade...');
    } else if (!submitResp.ok || !submitData?.ok || !submitData?.interactionId) {
      throw new Error(
        submitData?.error || `Gemini Omni 1.2 Flash error (HTTP ${submitResp.status})`
      );
    } else {
      const interactionId = String(submitData.interactionId);
      let videoUri: string | null = submitData.videoUri || null;

      if (!videoUri) {
        for (let attempt = 0; attempt < 180; attempt++) {
          await new Promise((r) => setTimeout(r, 3500));
          const pollResp = await fetchWithTimeout(
            '/api/omni',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'poll', apiKey, interactionId }),
            },
            20_000
          );
          const poll = await pollResp.json();
          if (poll.status === 'failed') {
            throw new Error(poll.error || 'Gemini Omni 1.2 Flash generation failed');
          }
          onProgress(
            Math.min(92, Math.max(20, Number(poll.progress) || 22 + attempt * 2)),
            poll.phase || 'Rendering video + audio on Gemini Omni 1.2 Flash...'
          );
          if (poll.status === 'completed' && poll.videoUri) {
            videoUri = poll.videoUri;
            break;
          }
        }
      }

      if (!videoUri) {
        throw new Error('Gemini Omni 1.2 Flash timed out waiting for output video.');
      }

      onProgress(95, 'Saving Gemini Omni 1.2 Flash MP4 permanently into local Vault...');
      const dlResp = await fetchWithTimeout(
        '/api/omni',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'download', apiKey, videoUri }),
        },
        55_000
      );
      if (!dlResp.ok) throw new Error(`Gemini Omni MP4 download HTTP ${dlResp.status}`);
      const blob = await dlResp.blob();
      return {
        blob,
        mimeType: blob.type || 'video/mp4',
        providerLabel: `Gemini Omni 1.2 Flash (${settings.omniResolution} · Audio)`,
        seed: shot.seed,
        thumbnailDataUrl: shot.startFrameDataUrl,
        omniInteractionId: interactionId,
      };
    }
  }

  // Engine 4: Official ByteDance Seedance (Latest 2.5 / 2.0 / 1.5 Pro) — with automatic $0 fallback on HTTP 402!
  if (settings.activeEngine === 'seedance-byok') {
    const apiKey = settings.seedanceApiKey.trim();
    const provider = settings.seedanceProvider;
    const model =
      settings.seedanceModel ||
      (provider === 'replicate'
        ? 'bytedance/seedance-2.5'
        : 'bytedance/seedance-2.5/text-to-video');
    onProgress(10, `Submitting ${shot.mode.toUpperCase()} to Seedance (${provider})...`);

    const submitResp = await fetchWithTimeout(
      '/api/seedance',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit',
          provider,
          apiKey,
          model,
          mode: shot.mode,
          prompt: shot.compiledPrompt,
          aspectRatio: shot.aspectRatio,
          durationSec: shot.durationSec,
          resolution: settings.seedanceResolution,
          generateAudio: settings.seedanceAudio,
          seed: shot.seed,
          startFrameDataUrl: shot.startFrameDataUrl,
          endFrameDataUrl: shot.endFrameDataUrl,
        }),
      },
      25_000
    );
    const submitData = await submitResp.json();

    // If Replicate/fal returns HTTP 402 (no paid credits), gracefully auto-fallback to $0 Wan 2.2 Cascade!
    if (submitResp.status === 402) {
      onProgress(15, 'Seedance billing credit empty — auto-falling back to $0 Wan 2.2 14B Cascade...');
    } else if (!submitResp.ok || !submitData?.ok || !submitData?.pollUrl) {
      throw new Error(submitData?.error || `Seedance submit failed (HTTP ${submitResp.status})`);
    } else {
      for (let attempt = 0; attempt < 150; attempt++) {
        await new Promise((r) => setTimeout(r, 3000));
        const pollResp = await fetchWithTimeout(
          '/api/seedance',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'poll',
              provider,
              apiKey,
              pollUrl: submitData.pollUrl,
              responseUrl: submitData.responseUrl,
            }),
          },
          20_000
        );
        const poll = await pollResp.json();
        if (poll.status === 'failed') {
          throw new Error(poll.error || 'Seedance generation failed');
        }
        onProgress(
          Math.min(92, Math.max(18, Number(poll.progress) || 20 + attempt * 2)),
          poll.phase || 'Diffusing cinema video on Seedance...'
        );
        if (poll.status === 'completed' && poll.videoUrl) {
          onProgress(95, 'Saving Seedance MP4 permanently into local IndexedDB Vault...');
          const dlResp = await fetchWithTimeout(
            '/api/seedance',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'download', videoUrl: poll.videoUrl }),
            },
            45_000
          );
          if (!dlResp.ok) throw new Error(`Seedance MP4 download HTTP ${dlResp.status}`);
          const blob = await dlResp.blob();
          const shortModel = model.replace(/^fal-ai\//, '').replace(/^bytedance\//, '');
          return {
            blob,
            mimeType: blob.type || 'video/mp4',
            providerLabel: `Seedance (${shortModel} · ${settings.seedanceResolution}${
              settings.seedanceAudio ? ' + Audio' : ''
            })`,
            seed: shot.seed,
            thumbnailDataUrl: shot.startFrameDataUrl,
          };
        }
      }
      throw new Error('Seedance render timed out after 7.5 minutes.');
    }
  }

  const useColab = settings.activeEngine === 'colab-t4' && settings.colabUrl.trim().length > 0;
  if (useColab) {
    const colabUrl = settings.colabUrl.trim().replace(/\/+$/, '');
    onProgress(10, `Submitting ${shot.mode.toUpperCase()} to Colab T4 (${settings.colabModelVideo})...`);
    const submitResp = await fetchWithTimeout(
      '/api/video',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engine: 'colab-t4',
          colabUrl,
          prompt: shot.compiledPrompt,
          negativePrompt: shot.negativePrompt,
          width: shot.width,
          height: shot.height,
          durationSec: shot.durationSec,
          steps: shot.steps,
          cfgScale: shot.cfgScale,
          seed: shot.seed,
          model: settings.colabModelVideo,
          mode: shot.mode,
          startFrameDataUrl: shot.startFrameDataUrl,
        }),
      },
      25_000
    );
    const submitData = await submitResp.json();
    if (!submitResp.ok || !submitData?.ok || !submitData?.taskId) {
      throw new Error(submitData?.error || 'Failed to queue job on Colab T4');
    }

    const taskId = submitData.taskId;
    for (let attempt = 0; attempt < 180; attempt++) {
      await new Promise((r) => setTimeout(r, 3000));
      const pollResp = await fetchWithTimeout(
        `/api/video?provider=colab-t4&taskId=${encodeURIComponent(taskId)}&colabUrl=${encodeURIComponent(
          colabUrl
        )}`,
        {},
        15_000
      );
      const poll = await pollResp.json();
      if (poll.status === 'failed') {
        throw new Error(poll.error || 'Colab T4 render failed');
      }
      onProgress(
        Math.min(92, Math.max(15, Number(poll.progress) || 20 + attempt * 2)),
        poll.phase || 'Diffusing frames on NVIDIA T4 16 GB...'
      );
      if (poll.status === 'completed' && poll.output_path) {
        onProgress(95, 'Downloading MP4 from Colab T4 into local Vault...');
        const fileResp = await fetchWithTimeout(
          `/api/proxy?colabUrl=${encodeURIComponent(colabUrl)}&path=${encodeURIComponent(
            poll.output_path
          )}`,
          {},
          45_000
        );
        if (!fileResp.ok) throw new Error(`Failed to fetch Colab output: HTTP ${fileResp.status}`);
        const blob = await fileResp.blob();
        return {
          blob,
          mimeType: blob.type || 'video/mp4',
          providerLabel: `Colab T4 (${settings.colabModelVideo})`,
          seed: shot.seed,
          thumbnailDataUrl: shot.startFrameDataUrl,
        };
      }
    }
    throw new Error('Colab T4 video render timed out after 9 minutes.');
  }

  const attachFreeSyncedAudioIfEnabled = async (
    base: GenerationResult
  ): Promise<GenerationResult> => {
    if (!settings.freeAutoAudio) return base;
    try {
      const synced = await synthesizeSyncedVideoAudio(
        base.blob,
        shot.rawPrompt || shot.compiledPrompt,
        shot.durationSec,
        base.seed,
        onProgress
      );
      return {
        ...base,
        blob: synced.blob,
        mimeType: synced.mimeType,
        providerLabel: `${base.providerLabel} + MMAudio Foley`,
        hasSyncedAudio: true,
      };
    } catch {
      // Never fail a completed video if MMAudio ZeroGPU queue is busy; user can still click Sync Foley in Lightbox
      return base;
    }
  };

  // Engine 1: Multi-Space $0 AI Video Cascade (Wan 2.2 14B FLF -> Wan 2.2 14B FP8 -> LTX-Video -> Director Cinema Motion) + Free MMAudio Synced Foley
  let keyframeDataUrl = shot.startFrameDataUrl;
  let actualSeed = shot.seed;

  if (settings.freeVideoFallback === 'hf-ltx-space') {
    // Path A: Both Start Frame & End Frame provided -> Free Wan 2.2 14B First-to-Last Frame Morph!
    if (keyframeDataUrl && shot.endFrameDataUrl) {
      try {
        const res = await generateVideoViaWan22FirstLastFrame(
          shot,
          keyframeDataUrl,
          shot.endFrameDataUrl,
          onProgress
        );
        return await attachFreeSyncedAudioIfEnabled(res);
      } catch {
        // Fall through to Wan 2.2 FP8 single-frame
      }
    }

    // Path B: Ensure crisp $0 HD keyframe exists, then animate via Wan 2.2 14B FP8 Lightning (closest $0 quality to Seedance!)
    if (!keyframeDataUrl) {
      try {
        onProgress(14, 'Stage 1/2: Generating $0 FLUX keyframe for Wan 2.2 14B...');
        const still = await generateFreeImageCascade(
          shot.compiledPrompt,
          shot.width >= shot.height ? 1024 : 576,
          shot.width >= shot.height ? 576 : 1024,
          shot.seed,
          settings.freeImageModel,
          onProgress,
          shot.negativePrompt,
          shot.steps
        );
        keyframeDataUrl = still.dataUrl;
        actualSeed = still.seed;
      } catch {
        // Try pure LTX T2V if keyframe failed
      }
    }

    if (keyframeDataUrl) {
      try {
        const res = await generateVideoViaWan22Fast(shot, keyframeDataUrl, onProgress);
        return await attachFreeSyncedAudioIfEnabled(res);
      } catch {
        // Cascade to HF LTX-Video Distilled
      }
    }

    try {
      const res = await generateVideoViaDirectHfLtx(shot, onProgress);
      return await attachFreeSyncedAudioIfEnabled(res);
    } catch {
      // Guaranteed zero-wait fallback below
    }
  }

  // Guaranteed $0 zero-wait fallback: Keyframe + Director-Aware Camera Motion + End-Frame Morph
  if (!keyframeDataUrl) {
    onProgress(35, 'Generating $0 HD Keyframe (Stage 1/2)...');
    const still = await generateFreeImageCascade(
      shot.compiledPrompt,
      shot.width >= shot.height ? 1024 : 576,
      shot.width >= shot.height ? 576 : 1024,
      shot.seed,
      settings.freeImageModel,
      onProgress,
      shot.negativePrompt,
      shot.steps
    );
    keyframeDataUrl = still.dataUrl;
    actualSeed = still.seed;
  }

  onProgress(76, 'Synthesizing Director-Aware cinema camera motion in-browser (Stage 2/2)...');
  const motionBlob = await renderLocalMotionClipFromImage(
    keyframeDataUrl,
    shot.width,
    shot.height,
    Math.min(Math.max(shot.durationSec, 2), 6),
    shot.rawPrompt,
    shot.endFrameDataUrl
  );
  onProgress(90, 'Saving video clip into IndexedDB Vault...');
  return await attachFreeSyncedAudioIfEnabled({
    blob: motionBlob,
    mimeType: motionBlob.type || 'video/webm',
    providerLabel: 'Director Cinema Motion ($0 Fallback · ZeroGPU Busy)',
    seed: actualSeed,
    thumbnailDataUrl: keyframeDataUrl,
  });
}
