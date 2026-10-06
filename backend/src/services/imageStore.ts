/**
 * Image Store
 *
 * Generic storage for uploaded images, owned by whatever record attaches them
 * (wishlist items today; tasks are the expected next owner). Owners hold an
 * `ImageRef`; the bytes live here under `images/{familyId}/{imageId}`.
 *
 * What this module guarantees, so no owner can get it subtly wrong:
 *  - every stored image is a real JPEG/PNG/WebP (magic bytes, not the
 *    client-declared type), within IMAGE_UPLOAD_LIMITS.maxBytes, and has had
 *    its embedded metadata — GPS included — stripped (`imageMetadata.ts`);
 *  - an image is only ever read under the caller's familyId, so an id guessed
 *    or leaked from another household resolves to nothing;
 *  - ids are server-generated UUIDs and are validated before they reach a
 *    storage key, so no request can address a path of its choosing.
 *
 * What owners are responsible for: deleting an image when the owning record
 * drops it or is deleted. The owner type/id are recorded as object metadata so
 * a future orphan sweep can find anything an owner forgot.
 *
 * Not reachable by the chatbot: this sits on `BinaryObjectStore`, which
 * `ReadOnlyDataService` does not expose.
 */

import { v4 as uuidv4, validate as isUuid } from 'uuid';
import type { ImageRef } from '../shared/types';
import { IMAGE_UPLOAD_LIMITS } from '../shared/types';
import type { BinaryObjectStore } from './storage';
import { ValidationError } from '../errors';
import { isImageMimeType, matchesImageSignature } from '../utils/imageSignatures';
import { stripImageMetadata } from '../utils/imageMetadata';

/** Which kind of record an image belongs to. Extend as owners are added. */
export type ImageOwnerType = 'wishlist';

export interface ImageUpload {
  buffer: Buffer;
  /** Client-declared; verified against the magic bytes before use. */
  mimeType: string;
}

export class ImageStore {
  constructor(private store: BinaryObjectStore) {}

  private key(familyId: string, imageId: string): string {
    // familyId comes from the verified JWT; imageId must be one we minted.
    if (!isUuid(imageId)) throw new ValidationError('Invalid image id');
    if (!/^[A-Za-z0-9_-]+$/.test(familyId)) throw new ValidationError('Invalid family id');
    return `images/${familyId}/${imageId}`;
  }

  /**
   * Validate, strip and store an upload. Returns the ref the owner persists.
   *
   * @throws ValidationError for an unsupported type, a type/content mismatch,
   *   an oversized file, or a file whose structure cannot be parsed
   */
  async put(
    familyId: string,
    upload: ImageUpload,
    owner: { type: ImageOwnerType; id: string }
  ): Promise<ImageRef> {
    const { mimeType } = upload;
    if (!isImageMimeType(mimeType)) {
      throw new ValidationError('Unsupported image type. Allowed: JPEG, PNG, WebP');
    }
    if (upload.buffer.length > IMAGE_UPLOAD_LIMITS.maxBytes) {
      throw new ValidationError('Image is larger than 5 MB');
    }
    if (!matchesImageSignature(upload.buffer, mimeType)) {
      throw new ValidationError('Uploaded file content does not match declared type');
    }

    const body = stripImageMetadata(upload.buffer, mimeType);
    const ref: ImageRef = {
      id: uuidv4(),
      mimeType,
      size: body.length,
      uploadedAt: new Date().toISOString(),
    };

    await this.store.putObject(this.key(familyId, ref.id), body, {
      contentType: mimeType,
      metadata: { 'family-id': familyId, 'owner-type': owner.type, 'owner-id': owner.id },
    });
    return ref;
  }

  /** Null when no such image exists in this family. */
  async get(familyId: string, imageId: string): Promise<{ body: Buffer; mimeType: string } | null> {
    if (!isUuid(imageId)) return null;
    const object = await this.store.getObject(this.key(familyId, imageId));
    if (!object) return null;
    return { body: object.body, mimeType: object.contentType };
  }

  async delete(familyId: string, imageId: string): Promise<void> {
    await this.store.deleteObject(this.key(familyId, imageId));
  }
}
