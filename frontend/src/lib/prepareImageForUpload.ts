import { IMAGE_UPLOAD_LIMITS } from '../../../shared/types';

/**
 * Shrink and re-encode a picked photo before it is uploaded.
 *
 * - Longest side capped at IMAGE_UPLOAD_LIMITS.maxDimension: a 4000px, 6 MB
 *   phone photo becomes a few hundred KB, which is all a thumbnail or the
 *   modal preview ever shows.
 * - Drawing through a canvas drops ALL embedded metadata, GPS included. The
 *   server strips it again regardless (backend `imageMetadata.ts`); this is
 *   the first of two layers, not the guarantee.
 * - EXIF orientation is applied while decoding (`imageOrientation:
 *   'from-image'`), because the orientation tag is about to be discarded and
 *   a portrait photo would otherwise be stored sideways.
 * - JPEG unless the image actually uses transparency, which JPEG would flatten
 *   to black; then WebP (browsers that cannot encode WebP fall back to PNG,
 *   which the server also accepts).
 *
 * Also the format bridge: any image the browser can decode is accepted,
 * including HEIC where the browser supports it, and leaves as JPEG/WebP/PNG.
 */

const JPEG_QUALITY = 0.85;

export class ImagePreparationError extends Error {}

function hasTransparency(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  const { data } = ctx.getImageData(0, 0, width, height);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return true;
  }
  return false;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new ImagePreparationError('Could not process this image'))),
      type,
      quality,
    );
  });
}

export async function prepareImageForUpload(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new ImagePreparationError(
      "This file couldn't be read as an image. Try a JPEG or PNG.",
    );
  }

  try {
    const scale = Math.min(1, IMAGE_UPLOAD_LIMITS.maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new ImagePreparationError('Could not process this image');
    ctx.drawImage(bitmap, 0, 0, width, height);

    // A JPEG source cannot carry transparency, so skip the pixel scan.
    const transparent = file.type !== 'image/jpeg' && hasTransparency(ctx, width, height);
    const blob = transparent
      ? await canvasToBlob(canvas, 'image/webp')
      : await canvasToBlob(canvas, 'image/jpeg', JPEG_QUALITY);

    if (blob.size > IMAGE_UPLOAD_LIMITS.maxBytes) {
      throw new ImagePreparationError('This image is too large to upload, even after resizing.');
    }
    return blob;
  } finally {
    bitmap.close();
  }
}
