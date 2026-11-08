import { describe, it, expect } from 'vitest';
import { dimensions } from './pollinationsService';

describe('dimensions', () => {
  it('character images are 3:4 at each resolution tier', () => {
    expect(dimensions('character', '512')).toEqual({ width: 512, height: 683 });
    expect(dimensions('character', '1024')).toEqual({ width: 768, height: 1024 });
    expect(dimensions('character', '2048')).toEqual({ width: 1024, height: 1365 });
  });

  it('environment images are 16:9 and resolution-independent', () => {
    expect(dimensions('environment', '512')).toEqual({ width: 1280, height: 720 });
    expect(dimensions('environment', '1024')).toEqual({ width: 1280, height: 720 });
    expect(dimensions('environment', '2048')).toEqual({ width: 1280, height: 720 });
  });

  it('character ratios stay 3:4 within rounding', () => {
    for (const res of ['512', '1024', '2048'] as const) {
      const { width, height } = dimensions('character', res);
      expect(height / width).toBeGreaterThanOrEqual(1.32);
      expect(height / width).toBeLessThanOrEqual(1.34);
    }
  });
});
