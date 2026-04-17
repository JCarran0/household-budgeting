/**
 * Chat Attachment Upload Middleware
 *
 * Multer configuration + magic-byte validation for chat attachment uploads.
 * Tighter limits than Amazon receipts (10 MB / 20 pages vs 20 MB / 50 pages)
 * because chat attachments are expected to be single flyers or photos.
 *
 * SECURITY (SEC-A013): MIME allowlist, 10 MB size cap, 20-page PDF cap.
 * SECURITY (SEC-A014): memoryStorage() — files are never written to disk or S3.
 * SECURITY (SEC-A009): Content flows through SDK content blocks, not system prompt.
 *
 * Reuses the magic-byte validation pattern from pdfUpload.ts.
 */

import multer from 'multer';
import { ValidationError } from '../errors';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB (BRD §3.1)
const MAX_PDF_PAGES = 20;               // BRD §3.1

/** MIME types accepted for chat attachments */
export type ChatAttachmentMimeType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'application/pdf';

const ALLOWED_MIMES = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

function isAllowedMime(mime: string): mime is ChatAttachmentMimeType {
  return ALLOWED_MIMES.has(mime);
}

/** Magic byte signatures */
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_MAGIC  = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const WEBP_RIFF  = Buffer.from('RIFF');
const WEBP_MARK  = Buffer.from('WEBP');
const PDF_MAGIC  = Buffer.from('%PDF-');

/**
 * Multer instance — single file under the 'attachment' field.
 * SECURITY (SEC-A014): memoryStorage — no disk writes.
 */
export const uploadChatAttachment = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedMime(file.mimetype)) {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: JPEG, PNG, WebP, PDF`));
      return;
    }
    cb(null, true);
  },
}).single('attachment');

/**
 * Validate that the uploaded file's magic bytes match its declared MIME type.
 * SECURITY (SEC-A013): Defeats MIME spoofing — Content-Type is client-controlled.
 *
 * @throws ValidationError if content doesn't match declared type
 */
export function validateAttachmentMagicBytes(file: Express.Multer.File): void {
  const head = file.buffer.subarray(0, 16);
  let valid = false;

  switch (file.mimetype) {
    case 'image/jpeg':
      valid = head.subarray(0, 3).equals(JPEG_MAGIC);
      break;
    case 'image/png':
      valid = head.subarray(0, 4).equals(PNG_MAGIC);
      break;
    case 'image/webp':
      valid =
        head.subarray(0, 4).equals(WEBP_RIFF) &&
        head.subarray(8, 12).equals(WEBP_MARK);
      break;
    case 'application/pdf':
      valid = head.subarray(0, 5).equals(PDF_MAGIC);
      break;
    default:
      valid = false;
  }

  if (!valid) {
    throw new ValidationError(
      'Uploaded file content does not match declared type',
    );
  }
}

/**
 * Enforce the 20-page limit for PDF uploads.
 * Uses a regex count of /Type /Page occurrences as an intentionally coarse
 * upper-bound check — false negatives are acceptable because the real bound
 * is the 10 MB file size cap.
 *
 * SECURITY (SEC-A013): Guards against adversarially large PDFs.
 *
 * @throws ValidationError if PDF exceeds page limit
 */
export function enforcePdfPageLimit(file: Express.Multer.File): void {
  if (file.mimetype !== 'application/pdf') return;

  // Count /Type /Page (not /Pages — that's the parent node) — rough page count
  const text = file.buffer.toString('latin1');
  // Matches /Type /Page not immediately followed by 's' (to exclude /Pages)
  const matches = text.match(/\/Type\s*\/Page(?!s)/g) ?? [];
  if (matches.length > MAX_PDF_PAGES) {
    throw new ValidationError(
      `PDF exceeds the ${MAX_PDF_PAGES}-page limit (found ~${matches.length} pages)`,
    );
  }
}

/**
 * Count PDF pages — returns the same estimate used in enforcePdfPageLimit.
 * Used for observability logging (SEC-A016: only metadata, never content).
 */
export function countPdfPages(file: Express.Multer.File): number | null {
  if (file.mimetype !== 'application/pdf') return null;
  const text = file.buffer.toString('latin1');
  const matches = text.match(/\/Type\s*\/Page(?!s)/g) ?? [];
  return matches.length;
}
