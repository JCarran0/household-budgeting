import { describe, it, expect } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import { getApiErrorMessage, getApiErrorStatus } from './errors';

function makeAxiosError(status: number, data: unknown, message = 'Request failed'): AxiosError {
  const err = new AxiosError(
    message,
    String(status),
    undefined,
    null,
    {
      status,
      statusText: '',
      data,
      headers: {},
      config: { headers: new AxiosHeaders() },
    },
  );
  return err;
}

describe('getApiErrorMessage', () => {
  it('returns response.data.error for axios errors', () => {
    const err = makeAxiosError(400, { error: 'Budget already exists' });
    expect(getApiErrorMessage(err)).toBe('Budget already exists');
  });

  it('falls back to response.data.message when data.error is absent', () => {
    const err = makeAxiosError(500, { message: 'Internal server error' });
    expect(getApiErrorMessage(err)).toBe('Internal server error');
  });

  it('falls back to axios error.message when response body has neither field', () => {
    const err = makeAxiosError(502, {}, 'Network Error');
    expect(getApiErrorMessage(err)).toBe('Network Error');
  });

  it('returns fallback when axios response is empty and message is empty', () => {
    const err = makeAxiosError(504, {}, '');
    expect(getApiErrorMessage(err, 'Timed out')).toBe('Timed out');
  });

  it('reads duck-typed { response: { data: { error } } } shapes from non-axios errors', () => {
    const err = { response: { data: { error: 'Nope' } } };
    expect(getApiErrorMessage(err)).toBe('Nope');
  });

  it('reads duck-typed { response: { data: { message } } } shapes from non-axios errors', () => {
    const err = { response: { data: { message: 'Also nope' } } };
    expect(getApiErrorMessage(err)).toBe('Also nope');
  });

  it('extracts Error.message for plain Errors', () => {
    expect(getApiErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('returns a string error as-is', () => {
    expect(getApiErrorMessage('string error')).toBe('string error');
  });

  it('reads a plain { message } object', () => {
    expect(getApiErrorMessage({ message: 'bare message' })).toBe('bare message');
  });

  it('returns the default fallback for null/undefined', () => {
    expect(getApiErrorMessage(null)).toBe('An unexpected error occurred');
    expect(getApiErrorMessage(undefined)).toBe('An unexpected error occurred');
  });

  it('returns a caller-supplied fallback when nothing else matches', () => {
    expect(getApiErrorMessage({}, 'Failed to save')).toBe('Failed to save');
  });

  it('ignores empty strings in response.data.error and falls through', () => {
    const err = makeAxiosError(400, { error: '', message: 'Use me' });
    expect(getApiErrorMessage(err)).toBe('Use me');
  });
});

describe('getApiErrorStatus', () => {
  it('returns the status from an axios error', () => {
    expect(getApiErrorStatus(makeAxiosError(404, {}))).toBe(404);
  });

  it('returns the status from a duck-typed error', () => {
    expect(getApiErrorStatus({ response: { status: 429 } })).toBe(429);
  });

  it('returns undefined for Error without a response', () => {
    expect(getApiErrorStatus(new Error('net down'))).toBeUndefined();
  });

  it('returns undefined for unknown shapes', () => {
    expect(getApiErrorStatus(null)).toBeUndefined();
    expect(getApiErrorStatus('string')).toBeUndefined();
    expect(getApiErrorStatus({ response: {} })).toBeUndefined();
  });
});
