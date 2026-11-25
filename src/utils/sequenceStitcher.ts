import type { AmbientAudioPreset, CinemaLut, TransitionStyle } from '../types/studio';
import { startProceduralAmbientAudio } from './audioStudio';

/**
 * Fixes Flow Con #3 & #8–#11:
 * Full browser-native Cinema Post-Production Stitcher ($0):
 * - 5 Real-Time Cinema LUTs (Natural, Teal & Orange, 35mm Warm, Noir B&W, Cyberpunk)
 * - 3 Transitions (Hard Cut, Smooth Crossfade, Fade to Black)
 * - Burned-In Cinema Subtitles + .SRT export
 * - Procedural Web Audio API Soundscape muxed directly into the exported video
 * - Director-Aware Camera Motion choreography (Pan, Crane, Dolly, Handheld, End-Frame Morph)
 */

export interface StitchClipInput {
  id: string;
  label: string;
  kind: 'image' | 'video';
  srcUrl: string;
  stillDurationSec?: number;
  subtitle?: string;
}

export interface StitchOptions {
  lut?: CinemaLut;
  transition?: TransitionStyle;
  ambientAudio?: AmbientAudioPreset;
  burnSubtitles?: boolean;
}

export const LUT_CSS_FILTERS: Record<CinemaLut, string> = {
  natural: 'none',
  'teal-orange': 'contrast(1.12) saturate(1.22) hue-rotate(-8deg)',
  'warm-35mm': 'contrast(1.06) sepia(0.22) saturate(1.15) brightness(0.98)',
  'noir-bw': 'grayscale(1) contrast(1.32) brightness(0.95)',
  cyberpunk: 'contrast(1.18) saturate(1.45) hue-rotate(12deg)',
};

function drawCoverTransform(
  ctx: CanvasRenderingContext2D,
  source: HTMLVideoElement | HTMLImageElement,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
  opts: { zoom?: number; panX?: number; panY?: number; alpha?: number; filter?: string } = {}
) {
  const { zoom = 1, panX = 0, panY = 0, alpha = 1, filter = 'none' } = opts;
  const scale = Math.max(dw / sw, dh / sh) * zoom;
  const w = sw * scale;
  const h = sh * scale;
  const x = (dw - w) / 2 + panX;
  const y = (dh - h) / 2 + panY;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.filter = filter;
  ctx.drawImage(source, x, y, w, h);
  ctx.restore();
}

function drawVignetteAndSubtitle(
  ctx: CanvasRenderingContext2D,
  dw: number,
  dh: number,
  lut: CinemaLut,
  subtitle?: string
) {
  if (lut !== 'natural') {
    const grad = ctx.createRadialGradient(dw / 2, dh / 2, dh * 0.25, dw / 2, dh / 2, dw * 0.72);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, dw, dh);
  }

  const text = subtitle?.trim();
  if (!text) return;

  const fontSize = Math.max(20, Math.round(dh * 0.042));
  ctx.save();
  ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const maxWidth = dw * 0.84;
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);

  const lineHeight = fontSize * 1.32;
  const boxHeight = lines.length * lineHeight + 18;
  const boxWidth = Math.min(
    maxWidth + 32,
    Math.max(...lines.map((l) => ctx.measureText(l).width)) + 36
  );
  const boxY = dh - boxHeight - Math.round(dh * 0.055);
  const boxX = (dw - boxWidth) / 2;

  ctx.fillStyle = 'rgba(8, 8, 12, 0.76)';
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 12);
  ctx.fill();

  ctx.fillStyle = '#fafafa';
  lines.forEach((line, idx) => {
    const y = boxY + 9 + lineHeight * (idx + 0.5);
    ctx.fillText(line, dw / 2, y);
  });
  ctx.restore();
}

export function buildSrtSubtitles(clips: StitchClipInput[]): string {
  const fmt = (sec: number) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = Math.floor(sec % 60);
    const ms = Math.round((sec % 1) * 1000);
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(
      2,
      '0'
    )},${String(ms).padStart(3, '0')}`;
  };

  let cursor = 0;
  const blocks: string[] = [];
  let cue = 1;
  for (const clip of clips) {
    const dur = clip.stillDurationSec ?? 3;
    const text = clip.subtitle?.trim();
    if (text) {
      blocks.push(`${cue}\n${fmt(cursor)} --> ${fmt(cursor + dur)}\n${text}\n`);
      cue += 1;
    }
    cursor += dur;
  }
  return blocks.join('\n');
}

export async function stitchStoryboardSequence(
  clips: StitchClipInput[],
  width = 1280,
  height = 720,
  onProgress?: (pct: number, message: string) => void,
  options: StitchOptions = {}
): Promise<{ blob: Blob; mimeType: string }> {
  if (clips.length === 0) {
    throw new Error('Add at least one completed clip to the Storyboard before exporting.');
  }

  const lut = options.lut ?? 'natural';
  const transition = options.transition ?? 'crossfade';
  const ambientAudio = options.ambientAudio ?? 'none';
  const burnSubtitles = options.burnSubtitles !== false;
  const cssFilter = LUT_CSS_FILTERS[lut];

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');

  const canvasStream = canvas.captureStream(30);
  const ambient = startProceduralAmbientAudio(ambientAudio);
  const combinedTracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];
  if (ambient.audioTrack) combinedTracks.push(ambient.audioTrack);
  const recordStream = new MediaStream(combinedTracks);

  const preferredMimes = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ];
  const mimeType =
    typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function'
      ? preferredMimes.find((m) => MediaRecorder.isTypeSupported(m)) || ''
      : '';

  const recorder = new MediaRecorder(
    recordStream,
    mimeType ? { mimeType, videoBitsPerSecond: 6_500_000 } : { videoBitsPerSecond: 6_500_000 }
  );

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data);
  };

  const stopPromise = new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      ambient.stop();
      resolve(new Blob(chunks, { type: mimeType }));
    };
  });

  // Offscreen snapshot of previous clip's last frame for smooth crossfade transitions
  const prevCanvas = document.createElement('canvas');
  prevCanvas.width = width;
  prevCanvas.height = height;
  const prevCtx = prevCanvas.getContext('2d');
  let hasPrevFrame = false;

  recorder.start(250);

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const basePct = Math.round((i / clips.length) * 100);
    onProgress?.(basePct, `Grading & stitching ${clip.label} (${i + 1}/${clips.length})...`);
    const fadeMs = transition === 'cut' ? 0 : 480;

    if (clip.kind === 'image') {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.crossOrigin = 'anonymous';
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error(`Failed to load image for ${clip.label}`));
        el.src = clip.srcUrl;
      });
      const holdMs = (clip.stillDurationSec ?? 3) * 1000;
      const startTs = performance.now();
      await new Promise<void>((resolve) => {
        const step = (now: number) => {
          const elapsed = now - startTs;
          const t = Math.min(1, elapsed / holdMs);
          ctx.fillStyle = '#08080a';
          ctx.fillRect(0, 0, width, height);

          if (hasPrevFrame && transition === 'crossfade' && elapsed < fadeMs) {
            ctx.drawImage(prevCanvas, 0, 0);
            drawCoverTransform(ctx, img, img.naturalWidth, img.naturalHeight, width, height, {
              zoom: 1 + t * 0.07,
              alpha: elapsed / fadeMs,
              filter: cssFilter,
            });
          } else {
            const fadeAlpha =
              transition === 'fade-black' && elapsed < fadeMs
                ? elapsed / fadeMs
                : transition === 'fade-black' && holdMs - elapsed < fadeMs
                ? Math.max(0, (holdMs - elapsed) / fadeMs)
                : 1;
            drawCoverTransform(ctx, img, img.naturalWidth, img.naturalHeight, width, height, {
              zoom: 1 + t * 0.07,
              alpha: fadeAlpha,
              filter: cssFilter,
            });
          }

          drawVignetteAndSubtitle(
            ctx,
            width,
            height,
            lut,
            burnSubtitles ? clip.subtitle : undefined
          );

          if (elapsed < holdMs) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });
    } else {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.playsInline = true;
      video.src = clip.srcUrl;
      await new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = () => reject(new Error(`Failed to decode video for ${clip.label}`));
      });

      const startTs = performance.now();
      await video.play();
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };
        video.onended = finish;
        const pump = () => {
          if (done || video.ended) {
            finish();
            return;
          }
          const elapsed = performance.now() - startTs;
          ctx.fillStyle = '#08080a';
          ctx.fillRect(0, 0, width, height);
          if (hasPrevFrame && transition === 'crossfade' && elapsed < fadeMs) {
            ctx.drawImage(prevCanvas, 0, 0);
            drawCoverTransform(ctx, video, video.videoWidth, video.videoHeight, width, height, {
              alpha: elapsed / fadeMs,
              filter: cssFilter,
            });
          } else {
            drawCoverTransform(ctx, video, video.videoWidth, video.videoHeight, width, height, {
              alpha: transition === 'fade-black' && elapsed < fadeMs ? elapsed / fadeMs : 1,
              filter: cssFilter,
            });
          }
          drawVignetteAndSubtitle(
            ctx,
            width,
            height,
            lut,
            burnSubtitles ? clip.subtitle : undefined
          );
          requestAnimationFrame(pump);
        };
        requestAnimationFrame(pump);
      });
    }

    if (prevCtx) {
      prevCtx.drawImage(canvas, 0, 0);
      hasPrevFrame = true;
    }
  }

  onProgress?.(98, 'Finalizing graded master sequence...');
  recorder.stop();
  const blob = await stopPromise;
  onProgress?.(100, 'Master sequence export complete!');
  return { blob, mimeType };
}

/**
 * Director-Aware local cinema motion pass ($0 instant fallback when cloud ZeroGPU is saturated).
 * Reads camera cues (pan left/right, crane up, handheld, zoom out, dolly in) from the prompt
 * and smoothly cross-morphs into an optional End Frame when provided.
 */
export async function renderLocalMotionClipFromImage(
  imageDataUrl: string,
  width = 720,
  height = 480,
  durationSec = 4,
  promptHint = '',
  endFrameDataUrl?: string
): Promise<Blob> {
  const loadImg = (src: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Failed to load keyframe image'));
      el.src = src;
    });

  const startImg = await loadImg(imageDataUrl);
  const endImg = endFrameDataUrl ? await loadImg(endFrameDataUrl).catch(() => null) : null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');

  const preferredMimes = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const mimeType = preferredMimes.find((m) => MediaRecorder.isTypeSupported(m)) || 'video/webm';
  const recorder = new MediaRecorder(canvas.captureStream(30), {
    mimeType,
    videoBitsPerSecond: 4_500_000,
  });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data);
  };
  const stopPromise = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
  });

  const hint = promptHint.toLowerCase();
  const panLeft = hint.includes('pan left');
  const panRight = hint.includes('pan right');
  const craneUp = hint.includes('crane') || hint.includes('tilt up');
  const zoomOut = hint.includes('zoom out') || hint.includes('pull back');
  const handheld = hint.includes('handheld');

  const holdMs = durationSec * 1000;
  const startTs = performance.now();
  recorder.start(200);

  await new Promise<void>((resolve) => {
    const step = (now: number) => {
      const elapsed = now - startTs;
      const rawT = Math.min(1, elapsed / holdMs);
      // Smooth ease-in-out curve
      const t = rawT < 0.5 ? 2 * rawT * rawT : 1 - Math.pow(-2 * rawT + 2, 2) / 2;

      const baseZoom = zoomOut ? 1.12 - t * 0.1 : 1.04 + t * 0.08;
      const panX = panLeft
        ? (0.5 - t) * width * 0.08
        : panRight
        ? (t - 0.5) * width * 0.08
        : handheld
        ? Math.sin(elapsed * 0.004) * 5
        : 0;
      const panY = craneUp
        ? (t - 0.5) * height * 0.07
        : handheld
        ? Math.cos(elapsed * 0.0033) * 4
        : 0;

      ctx.fillStyle = '#08080a';
      ctx.fillRect(0, 0, width, height);
      drawCoverTransform(ctx, startImg, startImg.naturalWidth, startImg.naturalHeight, width, height, {
        zoom: baseZoom,
        panX,
        panY,
        alpha: 1,
      });

      if (endImg) {
        drawCoverTransform(ctx, endImg, endImg.naturalWidth, endImg.naturalHeight, width, height, {
          zoom: 1.08 - t * 0.04,
          panX: -panX * 0.5,
          panY: -panY * 0.5,
          alpha: t,
        });
      }

      if (elapsed < holdMs) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });

  recorder.stop();
  return stopPromise;
}
