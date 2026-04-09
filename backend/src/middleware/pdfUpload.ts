/**
 * PDF upload middleware using multer with in-memory storage.
 *
 * SEC-001: PDFs are held in memory only — never written to disk or S3.
 * SEC-007: Validates MIME type, file size (20 MB), and file count (max 2).
 *          Post-upload magic byte validation rejects spoofed MIME types.
 */

import multer, { MulterError } from 'multer';
import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../errors';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const MAX_FILE_COUNT = 2;
const PDF_MAGIC_BYTES = Buffer.from('%PDF-');

const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      cb(new Error('Only PDF files are accepted'));
      return;
    }
    cb(null, true);
  },
});

/** Multer middleware: accepts up to 2 files under the "pdfs" field. */
export const uploadPdfs = pdfUpload.array('pdfs', MAX_FILE_COUNT);

/**
 * SEC-007 hardening: validate actual file content starts with PDF magic bytes.
 * MIME type from Content-Type is client-controlled and trivially spoofable.
 * Must be called in the route handler immediately after multer middleware.
 */
export function validatePdfMagicBytes(files: Express.Multer.File[]): void {
  for (const file of files) {
    if (!file.buffer.subarray(0, 5).equals(PDF_MAGIC_BYTES)) {
      throw new ValidationError(
        'Uploaded file is not a valid PDF (invalid file header)'
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
        next(new ValidationError('Too many files. Maximum is 2 PDFs per upload.'));
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
  if (err.message === 'Only PDF files are accepted') {
    next(new ValidationError(err.message));
    return;
  }
  next(err);
}
