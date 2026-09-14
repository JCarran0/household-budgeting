/**
 * Attachment state for the chat composer: pick, validate, preview, clear.
 *
 * Extracted from ChatOverlay to keep that file inside its line budget, and
 * because this is genuinely one concern with one rule that must not be stated
 * twice: a file arriving through the paperclip and a file arriving through the
 * Web Share Target are the same file as far as validation goes. They used to be
 * two copies of the same three checks, which is one edit away from a share
 * target that accepts what the picker rejects.
 *
 * Client-side validation is a courtesy, not a control — the server re-checks
 * type and size on every upload (SEC-A014). What it buys is a clear message
 * instead of a 400.
 */
import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { notifications } from '@mantine/notifications';

/** MIME types accepted by the paperclip picker */
export const ALLOWED_CLIENT_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB

function isHeic(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    name.endsWith('.heic') ||
    name.endsWith('.heif')
  );
}

/**
 * Returns the reason a file is unusable, or null when it is fine. HEIC is
 * called out separately because "unsupported file type" is useless advice for
 * the format an iPhone produces by default.
 */
export function rejectionReason(file: File, shared = false): string | null {
  if (isHeic(file)) {
    return shared
      ? 'HEIC photos are not supported. Convert to JPEG and try again.'
      : 'HEIC photos are not supported. On iOS, go to Settings → Camera → Formats → Most Compatible, then try again.';
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return shared ? 'Shared file too large (10 MB max).' : 'File too large (10 MB max).';
  }
  if (!ALLOWED_CLIENT_MIMES.has(file.type)) {
    return shared
      ? 'Shared file type not supported. Accepted: JPEG, PNG, WebP, PDF.'
      : 'Unsupported file type. Accepted: JPEG, PNG, WebP, PDF.';
  }
  return null;
}

export function useChatAttachment(args: {
  /** A file piped in from the Web Share Target, consumed once. */
  initialAttachment?: File | null;
  onInitialAttachmentConsumed?: () => void;
}) {
  const { initialAttachment, onInitialAttachmentConsumed } = args;
  const [attachment, setAttachment] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Object URLs are revoked when the file changes or the overlay unmounts;
  // holding them would pin every attachment of the session in memory.
  useEffect(() => {
    if (!attachment) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(attachment);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [attachment]);

  const handleFilePick = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the input so the same file can be re-picked after removal.
    e.target.value = '';
    if (!file) return;

    const reason = rejectionReason(file);
    if (reason) {
      notifications.show({ color: isHeic(file) ? 'orange' : 'red', message: reason });
      return;
    }
    setAttachment(file);
  }, []);

  useEffect(() => {
    if (!initialAttachment) return;

    const reason = rejectionReason(initialAttachment, true);
    if (reason) {
      notifications.show({ color: 'orange', message: reason });
    } else {
      setAttachment(initialAttachment);
    }
    onInitialAttachmentConsumed?.();
  }, [initialAttachment, onInitialAttachmentConsumed]);

  return { attachment, setAttachment, previewUrl, handleFilePick };
}
