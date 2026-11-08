import { describe, it, expect } from 'vitest';
import { resolveTier, DETAIL_ENHANCERS } from './quality';

describe('resolveTier', () => {
  it('GENIN → fast flash model, standard detail, no imageSize', () => {
    const tier = resolveTier('GENIN', '1024');
    expect(tier.model).toBe('gemini-2.5-flash-image');
    expect(tier.detail).toBe('standard');
    expect(tier.imageSize).toBeUndefined();
    expect(tier.fallbackModel).toBeUndefined();
  });

  it('CHUNIN → flash model with high-detail enhancer', () => {
    const tier = resolveTier('CHUNIN', '2048');
    expect(tier.model).toBe('gemini-2.5-flash-image');
    expect(tier.detail).toBe('high');
    expect(tier.imageSize).toBeUndefined();
  });

  it('JONIN at 1024 → pro model 1K with flash fallback', () => {
    const tier = resolveTier('JONIN', '1024');
    expect(tier.model).toBe('gemini-3-pro-image-preview');
    expect(tier.imageSize).toBe('1K');
    expect(tier.fallbackModel).toBe('gemini-2.5-flash-image');
    expect(tier.detail).toBe('master');
  });

  it('JONIN at 2048 → pro model 2K', () => {
    expect(resolveTier('JONIN', '2048').imageSize).toBe('2K');
  });

  it('JONIN at 512 → flash model (no sub-1K pro size)', () => {
    const tier = resolveTier('JONIN', '512');
    expect(tier.model).toBe('gemini-2.5-flash-image');
    expect(tier.imageSize).toBeUndefined();
  });

  it('every tier resolves to a known detail enhancer', () => {
    for (const quality of ['GENIN', 'CHUNIN', 'JONIN'] as const) {
      for (const resolution of ['512', '1024', '2048'] as const) {
        const tier = resolveTier(quality, resolution);
        expect(DETAIL_ENHANCERS[tier.detail]).toBeTruthy();
        expect(tier.description.length).toBeGreaterThan(0);
      }
    }
  });
});
