/**
 * Image Signatures
 *
 * The raster formats the app accepts as uploads, and the magic-byte check that
 * proves a buffer is what its declared MIME type claims. Content-Type is
 * client-controlled, so the declared type alone is never trusted.
 *
 * Shared by chat attachments (which also accept PDF, checked in their own
 * middleware) and stored images. SVG is deliberately absent: it is a document
 * that can carry script, not a raster.
 */

import type { ImageRef } from '../shared/types';

export type ImageMimeType = ImageRef['mimeType'];

export const IMAGE_MIME_TYPES: readonly ImageMimeType[] = ['image/jpeg', 'image/png', 'image/webp'];

const IMAGE_MIME_SET = new Set<string>(IMAGE_MIME_TYPES);

export function isImageMimeType(mime: string): mime is ImageMimeType {
  return IMAGE_MIME_SET.has(mime);
}

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP_RIFF = Buffer.from('RIFF');
const WEBP_MARK = Buffer.from('WEBP');

/** True when the buffer's leading bytes match the signature of `mime`. */
export function matchesImageSignature(buffer: Buffer, mime: ImageMimeType): boolean {
  switch (mime) {
    case 'image/jpeg':
      return buffer.subarray(0, 3).equals(JPEG_MAGIC);
    case 'image/png':
      return buffer.subarray(0, 8).equals(PNG_MAGIC);
    case 'image/webp':
      return (
        buffer.subarray(0, 4).equals(WEBP_RIFF) && buffer.subarray(8, 12).equals(WEBP_MARK)
      );
  }
}
