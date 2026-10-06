/**
 * Image Metadata Stripping
 *
 * Removes embedded metadata — EXIF, XMP, IPTC and text chunks — from an
 * uploaded image before it is stored. The point is location: a phone photo
 * taken at home carries the home's GPS coordinates in EXIF, and anyone the
 * image is later shown to (or a future AI path that reads it) would get them.
 *
 * The browser already re-encodes uploads through a canvas, which drops all of
 * this. This is the server-side guarantee for an upload that skipped the
 * browser, so it cannot trust anything about the input.
 *
 * FAIL CLOSED: a file whose structure cannot be walked to the end is rejected,
 * not stored as received. A stripper that passes through what it cannot parse
 * is a stripper an attacker (or a truncated upload) walks straight past.
 *
 * Nothing is re-encoded. Kept segments/chunks are copied byte-for-byte, so the
 * pixels are untouched and no quality is lost. One consequence: a JPEG's EXIF
 * orientation tag goes with the rest of EXIF, so a sideways-stored photo that
 * bypassed the browser renders sideways. The browser path applies orientation
 * before re-encoding, so normal uploads are unaffected.
 */

import { ValidationError } from '../errors';
import type { ImageMimeType } from './imageSignatures';

function malformed(detail: string): never {
  throw new ValidationError(`Image file is malformed: ${detail}`);
}

// ---------------------------------------------------------------------------
// JPEG
// ---------------------------------------------------------------------------

/**
 * APP1 carries both EXIF and XMP (either can hold GPS), APP13 carries IPTC,
 * COM is free text. APP0 (JFIF), APP2 (ICC colour profile) and APP14 (Adobe
 * colour transform) are kept: dropping them changes how the image renders.
 */
const JPEG_STRIPPED_MARKERS = new Set([0xe1, 0xed, 0xfe]);
const JPEG_SOS = 0xda;
const JPEG_EOI = 0xd9;

/** Markers that stand alone, with no length field after them. */
function isStandaloneJpegMarker(marker: number): boolean {
  return marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7);
}

function stripJpeg(input: Buffer): Buffer {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) malformed('missing SOI');

  const kept: Buffer[] = [input.subarray(0, 2)];
  let pos = 2;

  while (pos < input.length) {
    if (input[pos] !== 0xff) malformed('expected a marker');
    // Any number of 0xFF fill bytes may precede a marker.
    let markerPos = pos;
    while (markerPos < input.length && input[markerPos] === 0xff) markerPos++;
    if (markerPos >= input.length) malformed('truncated marker');
    const marker = input[markerPos];
    const segmentStart = markerPos - 1;

    if (marker === JPEG_EOI) {
      kept.push(input.subarray(segmentStart, markerPos + 1));
      return Buffer.concat(kept);
    }
    if (isStandaloneJpegMarker(marker)) {
      kept.push(input.subarray(segmentStart, markerPos + 1));
      pos = markerPos + 1;
      continue;
    }

    if (markerPos + 2 >= input.length) malformed('truncated segment length');
    const length = input.readUInt16BE(markerPos + 1);
    if (length < 2) malformed('segment length too small');
    const segmentEnd = markerPos + 1 + length;
    if (segmentEnd > input.length) malformed('segment runs past end of file');

    if (marker === JPEG_SOS) {
      // Entropy-coded data follows, terminated by EOI. Metadata segments
      // cannot legally appear after the first scan in any image a browser
      // produces, so everything from here is copied as-is.
      kept.push(input.subarray(segmentStart));
      return Buffer.concat(kept);
    }

    if (!JPEG_STRIPPED_MARKERS.has(marker)) {
      kept.push(input.subarray(segmentStart, segmentEnd));
    }
    pos = segmentEnd;
  }

  return malformed('no image data');
}

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

const PNG_SIGNATURE_LENGTH = 8;
const PNG_STRIPPED_CHUNKS = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt']);

function stripPng(input: Buffer): Buffer {
  if (input.length < PNG_SIGNATURE_LENGTH) malformed('missing signature');

  const kept: Buffer[] = [input.subarray(0, PNG_SIGNATURE_LENGTH)];
  let pos = PNG_SIGNATURE_LENGTH;
  let first = true;

  while (pos < input.length) {
    if (pos + 8 > input.length) malformed('truncated chunk header');
    const length = input.readUInt32BE(pos);
    const type = input.toString('latin1', pos + 4, pos + 8);
    // length + type(4) + data + crc(4)
    const chunkEnd = pos + 12 + length;
    if (chunkEnd > input.length) malformed('chunk runs past end of file');
    if (first && type !== 'IHDR') malformed('first chunk is not IHDR');
    first = false;

    if (!PNG_STRIPPED_CHUNKS.has(type)) {
      kept.push(input.subarray(pos, chunkEnd));
    }
    if (type === 'IEND') {
      // Bytes after IEND are not part of the image; dropping them also drops
      // anything appended there to ride along.
      return Buffer.concat(kept);
    }
    pos = chunkEnd;
  }

  return malformed('missing IEND');
}

// ---------------------------------------------------------------------------
// WebP
// ---------------------------------------------------------------------------

const WEBP_STRIPPED_CHUNKS = new Set(['EXIF', 'XMP ']);
/** VP8X flag bits for "has EXIF" (0x08) and "has XMP" (0x04). */
const VP8X_METADATA_FLAGS = 0x08 | 0x04;

function stripWebp(input: Buffer): Buffer {
  if (input.length < 12) malformed('missing RIFF header');
  const riffSize = input.readUInt32LE(4);
  const riffEnd = 8 + riffSize;
  if (riffEnd > input.length) malformed('RIFF size runs past end of file');

  const kept: Buffer[] = [];
  let pos = 12;

  while (pos < riffEnd) {
    if (pos + 8 > riffEnd) malformed('truncated chunk header');
    const fourCC = input.toString('latin1', pos, pos + 4);
    const size = input.readUInt32LE(pos + 4);
    // Chunks are padded to an even length.
    const chunkEnd = pos + 8 + size + (size % 2);
    if (chunkEnd > riffEnd) malformed('chunk runs past end of RIFF');

    if (fourCC === 'VP8X') {
      if (size < 1) malformed('empty VP8X chunk');
      // Copy so the flag edit never touches the caller's buffer.
      const chunk = Buffer.from(input.subarray(pos, chunkEnd));
      // Without clearing these, decoders look for chunks that are gone.
      chunk[8] &= ~VP8X_METADATA_FLAGS;
      kept.push(chunk);
    } else if (!WEBP_STRIPPED_CHUNKS.has(fourCC)) {
      kept.push(input.subarray(pos, chunkEnd));
    }
    pos = chunkEnd;
  }

  if (kept.length === 0) malformed('no image data');

  const body = Buffer.concat(kept);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(4 + body.length, 4);
  header.write('WEBP', 8, 'latin1');
  return Buffer.concat([header, body]);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return a copy of `input` with embedded metadata removed.
 *
 * Callers must already have verified the magic bytes (`matchesImageSignature`);
 * this only walks the structure.
 *
 * @throws ValidationError if the file's structure cannot be walked to the end
 */
export function stripImageMetadata(input: Buffer, mimeType: ImageMimeType): Buffer {
  switch (mimeType) {
    case 'image/jpeg':
      return stripJpeg(input);
    case 'image/png':
      return stripPng(input);
    case 'image/webp':
      return stripWebp(input);
  }
}
