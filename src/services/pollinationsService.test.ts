import { describe, it, expect } from 'vitest';
import { dimensions } from './pollinationsService';

describe('dimensions', () => {
  it('character images are intimate at 512px, and 2MP portrait at 1024px/2048px', () => {
    expect(dimensions('character', '512')).toEqual({ width: 512, height: 683 });
    expect(dimensions('character', '1024')).toEqual({ width: 1280, height: 1706 });
    expect(dimensions('character', '2048')).toEqual({ width: 1280, height: 1706 });
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

  it('512px stays below the free-tier pixel budget; higher tiers go big', () => {
    const { width: w512, height: h512 } = dimensions('character', '512');
    const { width: w1024, height: h1024 } = dimensions('character', '1024');
    expect(w512 * h512).toBeLessThan(w1024 * h1024);
  });
});
