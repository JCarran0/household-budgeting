/**
 * Receipt upload middleware using multer with in-memory storage.
 *
 * Accepts PDFs and images (JPEG, PNG) for Amazon receipt matching.
 *
 * SEC-001: Files are held in memory only — never written to disk or S3.
 * SEC-007: Validates MIME type, file size (20 MB), and file count (max 2).
 *          Post-upload magic byte validation rejects spoofed MIME types.
 */

import multer, { MulterError } from 'multer';
import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../errors';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const MAX_FILE_COUNT = 2;

/** MIME types accepted by the receipt upload endpoint. */
export type SupportedUploadMimeType = 'application/pdf' | 'image/jpeg' | 'image/png';

const ALLOWED_MIME_TYPES: readonly SupportedUploadMimeType[] = [
  'application/pdf',
  'image/jpeg',
  'image/png',
] as const;

function isSupportedMimeType(mime: string): mime is SupportedUploadMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mime);
}

/** Magic byte signatures for supported file types. */
const MAGIC_BYTES: Record<SupportedUploadMimeType, { bytes: Buffer; offset: number }> = {
  'application/pdf': { bytes: Buffer.from('%PDF-'), offset: 0 },
  'image/jpeg': { bytes: Buffer.from([0xFF, 0xD8, 0xFF]), offset: 0 },
  'image/png': { bytes: Buffer.from([0x89, 0x50, 0x4E, 0x47]), offset: 0 },
};

const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!isSupportedMimeType(file.mimetype)) {
      cb(new Error('Only PDF, JPEG, and PNG files are accepted'));
      return;
    }
    cb(null, true);
  },
});

/** Multer middleware: accepts up to 2 files under the "pdfs" field. */
export const uploadPdfs = receiptUpload.array('pdfs', MAX_FILE_COUNT);

/**
 * SEC-007 hardening: validate actual file content matches expected magic bytes.
 * MIME type from Content-Type is client-controlled and trivially spoofable.
 * Must be called in the route handler immediately after multer middleware.
 */
export function validatePdfMagicBytes(files: Express.Multer.File[]): void {
  for (const file of files) {
    if (!isSupportedMimeType(file.mimetype)) {
      throw new ValidationError(
        `Unsupported file type: ${file.mimetype}`
      );
    }
    const expected = MAGIC_BYTES[file.mimetype];

    const headerSlice = file.buffer.subarray(
      expected.offset,
      expected.offset + expected.bytes.length,
    );
    if (!headerSlice.equals(expected.bytes)) {
      throw new ValidationError(
        'Uploaded file content does not match its declared type (invalid file header)'
      );
    }
  }
}

/**
 * Error-handling wrapper for multer. Catches MulterError and converts
 * to user-friendly ValidationError instead of leaking internal details.
 */
export function handleMulterError(
  err: Error,
  _req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (err instanceof MulterError) {
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        next(new ValidationError('File too large. Maximum size is 20 MB per file.'));
        return;
      case 'LIMIT_FILE_COUNT':
        next(new ValidationError('Too many files. Maximum is 2 files per upload.'));
        return;
      case 'LIMIT_UNEXPECTED_FILE':
        next(new ValidationError('Unexpected file field. Use the "pdfs" field name.'));
        return;
      default:
        next(new ValidationError(`Upload error: ${err.message}`));
        return;
    }
  }
  // Non-multer errors (e.g. fileFilter rejection)
  if (err.message === 'Only PDF, JPEG, and PNG files are accepted') {
    next(new ValidationError(err.message));
    return;
  }
  next(err);
}
