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

export async function pingColabBackend(colabUrl: string): Promise<ColabHealthStatus> {
  const cleaned = colabUrl.trim().replace(/\/+$/, '');
  if (!cleaned) {
    return { online: false, error: 'Enter your https://*.trycloudflare.com Colab tunnel URL first.' };
  }
  try {
    const resp = await fetch(`/api/proxy?colabUrl=${encodeURIComponent(cleaned)}&path=%2Fapi%2Fhealth`);
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

async function generateFreeImage(
  prompt: string,
  width: number,
  height: number,
  seed: number,
  model: 'flux' | 'turbo'
): Promise<{ dataUrl: string; blob: Blob; mimeType: string; provider: string; seed: number }> {
  const resp = await fetch('/api/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, width, height, seed, model }),
  });
  const data = await resp.json();
  if (!resp.ok || !data?.ok || !data?.dataUrl) {
    throw new Error(data?.error || `Image API error (HTTP ${resp.status})`);
  }
  const { blob, mimeType } = dataUrlToBlob(data.dataUrl);
  return {
    dataUrl: data.dataUrl,
    blob,
    mimeType,
    provider: data.provider || 'Pollinations FLUX',
    seed: typeof data.seed === 'number' ? data.seed : seed,
  };
}

export async function runImageGeneration(
  shot: MediaShot,
  settings: EngineSettings,
  onProgress: (pct: number, phase: string) => void
): Promise<GenerationResult> {
  const useColab = settings.activeEngine === 'colab-t4' && settings.colabUrl.trim().length > 0;

  if (useColab) {
    onProgress(18, `Sending keyframe to Colab T4 (${settings.colabModelImage})...`);
    const resp = await fetch('/api/proxy', {
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
    });
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

  onProgress(22, `Rendering keyframe on $0 Free 24/7 (${settings.freeImageModel.toUpperCase()})...`);
  const result = await generateFreeImage(
    shot.compiledPrompt,
    shot.width,
    shot.height,
    shot.seed,
    settings.freeImageModel
  );
  onProgress(95, 'Caching permanently in IndexedDB Vault...');
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
    const submitResp = await fetch('/api/video', {
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
    });
    const submitData = await submitResp.json();
    if (!submitResp.ok || !submitData?.ok || !submitData?.taskId) {
      throw new Error(submitData?.error || 'Failed to queue job on Colab T4');
    }

    const taskId = submitData.taskId;
    for (let attempt = 0; attempt < 180; attempt++) {
      await new Promise((r) => setTimeout(r, 3000));
      const pollResp = await fetch(
        `/api/video?provider=colab-t4&taskId=${encodeURIComponent(taskId)}&colabUrl=${encodeURIComponent(colabUrl)}`
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
        const fileResp = await fetch(
          `/api/proxy?colabUrl=${encodeURIComponent(colabUrl)}&path=${encodeURIComponent(poll.output_path)}`
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

  // Engine 1: Free 24/7 Cloud Video (try HF LTX-Video ZeroGPU first if enabled, fallback to 2-Stage Keyframe + Ken Burns Motion)
  if (settings.freeVideoFallback === 'hf-ltx-space') {
    onProgress(14, 'Submitting to HF LTX-Video Distilled (Free ZeroGPU)...');
    try {
      const submitResp = await fetch('/api/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engine: 'free-24-7',
          prompt: shot.compiledPrompt,
          negativePrompt: shot.negativePrompt,
          width: shot.width,
          height: shot.height,
          durationSec: Math.min(shot.durationSec, 5),
          seed: shot.seed,
          mode: shot.mode,
          startFrameDataUrl: shot.startFrameDataUrl,
        }),
      });
      const submitData = await submitResp.json();
      if (submitData?.ok && submitData?.taskId) {
        const endpoint = submitData.endpoint || 'text_to_video';
        for (let attempt = 0; attempt < 6; attempt++) {
          onProgress(28 + attempt * 10, 'Waiting for HF LTX-Video ZeroGPU slot...');
          const pollResp = await fetch(
            `/api/video?provider=hf-ltx-video&taskId=${encodeURIComponent(submitData.taskId)}&endpoint=${encodeURIComponent(endpoint)}`
          );
          const poll = await pollResp.json();
          if (poll.status === 'completed' && poll.videoUrl) {
            onProgress(92, 'Downloading MP4 from HF ZeroGPU to local Vault...');
            const vidResp = await fetch(poll.videoUrl);
            if (vidResp.ok) {
              const blob = await vidResp.blob();
              return {
                blob,
                mimeType: blob.type || 'video/mp4',
                providerLabel: 'HF LTX-Video (Free ZeroGPU)',
                seed: shot.seed,
                thumbnailDataUrl: shot.startFrameDataUrl,
              };
            }
            break;
          }
          if (poll.status === 'failed' || poll.fallback) {
            break;
          }
        }
      }
    } catch {
      // Gracefully fall through to 2-Stage Keyframe + Local Cinema Motion
    }
  }

  // Guaranteed $0 zero-wait fallback: Keyframe + Smooth Cinematic Motion Pass
  let keyframeDataUrl = shot.startFrameDataUrl;
  let actualSeed = shot.seed;
  if (!keyframeDataUrl) {
    onProgress(35, 'ZeroGPU busy — generating $0 HD Keyframe (Stage 1/2)...');
    const still = await generateFreeImage(
      shot.compiledPrompt,
      shot.width >= shot.height ? 1024 : 576,
      shot.width >= shot.height ? 576 : 1024,
      shot.seed,
      settings.freeImageModel
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
    providerLabel: 'Free 2-Stage Motion (Connect Colab T4 for diffusion motion)',
    seed: actualSeed,
    thumbnailDataUrl: keyframeDataUrl,
  };
}
