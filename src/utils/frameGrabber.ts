/**
 * Fixes Flow Con #2 (Clunky Scene-to-Scene Continuity):
 * Extracts the exact current frame or last usable frame from any <video> element
 * into a lossless PNG Data URL ready to inject as the Start Frame of the next shot.
 */
export async function grabVideoFrame(
  video: HTMLVideoElement,
  position: 'current' | 'last' | 'first' = 'last'
): Promise<{ dataUrl: string; width: number; height: number; timestampSec: number }> {
  if (!video.videoWidth || !video.videoHeight) {
    throw new Error('Video metadata is not loaded yet.');
  }

  const originalTime = video.currentTime;
  const wasPaused = video.paused;
  if (!wasPaused) video.pause();

  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  let targetTime = originalTime;
  if (position === 'first') {
    targetTime = 0.05;
  } else if (position === 'last') {
    targetTime = Math.max(0, duration - 0.08);
  }

  if (Math.abs(video.currentTime - targetTime) > 0.02) {
    await new Promise<void>((resolve, reject) => {
      const onSeeked = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error('Failed to seek video frame for extraction.'));
      };
      const timer = window.setTimeout(() => {
        cleanup();
        resolve();
      }, 2500);
      const cleanup = () => {
        window.clearTimeout(timer);
        video.removeEventListener('seeked', onSeeked);
        video.removeEventListener('error', onError);
      };
      video.addEventListener('seeked', onSeeked);
      video.addEventListener('error', onError);
      video.currentTime = targetTime;
    });
  }

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const dataUrl = canvas.toDataURL('image/png');
  return {
    dataUrl,
    width: canvas.width,
    height: canvas.height,
    timestampSec: video.currentTime,
  };
}

export async function fileToResizedDataUrl(file: File, maxSide = 1024): Promise<string> {
  const rawUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });

  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxSide || height > maxSide) {
        const scale = maxSide / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(rawUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.92));
    };
    img.onerror = () => reject(new Error('Invalid image file'));
    img.src = rawUrl;
  });
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to convert blob'));
    reader.readAsDataURL(blob);
  });
}
