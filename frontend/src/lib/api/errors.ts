import axios from 'axios';

const DEFAULT_FALLBACK = 'An unexpected error occurred';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readResponseString(error: unknown, field: 'error' | 'message'): string | undefined {
  if (!isRecord(error)) return undefined;
  const response = error.response;
  if (!isRecord(response)) return undefined;
  const data = response.data;
  if (!isRecord(data)) return undefined;
  const value = data[field];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

// Extracts a human-readable message from an API error of unknown shape.
// Priority: axios response body `error` → axios response body `message` →
// Error.message → string error → fallback. Use this at every catch site
// that wants to show a notification — do not reinvent the cast chain.
export function getApiErrorMessage(error: unknown, fallback: string = DEFAULT_FALLBACK): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (isRecord(data)) {
      if (typeof data.error === 'string' && data.error.length > 0) return data.error;
      if (typeof data.message === 'string' && data.message.length > 0) return data.message;
    }
    if (error.message) return error.message;
    return fallback;
  }

  const fromErrorField = readResponseString(error, 'error');
  if (fromErrorField) return fromErrorField;
  const fromMessageField = readResponseString(error, 'message');
  if (fromMessageField) return fromMessageField;

  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.length > 0) return error;
  if (isRecord(error) && typeof error.message === 'string' && error.message.length > 0) {
    return error.message;
  }
  return fallback;
}

// Extracts an HTTP status code from an API error of unknown shape.
// Returns undefined when the error is not an HTTP response (network error,
// thrown Error, etc.). Use for branches like 401/404/429 handling.
export function getApiErrorStatus(error: unknown): number | undefined {
  if (axios.isAxiosError(error)) {
    return error.response?.status;
  }
  if (isRecord(error)) {
    const response = error.response;
    if (isRecord(response) && typeof response.status === 'number') {
      return response.status;
    }
  }
  return undefined;
}
