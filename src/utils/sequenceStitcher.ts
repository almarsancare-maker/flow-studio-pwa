/**
 * Fixes Flow Con #3 (Isolated clips with no built-in sequence assembly):
 * Renders an ordered list of storyboard clips (videos + still keyframes with subtle cinema push-in)
 * into a single continuous downloadable WebM/MP4 sequence right inside the browser at $0 cost.
 */
export interface StitchClipInput {
  id: string;
  label: string;
  kind: 'image' | 'video';
  srcUrl: string;
  stillDurationSec?: number;
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  source: HTMLVideoElement | HTMLImageElement,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
  zoom = 1
) {
  const scale = Math.max(dw / sw, dh / sh) * zoom;
  const w = sw * scale;
  const h = sh * scale;
  const x = (dw - w) / 2;
  const y = (dh - h) / 2;
  ctx.fillStyle = '#09090b';
  ctx.fillRect(0, 0, dw, dh);
  ctx.drawImage(source, x, y, w, h);
}

export async function stitchStoryboardSequence(
  clips: StitchClipInput[],
  width = 1280,
  height = 720,
  onProgress?: (pct: number, message: string) => void
): Promise<{ blob: Blob; mimeType: string }> {
  if (clips.length === 0) {
    throw new Error('Add at least one completed clip to the Storyboard before exporting.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');

  const preferredMimes = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ];
  const mimeType = preferredMimes.find((m) => MediaRecorder.isTypeSupported(m)) || 'video/webm';

  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 6_000_000,
  });

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data);
  };

  const stopPromise = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
  });

  recorder.start(250);

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const basePct = Math.round((i / clips.length) * 100);
    onProgress?.(basePct, `Stitching ${clip.label} (${i + 1}/${clips.length})...`);

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
          // Subtle Ken Burns push-in (1.0 -> 1.07) so still keyframes feel cinematic
          drawCover(ctx, img, img.naturalWidth, img.naturalHeight, width, height, 1 + t * 0.07);
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
          drawCover(ctx, video, video.videoWidth, video.videoHeight, width, height, 1);
          requestAnimationFrame(pump);
        };
        requestAnimationFrame(pump);
      });
    }
  }

  onProgress?.(98, 'Finalizing stitched sequence...');
  recorder.stop();
  const blob = await stopPromise;
  onProgress?.(100, 'Sequence export complete!');
  return { blob, mimeType };
}

/**
 * Generates an instant $0 animated Ken Burns WebM motion clip directly from a still keyframe
 * as a zero-wait local fallback when no GPU video server is connected yet.
 */
export async function renderLocalMotionClipFromImage(
  imageDataUrl: string,
  width = 720,
  height = 480,
  durationSec = 4
): Promise<Blob> {
  const { blob } = await stitchStoryboardSequence(
    [
      {
        id: 'local-motion',
        label: 'Motion Pass',
        kind: 'image',
        srcUrl: imageDataUrl,
        stillDurationSec: durationSec,
      },
    ],
    width,
    height
  );
  return blob;
}
