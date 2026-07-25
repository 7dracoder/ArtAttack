const WEBP_QUALITIES = [0.86, 0.74, 0.62, 0.5, 0.4];
const SCALE_STEPS = [1, 0.85, 0.7, 0.55, 0.4, 0.3];

interface CanvasExportOptions {
  maxDimension: number;
  maxCharacters: number;
}

type DrawableImage = HTMLCanvasElement | HTMLImageElement;

/**
 * Keeps inline images small enough to safely coexist in a single Firestore room
 * document. The generated art has a white background, so lossy WebP is a good fit.
 */
export function exportCompactImage(source: DrawableImage, options: CanvasExportOptions): string {
  const sourceWidth = source instanceof HTMLCanvasElement ? source.width : source.naturalWidth;
  const sourceHeight = source instanceof HTMLCanvasElement ? source.height : source.naturalHeight;
  const baseScale = Math.min(1, options.maxDimension / Math.max(sourceWidth, sourceHeight));
  let smallestResult = '';

  for (const scaleStep of SCALE_STEPS) {
    const width = Math.max(1, Math.round(sourceWidth * baseScale * scaleStep));
    const height = Math.max(1, Math.round(sourceHeight * baseScale * scaleStep));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) continue;

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(source, 0, 0, width, height);

    for (const quality of WEBP_QUALITIES) {
      const result = canvas.toDataURL('image/webp', quality);
      if (!smallestResult || result.length < smallestResult.length) {
        smallestResult = result;
      }
      if (result.length <= options.maxCharacters) {
        return result;
      }
    }
  }

  if (!smallestResult || smallestResult.length > options.maxCharacters) {
    throw new Error('The generated image is too large to synchronize. Please simplify the drawing and retry.');
  }

  return smallestResult;
}

export async function compactImageDataUrl(
  dataUrl: string,
  options: CanvasExportOptions
): Promise<string> {
  if (!dataUrl.startsWith('data:image/') || dataUrl.length <= options.maxCharacters) {
    return dataUrl;
  }

  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  return exportCompactImage(image, options);
}
