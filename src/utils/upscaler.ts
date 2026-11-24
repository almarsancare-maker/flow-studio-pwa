/**
 * $0 Browser-Native 4K Cinema Upscaler & Unsharp-Mask Detail Enhancer.
 * Performs stepped 2x high-quality resampling (avoids soft single-jump blur),
 * applies a 3x3 luminance-preserving unsharp mask convolution kernel for crisp
 * edge micro-contrast, and exports a lossless 4K-class PNG locally in-browser.
 */

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode image for 4K upscale'));
    img.src = src;
  });
}

function applyUnsharpMask(ctx: CanvasRenderingContext2D, width: number, height: number, amount = 0.42) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const src = imageData.data;
  const out = new Uint8ClampedArray(src.length);

  // Copy border pixels directly
  out.set(src);

  const rowStride = width * 4;
  for (let y = 1; y < height - 1; y++) {
    const rowOff = y * rowStride;
    for (let x = 1; x < width - 1; x++) {
      const idx = rowOff + x * 4;
      for (let c = 0; c < 3; c++) {
        const center = src[idx + c];
        const blur =
          (src[idx - rowStride - 4 + c] +
            src[idx - rowStride + c] * 2 +
            src[idx - rowStride + 4 + c] +
            src[idx - 4 + c] * 2 +
            center * 4 +
            src[idx + 4 + c] * 2 +
            src[idx + rowStride - 4 + c] +
            src[idx + rowStride + c] * 2 +
            src[idx + rowStride + 4 + c]) /
          16;
        const sharpened = center + (center - blur) * amount;
        out[idx + c] = sharpened < 0 ? 0 : sharpened > 255 ? 255 : sharpened;
      }
      out[idx + 3] = src[idx + 3];
    }
  }

  imageData.data.set(out);
  ctx.putImageData(imageData, 0, 0);
}

export async function upscaleImageTo4K(
  srcUrl: string,
  targetLongEdge = 3840
): Promise<{ blob: Blob; width: number; height: number }> {
  const img = await loadHtmlImage(srcUrl);
  const sw = img.naturalWidth || img.width;
  const sh = img.naturalHeight || img.height;
  if (!sw || !sh) throw new Error('Invalid image dimensions for upscale');

  const maxEdge = Math.max(sw, sh);
  const scale = maxEdge >= targetLongEdge ? 1 : targetLongEdge / maxEdge;
  const targetW = Math.round(sw * scale);
  const targetH = Math.round(sh * scale);

  // Stepped progressive upscale (max 2x per pass) to retain sharp edge contours
  let currentCanvas = document.createElement('canvas');
  currentCanvas.width = sw;
  currentCanvas.height = sh;
  const initCtx = currentCanvas.getContext('2d');
  if (!initCtx) throw new Error('Canvas 2D unavailable');
  initCtx.drawImage(img, 0, 0, sw, sh);

  let curW = sw;
  let curH = sh;
  while (curW < targetW || curH < targetH) {
    const nextW = Math.min(targetW, Math.round(curW * 1.85));
    const nextH = Math.min(targetH, Math.round(curH * 1.85));
    const stepCanvas = document.createElement('canvas');
    stepCanvas.width = nextW;
    stepCanvas.height = nextH;
    const stepCtx = stepCanvas.getContext('2d');
    if (!stepCtx) throw new Error('Canvas 2D step unavailable');
    stepCtx.imageSmoothingEnabled = true;
    stepCtx.imageSmoothingQuality = 'high';
    stepCtx.drawImage(currentCanvas, 0, 0, curW, curH, 0, 0, nextW, nextH);
    currentCanvas = stepCanvas;
    curW = nextW;
    curH = nextH;
  }

  const finalCtx = currentCanvas.getContext('2d');
  if (finalCtx) {
    applyUnsharpMask(finalCtx, curW, curH, 0.45);
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    currentCanvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error('PNG export failed'));
    }, 'image/png');
  });

  return { blob, width: curW, height: curH };
}
