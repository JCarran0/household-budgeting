import { USER_COLOR_PALETTE, type UserColor } from '../../../shared/types';

export { USER_COLOR_PALETTE };
export type { UserColor };

interface UserLike {
  id?: string;
  userId?: string;
  color?: string;
}

/**
 * Pick a visual-identity color for a user. Returns the user's chosen color if
 * set, otherwise a deterministic fallback derived from their id so both J-named
 * users look different on day one without any configuration.
 */
export function userColor(user: UserLike | null | undefined): UserColor {
  const explicit = user?.color;
  if (isUserColor(explicit)) return explicit;

  const id = user?.id ?? user?.userId ?? '';
  return hashToPalette(id);
}

function isUserColor(value: unknown): value is UserColor {
  return typeof value === 'string' && (USER_COLOR_PALETTE as readonly string[]).includes(value);
}

function hashToPalette(id: string): UserColor {
  if (!id) return USER_COLOR_PALETTE[0];
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(h) % USER_COLOR_PALETTE.length;
  return USER_COLOR_PALETTE[idx];
}
