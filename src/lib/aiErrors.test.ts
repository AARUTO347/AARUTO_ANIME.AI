import { describe, it, expect } from 'vitest';
import { extractErrorMessage, isQuotaError } from './aiErrors';

describe('extractErrorMessage', () => {
  it('decodes an ApiError-wrapped Google JSON error', () => {
    const err = new Error('ApiError: {"error":{"code":401,"message":"API key not valid. Please pass a valid API key.","status":"UNAUTHENTICATED"}}');
    expect(extractErrorMessage(err)).toBe('API key not valid. Please pass a valid API key. (HTTP 401 · UNAUTHENTICATED)');
  });

  it('decodes a raw JSON Google error without an ApiError prefix', () => {
    const err = new Error('{"error":{"code":429,"message":"Quota exceeded.","status":"RESOURCE_EXHAUSTED"}}');
    expect(extractErrorMessage(err)).toBe('Quota exceeded. (HTTP 429 · RESOURCE_EXHAUSTED)');
  });

  it('omits the suffix when code/status are missing', () => {
    const err = new Error('{"error":{"message":"Something broke"}}');
    expect(extractErrorMessage(err)).toBe('Something broke');
  });

  it('passes through plain messages and strings', () => {
    expect(extractErrorMessage(new Error('boom'))).toBe('boom');
    expect(extractErrorMessage('network down')).toBe('network down');
  });

  it('handles odd payloads without crashing', () => {
    expect(typeof extractErrorMessage({ weird: true })).toBe('string');
    expect(typeof extractErrorMessage(undefined)).toBe('string');
    expect(typeof extractErrorMessage(new Error('{"not": "an api error", "error": 42}'))).toBe('string');
  });
});

describe('isQuotaError', () => {
  it('detects 429 / RESOURCE_EXHAUSTED / quota messages', () => {
    expect(isQuotaError(new Error('ApiError: {"error":{"code":429,"message":"You exceeded your current quota","status":"RESOURCE_EXHAUSTED"}}'))).toBe(true);
    expect(isQuotaError(new Error('Quota exceeded for metric: generate_content_free_tier_requests, limit: 0'))).toBe(true);
    expect(isQuotaError(new Error('rate limit hit'))).toBe(true);
  });
  it('does not flag unrelated errors', () => {
    expect(isQuotaError(new Error('boom'))).toBe(false);
    expect(isQuotaError(new Error('API key not valid. Please pass a valid API key. (HTTP 401 · UNAUTHENTICATED)'))).toBe(false);
    expect(isQuotaError('network down')).toBe(false);
  });
});
