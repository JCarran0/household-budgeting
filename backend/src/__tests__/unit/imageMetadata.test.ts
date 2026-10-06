/**
 * stripImageMetadata — the server-side guarantee that a stored image carries
 * no location. Each test injects metadata into a known-good base image and
 * asserts the result is byte-identical to the base: that proves both that the
 * metadata is gone AND that nothing the decoder needs was touched.

 */

import { stripImageMetadata } from '../../utils/imageMetadata';
import { ValidationError } from '../../errors';
import { BASE_JPEG, BASE_PNG, BASE_WEBP, GPS_MARKER } from '../helpers/imageFixtures';

/**
 * A minimal big-endian TIFF/EXIF block whose IFD0 points at a GPS IFD holding
 * GPSLatitudeRef = "N", followed by the marker text.
 */
function exifPayload(): Buffer {
  const tiff = Buffer.alloc(44);
  tiff.write('MM', 0, 'latin1');
  tiff.writeUInt16BE(42, 2);
  tiff.writeUInt32BE(8, 4); // IFD0 offset
  tiff.writeUInt16BE(1, 8); // IFD0: one entry
  tiff.writeUInt16BE(0x8825, 10); // GPSInfo IFD pointer
  tiff.writeUInt16BE(4, 12); // LONG
  tiff.writeUInt32BE(1, 14);
  tiff.writeUInt32BE(26, 18); // -> GPS IFD
  tiff.writeUInt32BE(0, 22); // no next IFD
  tiff.writeUInt16BE(1, 26); // GPS IFD: one entry
  tiff.writeUInt16BE(0x0001, 28); // GPSLatitudeRef
  tiff.writeUInt16BE(2, 30); // ASCII
  tiff.writeUInt32BE(2, 32);
  tiff.write('N\0', 36, 'latin1');
  tiff.writeUInt32BE(0, 40);
  return Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff, Buffer.from(GPS_MARKER, 'latin1')]);
}

function xmpPayload(): string {
  return `<x:xmpmeta><exif:GPSLatitude>${GPS_MARKER}</exif:GPSLatitude></x:xmpmeta>`;
}

function jpegSegment(marker: number, payload: Buffer): Buffer {
  const header = Buffer.alloc(4);
  header[0] = 0xff;
  header[1] = marker;
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([header, payload]);
}

/** Insert segments right after JFIF APP0 (SOI 2 bytes + APP0 18 bytes). */
function jpegWith(...segments: Buffer[]): Buffer {
  return Buffer.concat([BASE_JPEG.subarray(0, 20), ...segments, BASE_JPEG.subarray(20)]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  // CRC is not validated by the stripper; a zeroed CRC keeps the fixture simple.
  return Buffer.concat([length, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
}

/** Insert chunks after IHDR (signature 8 + IHDR chunk 25 bytes). */
function pngWith(...chunks: Buffer[]): Buffer {
  return Buffer.concat([BASE_PNG.subarray(0, 33), ...chunks, BASE_PNG.subarray(33)]);
}

function riffChunk(fourCC: string, data: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.write(fourCC, 0, 'latin1');
  header.writeUInt32LE(data.length, 4);
  const pad = data.length % 2 === 1 ? Buffer.alloc(1) : Buffer.alloc(0);
  return Buffer.concat([header, data, pad]);
}

function riff(...chunks: Buffer[]): Buffer {
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(4 + body.length, 4);
  header.write('WEBP', 8, 'latin1');
  return Buffer.concat([header, body]);
}

/** VP8X chunk for a 4x4 canvas with the given flag byte. */
function vp8x(flags: number): Buffer {
  const data = Buffer.alloc(10);
  data[0] = flags;
  data.writeUIntLE(3, 4, 3); // canvas width - 1
  data.writeUIntLE(3, 7, 3); // canvas height - 1
  return riffChunk('VP8X', data);
}

const BASE_VP8_CHUNK = BASE_WEBP.subarray(12);

function expectNoMarker(buffer: Buffer): void {
  expect(buffer.includes(Buffer.from(GPS_MARKER, 'latin1'))).toBe(false);
  expect(buffer.includes(Buffer.from('Exif\0\0', 'latin1'))).toBe(false);
}

describe('stripImageMetadata — JPEG', () => {
  it('removes EXIF (with GPS), XMP, IPTC and comments, leaving the base image byte-identical', () => {
    const input = jpegWith(
      jpegSegment(0xe1, exifPayload()),
      jpegSegment(0xe1, Buffer.from(`http://ns.adobe.com/xap/1.0/\0${xmpPayload()}`, 'latin1')),
      jpegSegment(0xed, Buffer.from(`Photoshop 3.0\0${GPS_MARKER}`, 'latin1')),
      jpegSegment(0xfe, Buffer.from(GPS_MARKER, 'latin1')),
    );
    expect(input.includes(Buffer.from(GPS_MARKER, 'latin1'))).toBe(true);

    const out = stripImageMetadata(input, 'image/jpeg');

    expectNoMarker(out);
    expect(out.equals(BASE_JPEG)).toBe(true);
  });

  it('keeps an ICC colour profile (APP2)', () => {
    const icc = jpegSegment(0xe2, Buffer.from('ICC_PROFILE\0\x01\x01fake-profile', 'latin1'));
    const out = stripImageMetadata(jpegWith(icc, jpegSegment(0xe1, exifPayload())), 'image/jpeg');
    expect(out.equals(jpegWith(icc))).toBe(true);
  });

  it('returns a clean image unchanged', () => {
    expect(stripImageMetadata(BASE_JPEG, 'image/jpeg').equals(BASE_JPEG)).toBe(true);
  });

  it('rejects a segment whose length runs past the end of the file', () => {
    const truncated = jpegWith(jpegSegment(0xe1, exifPayload())).subarray(0, 40);
    expect(() => stripImageMetadata(truncated, 'image/jpeg')).toThrow(ValidationError);
  });

  it('rejects a file with no scan data', () => {
    expect(() => stripImageMetadata(BASE_JPEG.subarray(0, 20), 'image/jpeg')).toThrow(
      ValidationError,
    );
  });

  it('rejects bytes that are not a marker where one is required', () => {
    const corrupt = Buffer.concat([BASE_JPEG.subarray(0, 20), Buffer.from([0x00, 0x01])]);
    expect(() => stripImageMetadata(corrupt, 'image/jpeg')).toThrow(ValidationError);
  });
});

describe('stripImageMetadata — PNG', () => {
  it('removes eXIf, tEXt, zTXt and iTXt, leaving the base image byte-identical', () => {
    const input = pngWith(
      pngChunk('eXIf', exifPayload().subarray(6)),
      pngChunk('tEXt', Buffer.from(`Comment\0${GPS_MARKER}`, 'latin1')),
      pngChunk('zTXt', Buffer.from(`Comment\0\0${GPS_MARKER}`, 'latin1')),
      pngChunk('iTXt', Buffer.from(`XML:com.adobe.xmp\0\0\0\0\0${xmpPayload()}`, 'latin1')),
    );

    const out = stripImageMetadata(input, 'image/png');

    expect(out.includes(Buffer.from(GPS_MARKER, 'latin1'))).toBe(false);
    expect(out.equals(BASE_PNG)).toBe(true);
  });

  it('drops bytes appended after IEND', () => {
    const input = Buffer.concat([BASE_PNG, Buffer.from(GPS_MARKER, 'latin1')]);
    expect(stripImageMetadata(input, 'image/png').equals(BASE_PNG)).toBe(true);
  });

  it('rejects a file with no IEND', () => {
    expect(() => stripImageMetadata(BASE_PNG.subarray(0, BASE_PNG.length - 12), 'image/png')).toThrow(
      ValidationError,
    );
  });

  it('rejects a chunk whose length runs past the end of the file', () => {
    expect(() => stripImageMetadata(BASE_PNG.subarray(0, 40), 'image/png')).toThrow(ValidationError);
  });
});

describe('stripImageMetadata — WebP', () => {
  it('removes EXIF and XMP chunks, clears their VP8X flags and fixes the RIFF size', () => {
    const ALPHA_FLAG = 0x10;
    const input = riff(
      vp8x(ALPHA_FLAG | 0x08 | 0x04),
      BASE_VP8_CHUNK,
      riffChunk('EXIF', exifPayload().subarray(6)),
      riffChunk('XMP ', Buffer.from(xmpPayload(), 'latin1')),
    );

    const out = stripImageMetadata(input, 'image/webp');

    expect(out.includes(Buffer.from(GPS_MARKER, 'latin1'))).toBe(false);
    // Only the metadata flags are cleared; unrelated flags survive.
    expect(out.equals(riff(vp8x(ALPHA_FLAG), BASE_VP8_CHUNK))).toBe(true);
    expect(out.readUInt32LE(4)).toBe(out.length - 8);
  });

  it('does not modify the input buffer', () => {
    const input = riff(vp8x(0x08), BASE_VP8_CHUNK, riffChunk('EXIF', exifPayload().subarray(6)));
    const before = Buffer.from(input);
    stripImageMetadata(input, 'image/webp');
    expect(input.equals(before)).toBe(true);
  });

  it('returns a simple-format WebP unchanged', () => {
    expect(stripImageMetadata(BASE_WEBP, 'image/webp').equals(BASE_WEBP)).toBe(true);
  });

  it('rejects a RIFF size larger than the file', () => {
    const lying = Buffer.from(BASE_WEBP);
    lying.writeUInt32LE(10_000, 4);
    expect(() => stripImageMetadata(lying, 'image/webp')).toThrow(ValidationError);
  });

  it('rejects a chunk whose size runs past the RIFF payload', () => {
    const corrupt = Buffer.from(BASE_WEBP);
    corrupt.writeUInt32LE(10_000, 16); // VP8 chunk size
    expect(() => stripImageMetadata(corrupt, 'image/webp')).toThrow(ValidationError);
  });
});
