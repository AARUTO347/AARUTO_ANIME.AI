import type { QualityLevel } from '../types';

export type ImageSize = '1K' | '2K' | '4K';
export type ResolutionSetting = '512' | '1024' | '2048';
export type PromptDetail = 'standard' | 'high' | 'master';

export interface ResolvedTier {
  /** Primary model to call. */
  model: string;
  /** Model to retry with when the primary model is unavailable (e.g. JONIN without pro-image access). */
  fallbackModel?: string;
  /** imageSize passed to the pro image model, when supported. */
  imageSize?: ImageSize;
  /** How much prompt enhancer to apply. */
  detail: PromptDetail;
  /** Human-readable summary used in tooltips / docs. */
  description: string;
}

/**
 * Maps the in-app quality tiers (GENIN / CHUNIN / JONIN) onto concrete
 * Gemini image models and settings.
 *
 * - GENIN  → gemini-2.5-flash-image, fast + standard detail
 * - CHUNIN → gemini-2.5-flash-image, high-detail enhancer
 * - JONIN  → gemini-3-pro-image-preview @ 1K/2K (1024-class presets → 1K,
 *            2048 → 2K); automatically falls back to flash-image when the
 *            pro model is unavailable for the key in use.
 * - 512px  → served by flash-image (the pro model has no sub-1K size).
 */
export function resolveTier(quality: QualityLevel, resolution: ResolutionSetting): ResolvedTier {
  if (quality === 'JONIN' && resolution !== '512') {
    return {
      model: 'gemini-3-pro-image-preview',
      fallbackModel: 'gemini-2.5-flash-image',
      imageSize: resolution === '2048' ? '2K' : '1K',
      detail: 'master',
      description:
        resolution === '2048'
          ? 'JONIN · pro model · 2K output'
          : 'JONIN · pro model · 1K output',
    };
  }
  if (quality === 'CHUNIN' || quality === 'JONIN') {
    return {
      model: 'gemini-2.5-flash-image',
      detail: 'high',
      description: quality === 'JONIN'
        ? 'JONIN · flash model (512px has no pro size) · high detail'
        : 'CHUNIN · flash model · high detail',
    };
  }
  return {
    model: 'gemini-2.5-flash-image',
    detail: 'standard',
    description: 'GENIN · flash model · fast',
  };
}

/** Detail-level prompt enhancers appended to the image prompt. */
export const DETAIL_ENHANCERS: Record<PromptDetail, string> = {
  standard:
    'clean composition, bold colors, sharp focus.',
  high:
    'intricate details, crisp linework, rich textures, cinematic lighting, volumetric atmosphere.',
  master:
    'masterpiece, top-tier quality, hyper intricate detail, award-winning illustration, 8k resolution, cinematic lighting, volumetric fog, trending on artstation and pixiv.',
};
