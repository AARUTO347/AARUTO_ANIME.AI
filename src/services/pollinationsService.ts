import { CharacterDesign, AppSettings, QualityLevel } from '../types';
import { buildImagePrompt, type ImagePromptType } from '../lib/prompts';
import { DETAIL_ENHANCERS } from '../lib/prompts';
import { extractErrorMessage } from '../lib/aiErrors';
import { arrayBufferToBase64 } from '../lib/bytes';

export const POLLINATIONS_API_KEY: string | undefined =
  (import.meta.env.VITE_POLLINATIONS_API_KEY as string | undefined)?.trim() || undefined;

const POLLINATIONS_BASE = 'https://image.pollinations.ai/prompt';
const MODEL = 'flux';
const REQUEST_TIMEOUT_MS = 90_000;
const MAX_ATTEMPTS = 2;

export function isPollinationsConfigured(): boolean {
  return Boolean(POLLINATIONS_API_KEY);
}

/** Image dimensions tuned per tier and resolution setting (free-tier budget aware). */
export function dimensions(type: ImagePromptType, resolution: '512' | '1024' | '2048'): { width: number; height: number } {
  if (type === 'environment') return { width: 1280, height: 720 };
  if (resolution === '512') return { width: 512, height: 683 };
  if (resolution === '2048') return { width: 1280, height: 1706 };
  // Default (1024): JONIN target — big portrait that flux-schnell/sana render beautifully on free tier.
  return { width: 1280, height: 1706 };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const hashString = (input: string): number => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const detailFor = (quality: QualityLevel): string =>
  quality === 'JONIN' ? DETAIL_ENHANCERS.master : quality === 'CHUNIN' ? DETAIL_ENHANCERS.high : DETAIL_ENHANCERS.standard;

// JONIN warrants the extra render quality — enhance=true boosts flux prompt adherence.
const enhanceFor = (quality: QualityLevel): boolean => quality === 'JONIN';

/**
 * Render an image with Pollinations (free hosted flux).
 * Uses the key when configured; otherwise attempts anonymous access.
 * Returns a data URL. Throws with a readable message on failure so the
 * caller can fall back to the next provider or the Spectral Sketch.
 */
export async function generatePollinationsImage(
  design: CharacterDesign,
  quality: QualityLevel,
  settings: AppSettings,
  type: ImagePromptType = 'character',
): Promise<string> {
  // JONIN renders at full tilt (2048-class) regardless of the resolution dropdown;
  // GENIN/CHUNIN respect the user's resolution setting.
  const sizeResolution = quality === 'JONIN' ? '2048' : (settings.resolution ?? '1024');
  const { width, height } = dimensions(type, sizeResolution);
  const prompt = buildImagePrompt(design, settings, type, detailFor(quality));
  const params = new URLSearchParams({
    width: String(width),
    height: String(height),
    model: MODEL,
    nologo: 'true',
    referrer: 'aaruto_anime_ai',
  });
  if (enhanceFor(quality)) params.set('enhance', 'true');
  // Deterministic seed from character identity — same character, same face, every render.
  const seed = hashString(`${design.name}|${design.visualTraits.slice(0, 80)}|${design.stats.agility}`) % 100000;
  params.set('seed', String(seed));
  const url = `${POLLINATIONS_BASE}/${encodeURIComponent(prompt)}?${params}`;

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const headers: Record<string, string> = {};
      if (POLLINATIONS_API_KEY) headers.Authorization = `Bearer ${POLLINATIONS_API_KEY}`;
      const res = await fetch(url, { headers, signal: controller.signal });
      if (!res.ok) {
        // If the key was rejected, retry once anonymously before giving up.
        if (attempt === 0 && POLLINATIONS_API_KEY && (res.status === 401 || res.status === 403)) {
          console.warn('[pollinations] key rejected — retrying anonymously');
          const anon = await fetch(url, { signal: controller.signal });
          if (anon.ok && (anon.headers.get('content-type') ?? '').startsWith('image/')) {
            const buf = await anon.arrayBuffer();
            return `data:${anon.headers.get('content-type') ?? 'image/jpeg'};base64,${arrayBufferToBase64(buf)}`;
          }
        }
        const body = await res.text().catch(() => '');
        let message = `Pollinations failed (HTTP ${res.status}).`;
        try {
          const parsed = JSON.parse(body) as { error?: { message?: string } };
          if (typeof parsed?.error?.message === 'string') message = `Pollinations: ${parsed.error.message}`;
        } catch {
          /* keep default message */
        }
        throw new Error(message);
      }
      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.startsWith('image/')) {
        throw new Error(`Pollinations returned ${contentType || 'an unexpected content type'} instead of an image.`);
      }
      const buf = await res.arrayBuffer();
      return `data:${contentType};base64,${arrayBufferToBase64(buf)}`;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(extractErrorMessage(err));
      const abortish = lastError.name === 'AbortError';
      const transient = abortish || /HTTP 5\d\d|429|fetch failed|network/i.test(lastError.message);
      if (!transient || attempt === MAX_ATTEMPTS - 1) break;
      console.warn('[pollinations] transient failure, retrying in 2.5s…', lastError.message);
      await sleep(2500);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new Error('Pollinations failed.');
}
