import { describe, it, expect } from 'vitest';
import { shouldFallbackToGroq } from './aiFallback';

const apiError = (code: number, status: string, message = 'boom') =>
  new Error(`ApiError: {"error":{"code":${code},"message":"${message}","status":"${status}"}}`);

describe('shouldFallbackToGroq', () => {
  it('falls back on quota exhaustion (429)', () => {
    expect(shouldFallbackToGroq(apiError(429, 'RESOURCE_EXHAUSTED', 'You exceeded your current quota'))).toBe(true);
  });

  it('falls back on auth rejection (401)', () => {
    expect(shouldFallbackToGroq(apiError(401, 'UNAUTHENTICATED', 'API key not valid'))).toBe(true);
  });

  it('falls back on server errors (5xx)', () => {
    expect(shouldFallbackToGroq(apiError(503, 'UNAVAILABLE'))).toBe(true);
    expect(shouldFallbackToGroq(apiError(500, 'INTERNAL'))).toBe(true);
  });

  it('falls back on network/unknown errors', () => {
    expect(shouldFallbackToGroq(new Error('fetch failed'))).toBe(true);
    expect(shouldFallbackToGroq(undefined)).toBe(true);
  });

  it('does NOT fall back on client errors (400/403/404)', () => {
    expect(shouldFallbackToGroq(apiError(400, 'INVALID_ARGUMENT'))).toBe(false);
    expect(shouldFallbackToGroq(apiError(403, 'PERMISSION_DENIED'))).toBe(false);
    expect(shouldFallbackToGroq(apiError(404, 'NOT_FOUND'))).toBe(false);
  });
});
