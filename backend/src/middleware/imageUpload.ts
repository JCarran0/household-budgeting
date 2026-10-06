/**
 * Image Upload Middleware
 *
 * Multer parsing for a single image under the `image` field, for any route
 * that attaches a stored image (see imageStore.ts). Memory storage only: the
 * buffer is validated and stripped by `ImageStore.put` before anything is
 * written, so an unvalidated upload never touches disk or S3.
 *
 * Multer's own limit is a cheap early cut-off; `ImageStore.put` re-checks
 * size, type and magic bytes regardless of how the bytes arrived.
 */

import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { IMAGE_UPLOAD_LIMITS } from '../shared/types';
import { isImageMimeType } from '../utils/imageSignatures';

const parseSingleImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMAGE_UPLOAD_LIMITS.maxBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!isImageMimeType(file.mimetype)) {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: JPEG, PNG, WebP`));
      return;
    }
    cb(null, true);
  },
}).single('image');

/** Parse one image upload, answering 400 for any parse/limit failure. */
export function uploadSingleImage(req: Request, res: Response, next: NextFunction): void {
  parseSingleImage(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    const message =
      err instanceof multer.MulterError
        ? err.code === 'LIMIT_FILE_SIZE'
          ? 'Image is larger than 5 MB'
          : `Upload error: ${err.message}`
        : err instanceof Error
          ? err.message
          : 'Upload failed';
    res.status(400).json({ success: false, error: message });
  });
}
