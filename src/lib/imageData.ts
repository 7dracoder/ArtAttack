const WEBP_QUALITIES = [0.86, 0.74, 0.62, 0.5, 0.4];
const SCALE_STEPS = [1, 0.85, 0.7, 0.55, 0.4, 0.3];

interface CanvasExportOptions {
  maxDimension: number;
  maxCharacters: number;
  background?: string | null;
  removeLightBackground?: boolean;
}

type DrawableImage = HTMLCanvasElement | HTMLImageElement;

function isLightNeutralPixel(data: Uint8ClampedArray, offset: number): boolean {
  const alpha = data[offset + 3];
  if (alpha === 0) return true;

  const red = data[offset];
  const green = data[offset + 1];
  const blue = data[offset + 2];
  const brightest = Math.max(red, green, blue);
  const darkest = Math.min(red, green, blue);
  const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  return luminance >= 202 && brightest - darkest <= 42;
}

/**
 * Removes only light, neutral pixels connected to the image perimeter. This
 * clears a generated white studio matte while keeping enclosed white details
 * such as eyes, armor, or highlights.
 */
export function removeConnectedLightBackground(
  data: Uint8ClampedArray,
  width: number,
  height: number
): Uint8ClampedArray {
  if (width <= 0 || height <= 0 || data.length < width * height * 4) return data;

  const pixelCount = width * height;
  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;

  const enqueue = (pixelIndex: number) => {
    if (visited[pixelIndex]) return;
    if (!isLightNeutralPixel(data, pixelIndex * 4)) return;
    visited[pixelIndex] = 1;
    queue[tail] = pixelIndex;
    tail += 1;
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  while (head < tail) {
    const pixelIndex = queue[head];
    head += 1;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    const offset = pixelIndex * 4;

    if (data[offset + 3] > 0) {
      const luminance =
        data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722;
      // Treat ordinary off-white studio mattes as fully transparent, while
      // feathering the darker anti-aliased transition into the subject.
      const matteStrength = Math.min(1, Math.max(0, (luminance - 202) / 26));
      data[offset + 3] = Math.round(data[offset + 3] * (1 - matteStrength));
    }

    for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
      for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
        if (xOffset === 0 && yOffset === 0) continue;
        const nextX = x + xOffset;
        const nextY = y + yOffset;
        if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
        enqueue(nextY * width + nextX);
      }
    }
  }

  return data;
}

/**
 * Keeps inline images small enough to safely coexist in a single Firestore room
 * document. Drawings use a white paper matte; generated sprites can preserve
 * alpha and remove an edge-connected light background before encoding.
 */
export function exportCompactImage(source: DrawableImage, options: CanvasExportOptions): string {
  const sourceWidth = source instanceof HTMLCanvasElement ? source.width : source.naturalWidth;
  const sourceHeight = source instanceof HTMLCanvasElement ? source.height : source.naturalHeight;
  if (!sourceWidth || !sourceHeight) {
    throw new Error('The image could not be decoded.');
  }

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

    context.clearRect(0, 0, width, height);
    const background = options.background === undefined ? '#ffffff' : options.background;
    if (background && !options.removeLightBackground) {
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(source, 0, 0, width, height);

    if (options.removeLightBackground) {
      const imageData = context.getImageData(0, 0, width, height);
      removeConnectedLightBackground(imageData.data, width, height);
      context.putImageData(imageData, 0, 0);
    }

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
  if (
    !dataUrl.startsWith('data:image/') ||
    (dataUrl.length <= options.maxCharacters && !options.removeLightBackground)
  ) {
    return dataUrl;
  }

  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('The generated fighter image could not be decoded.'));
    image.src = dataUrl;
  });
  return exportCompactImage(image, options);
}
