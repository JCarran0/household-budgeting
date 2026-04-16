/**
 * Client-side image compression utility for receipt photo uploads.
 *
 * Mobile photos can be 5–15 MB at full resolution. Compressing to ~1–2 MB
 * before upload reduces bandwidth, upload time, and Claude API token cost
 * (smaller images = fewer image tokens).
 */

interface CompressionOptions {
  /** Maximum width or height in pixels. Default: 2048 */
  maxDimension?: number;
  /** JPEG quality (0–1). Default: 0.8 */
  quality?: number;
  /** Target max file size in bytes. Default: 2 MB */
  maxSizeBytes?: number;
}

const DEFAULT_MAX_DIMENSION = 2048;
const DEFAULT_QUALITY = 0.8;
const DEFAULT_MAX_SIZE = 2 * 1024 * 1024; // 2 MB

/**
 * Compress an image file using canvas-based resize and JPEG re-encoding.
 * Returns the original file unchanged if it's already a PDF or small enough.
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = {},
): Promise<File> {
  // Don't compress PDFs
  if (file.type === 'application/pdf') {
    return file;
  }

  // Only compress image types
  if (!file.type.startsWith('image/')) {
    return file;
  }

  const {
    maxDimension = DEFAULT_MAX_DIMENSION,
    quality = DEFAULT_QUALITY,
    maxSizeBytes = DEFAULT_MAX_SIZE,
  } = options;

  // If already small enough and not oversized dimensions, skip compression
  if (file.size <= maxSizeBytes) {
    const dimensions = await getImageDimensions(file);
    if (dimensions.width <= maxDimension && dimensions.height <= maxDimension) {
      return file;
    }
  }

  const bitmap = await createImageBitmap(file);
  const { width, height } = calculateDimensions(
    bitmap.width,
    bitmap.height,
    maxDimension,
  );

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    // Fallback: return original if canvas not supported
    return file;
  }

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // Encode as JPEG
  const blob = await canvas.convertToBlob({
    type: 'image/jpeg',
    quality,
  });

  // If still too large, try with lower quality
  if (blob.size > maxSizeBytes) {
    const reducedBlob = await canvas.convertToBlob({
      type: 'image/jpeg',
      quality: quality * 0.6,
    });
    return new File(
      [reducedBlob],
      replaceExtension(file.name, '.jpg'),
      { type: 'image/jpeg' },
    );
  }

  return new File(
    [blob],
    replaceExtension(file.name, '.jpg'),
    { type: 'image/jpeg' },
  );
}

function calculateDimensions(
  width: number,
  height: number,
  maxDimension: number,
): { width: number; height: number } {
  if (width <= maxDimension && height <= maxDimension) {
    return { width, height };
  }

  const ratio = Math.min(maxDimension / width, maxDimension / height);
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  };
}

function getImageDimensions(
  file: File,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

function replaceExtension(filename: string, newExt: string): string {
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex === -1) return filename + newExt;
  return filename.substring(0, dotIndex) + newExt;
}
