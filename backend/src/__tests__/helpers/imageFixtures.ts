/**
 * Tiny known-good images for tests. Produced with ImageMagick/cwebp (4x4 solid
 * colour, `-strip`) and verified to decode with `magick identify` before being
 * embedded here.
 */

export const BASE_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAAEAAQDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAAB//EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAVAQEBAAAAAAAAAAAAAAAAAAAHCP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ADINKzf/2Q==',
  'base64',
);
export const BASE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAEAQMAAACTPww9AAAAA1BMVEUgQMD0KvaPAAAAC0lEQVQI12NggAAAAAgAAS8g3TEAAAAASUVORK5CYII=',
  'base64',
);
/** Simple-format WebP: RIFF header + one VP8 chunk. */
export const BASE_WEBP = Buffer.from(
  'UklGRjgAAABXRUJQVlA4ICwAAACQAQCdASoEAAQAAgA0JaACdLoAA5gA/vJmr/1Bn/kGf+QZ+ql/G83mtWIAAA==',
  'base64',
);

/** Marker text planted in metadata blocks, so its absence is checkable. */
export const GPS_MARKER = 'GPSLatitude40.4462N';

/**
 * BASE_JPEG with an EXIF APP1 segment (TIFF header + GPS_MARKER text) inserted
 * after JFIF APP0. Enough for route tests to prove stripping ran; the
 * structural GPS-IFD fixture lives in imageMetadata.test.ts.
 */
export function jpegWithGps(): Buffer {
  const payload = Buffer.concat([
    Buffer.from('Exif\0\0MM\0*\0\0\0\x08', 'latin1'),
    Buffer.from(GPS_MARKER, 'latin1'),
  ]);
  const header = Buffer.from([0xff, 0xe1, 0, 0]);
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([BASE_JPEG.subarray(0, 20), header, payload, BASE_JPEG.subarray(20)]);
}
