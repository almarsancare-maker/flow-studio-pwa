import type { EngineSettings, MediaShot } from '../types/studio';
import { renderLocalMotionClipFromImage } from '../utils/sequenceStitcher';

export interface ColabHealthStatus {
  online: boolean;
  gpuName?: string;
  vramTotalGb?: number;
  vramFreeGb?: number;
  models?: string[];
  error?: string;
}

export interface GenerationResult {
  blob: Blob;
  mimeType: string;
  providerLabel: string;
  seed: number;
  thumbnailDataUrl?: string;
}

const HF_FLUX_HOST = 'https://black-forest-labs-flux-1-schnell.hf.space';
const HF_LTX_HOST = 'https://lightricks-ltx-video-distilled.hf.space';

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

/**
 * Browser-direct HF FLUX.1-schnell (uses the user's own clean ZeroGPU quota, bypassing Vercel shared-IP limits).
 */
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

/**
 * Browser-direct Pollinations image generation (CORS Access-Control-Allow-Origin: *).
 */
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

/**
 * Server fallback via Vercel /api/image (in case browser extensions block third-party domains).
 */
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
  model: 'flux' | 'turbo',
  onProgress: (pct: number, phase: string) => void
): Promise<{ dataUrl: string; blob: Blob; mimeType: string; provider: string; seed: number }> {
  const errors: string[] = [];

  if (model === 'turbo') {
    try {
      onProgress(25, 'Rendering fast keyframe via Pollinations Turbo (Direct)...');
      return await generateImageViaDirectPollinations(prompt, width, height, seed, 'turbo');
    } catch (e) {
      errors.push(e instanceof Error ? e.message : 'Pollinations turbo failed');
    }
    try {
      onProgress(55, 'Switching to HF FLUX.1-schnell ZeroGPU (Direct)...');
      return await generateImageViaDirectHfFlux(prompt, width, height, seed);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : 'HF FLUX failed');
    }
  } else {
    try {
      onProgress(25, 'Rendering HD keyframe via HF FLUX.1-schnell ZeroGPU (Direct)...');
      return await generateImageViaDirectHfFlux(prompt, width, height, seed);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : 'HF FLUX failed');
    }
    try {
      onProgress(55, 'Switching to Pollinations FLUX (Direct)...');
      return await generateImageViaDirectPollinations(prompt, width, height, seed, 'flux');
    } catch (e) {
      errors.push(e instanceof Error ? e.message : 'Pollinations flux failed');
    }
  }

  try {
    onProgress(78, 'Trying Vercel /api/image backup relay...');
    return await generateImageViaServerApi(prompt, width, height, seed, model);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : 'Server API failed');
  }

  throw new Error(`All $0 image providers failed (${errors.join(' | ')})`);
}

/**
 * Browser-direct HF Lightricks/ltx-video-distilled (real AI-diffused MP4 in ~8-15s on user's clean ZeroGPU IP!).
 */
async function generateVideoViaDirectHfLtx(
  shot: MediaShot,
  onProgress: (pct: number, phase: string) => void
): Promise<GenerationResult> {
  const isI2V =
    shot.mode === 'i2v' &&
    typeof shot.startFrameDataUrl === 'string' &&
    shot.startFrameDataUrl.startsWith('data:image/');

  let uploadedImage: { path: string; meta: { _type: string } } | null = null;
  if (isI2V && shot.startFrameDataUrl) {
    onProgress(16, 'Uploading Start Frame to HF LTX-Video ZeroGPU...');
    const { blob, mimeType } = dataUrlToBlob(shot.startFrameDataUrl);
    const ext = mimeType.includes('png') ? 'png' : 'jpg';
    const form = new FormData();
    form.append('files', blob, `start_frame.${ext}`);
    const upResp = await fetchWithTimeout(
      `${HF_LTX_HOST}/gradio_api/upload`,
      { method: 'POST', body: form },
      20_000
    );
    if (!upResp.ok) throw new Error(`LTX upload HTTP ${upResp.status}`);
    const paths = (await upResp.json()) as string[];
    if (!Array.isArray(paths) || !paths[0]) throw new Error('LTX upload returned no file path');
    uploadedImage = { path: paths[0], meta: { _type: 'gradio.FileData' } };
  }

  const endpoint = isI2V ? 'image_to_video' : 'text_to_video';
  const width = Math.max(384, Math.min(768, Math.round(shot.width / 32) * 32));
  const height = Math.max(384, Math.min(768, Math.round(shot.height / 32) * 32));
  const durationSec = Math.max(2, Math.min(5, Math.round(shot.durationSec || 3)));

  onProgress(28, `Diffusing AI video on HF LTX-Video ZeroGPU (${isI2V ? 'I2V' : 'T2V'})...`);
  const submit = await fetchWithTimeout(
    `${HF_LTX_HOST}/gradio_api/call/${endpoint}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: [
          shot.compiledPrompt,
          shot.negativePrompt || 'worst quality, inconsistent motion, blurry, jittery, distorted',
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

  let tick = 35;
  const parsed = await readGradioSseComplete(
    `${HF_LTX_HOST}/gradio_api/call/${endpoint}/${eventId}`,
    75_000,
    () => {
      tick = Math.min(86, tick + 6);
      onProgress(tick, 'Diffusing motion frames on HF LTX-Video ZeroGPU...');
    }
  );

  const arr = Array.isArray(parsed) ? parsed : [];
  const first = arr[0] as { video?: { url?: string; path?: string }; url?: string; path?: string } | undefined;
  const vidObj = first?.video || first;
  const videoUrl =
    vidObj?.url || (vidObj?.path ? `${HF_LTX_HOST}/gradio_api/file=${vidObj.path}` : null);
  if (!videoUrl) throw new Error('LTX completed without video URL');

  onProgress(92, 'Downloading AI-diffused MP4 into local Vault...');
  const vidResp = await fetchWithTimeout(videoUrl, {}, 30_000);
  if (!vidResp.ok) throw new Error(`LTX MP4 download HTTP ${vidResp.status}`);
  const blob = await vidResp.blob();
  if (blob.size < 2048) throw new Error('LTX returned empty video');

  return {
    blob,
    mimeType: blob.type || 'video/mp4',
    providerLabel: `HF LTX-Video ZeroGPU (${isI2V ? 'I2V' : 'T2V'})`,
    seed: typeof arr[1] === 'number' ? arr[1] : shot.seed,
    thumbnailDataUrl: shot.startFrameDataUrl,
  };
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
    onProgress
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
        `/api/video?provider=colab-t4&taskId=${encodeURIComponent(taskId)}&colabUrl=${encodeURIComponent(colabUrl)}`,
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
          `/api/proxy?colabUrl=${encodeURIComponent(colabUrl)}&path=${encodeURIComponent(poll.output_path)}`,
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

  // Engine 1: Free 24/7 Cloud Video — Browser-direct HF LTX-Video ZeroGPU first (real AI MP4 in ~8-15s!)
  if (settings.freeVideoFallback === 'hf-ltx-space') {
    try {
      return await generateVideoViaDirectHfLtx(shot, onProgress);
    } catch {
      // Gracefully fall through to 2-Stage Keyframe + Local Cinema Motion
    }
  }

  // Guaranteed $0 zero-wait fallback: Keyframe + Smooth Cinematic Motion Pass
  let keyframeDataUrl = shot.startFrameDataUrl;
  let actualSeed = shot.seed;
  if (!keyframeDataUrl) {
    onProgress(35, 'ZeroGPU busy — generating $0 HD Keyframe (Stage 1/2)...');
    const still = await generateFreeImageCascade(
      shot.compiledPrompt,
      shot.width >= shot.height ? 1024 : 576,
      shot.width >= shot.height ? 576 : 1024,
      shot.seed,
      settings.freeImageModel,
      onProgress
    );
    keyframeDataUrl = still.dataUrl;
    actualSeed = still.seed;
  }

  onProgress(72, 'Synthesizing smooth cinema motion clip in-browser (Stage 2/2)...');
  const motionBlob = await renderLocalMotionClipFromImage(
    keyframeDataUrl,
    shot.width,
    shot.height,
    Math.min(Math.max(shot.durationSec, 2), 6)
  );
  onProgress(98, 'Saving video clip into IndexedDB Vault...');
  return {
    blob: motionBlob,
    mimeType: motionBlob.type || 'video/webm',
    providerLabel: 'Free 2-Stage Motion (ZeroGPU busy — retry or connect Colab T4)',
    seed: actualSeed,
    thumbnailDataUrl: keyframeDataUrl,
  };
}
