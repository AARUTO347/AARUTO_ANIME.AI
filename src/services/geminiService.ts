import { GoogleGenAI, Type, Modality } from "@google/genai";
import { CharacterDesign, QualityLevel, AppSettings } from "../types";
import { safeJsonParse } from "../lib/safeJson";
import { parseDesignResponse, normalizeStats } from "../lib/design";
import { resolveTier, DETAIL_ENHANCERS, type ResolutionSetting } from "../lib/quality";
import { designUserPrompt, evolveUserPrompt, updateFieldPrompt, oracleUserPrompt, SYSTEM_SENSEI, themeAudioScript, buildImagePrompt } from "../lib/prompts";

export const API_KEY: string | undefined = (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim() || undefined;

export function isGeminiConfigured(): boolean {
  return Boolean(API_KEY);
}

export class MissingApiKeyError extends Error {
  constructor() {
    super('Missing Gemini API key. Set VITE_GEMINI_API_KEY in .env.local (see .env.example).');
    this.name = 'MissingApiKeyError';
  }
}

export interface SenseiTurn {
  role: 'user' | 'model';
  parts: { text: string }[];
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export function extractStatus(err: unknown): number | null {
  const anyErr = err as { status?: unknown; statusCode?: unknown; code?: unknown; response?: { status?: unknown }; message?: unknown } | null;
  const raw = anyErr?.status ?? anyErr?.statusCode ?? anyErr?.response?.status ?? anyErr?.code;
  const n = typeof raw === 'string' ? Number(raw) : raw;
  if (typeof n === 'number' && Number.isFinite(n)) return n;
  // Google-style errors embed the code in the message JSON ("ApiError: {…}").
  if (typeof anyErr?.message === 'string') {
    const brace = anyErr.message.indexOf('{');
    if (brace >= 0) {
      try {
        const parsed = JSON.parse(anyErr.message.slice(brace)) as { error?: { code?: unknown } };
        const code = parsed?.error?.code;
        const codeNum = typeof code === 'string' ? Number(code) : code;
        if (typeof codeNum === 'number' && Number.isFinite(codeNum)) return codeNum;
      } catch {
        /* not JSON — ignore */
      }
    }
  }
  return null;
}

/** True when the error looks like a Gemini rate/quota rejection (HTTP 429 / RESOURCE_EXHAUSTED / free-tier limit 0). */
export function isQuotaError(err: unknown): boolean {
  const text = `${extractErrorMessage(err)} ${err instanceof Error ? err.message : String(err ?? '')}`;
  return /quota|resource_exhausted|429|rate.?limit/i.test(text);
}

export function extractErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) {
    const trimmed = err.message.trim();
    // Google API errors arrive as "ApiError: {...json...}" (or raw JSON).
    // Decode them into a readable one-liner.
    const brace = trimmed.indexOf('{');
    if (brace >= 0) {
      try {
        const parsed = JSON.parse(trimmed.slice(brace)) as {
          error?: { message?: unknown; status?: unknown; code?: unknown };
        };
        const apiMsg = parsed?.error?.message;
        if (typeof apiMsg === 'string' && apiMsg.trim()) {
          const code = typeof parsed.error?.code === 'number' ? parsed.error.code : undefined;
          const status = typeof parsed.error?.status === 'string' ? parsed.error.status : undefined;
          const suffix = [code !== undefined ? `HTTP ${code}` : undefined, status].filter(Boolean).join(' · ');
          return suffix ? `${apiMsg} (${suffix})` : apiMsg;
        }
      } catch {
        // Not JSON — fall through to the raw message.
      }
    }
    return trimmed;
  }
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err) ?? String(err);
  } catch {
    return String(err);
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Retry once (or more) on transient failures; permanent errors throw immediately. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 2, baseDelayMs = 800): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const status = extractStatus(err);
      // Unknown status → could be a network blip → allow retry. 4xx → do not retry.
      const retryable = status === null || RETRYABLE_STATUSES.has(status);
      if (!retryable || attempt === attempts - 1) throw err;
      console.warn(`[gemini] attempt ${attempt + 1} failed (status ${status ?? 'unknown'}), retrying…`);
      await sleep(baseDelayMs * (attempt + 1));
    }
  }
  throw lastError;
}

const DESIGN_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    title: { type: Type.STRING },
    personality: { type: Type.STRING },
    aesthetic: { type: Type.STRING },
    powers: { type: Type.ARRAY, items: { type: Type.STRING } },
    lore: { type: Type.STRING },
    visualTraits: { type: Type.STRING },
    homeworld: { type: Type.STRING },
    evolutionStage: { type: Type.INTEGER },
    stats: {
      type: Type.OBJECT,
      properties: {
        strength: { type: Type.INTEGER },
        agility: { type: Type.INTEGER },
        intelligence: { type: Type.INTEGER },
        stamina: { type: Type.INTEGER },
      },
      required: ["strength", "agility", "intelligence", "stamina"],
    },
  },
  required: ["name", "title", "personality", "aesthetic", "powers", "lore", "visualTraits", "stats", "homeworld", "evolutionStage"],
} as const;

export class GeminiService {
  private getAI(keyOverride?: string): GoogleGenAI {
    const apiKey = keyOverride || API_KEY;
    if (!apiKey) throw new MissingApiKeyError();
    return new GoogleGenAI({ apiKey });
  }

  /**
   * Cheap diagnostics call: 1-token ping against the model this app uses.
   * Returns null when the key works, or the extracted error message when it doesn't.
   */
  async testConnection(): Promise<string | null> {
    try {
      const ai = this.getAI();
      await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: 'ping',
        config: { maxOutputTokens: 1 },
      });
      return null;
    } catch (err) {
      return extractErrorMessage(err);
    }
  }

  async generateDesign(prompt: string): Promise<CharacterDesign> {
    const ai = this.getAI();
    const response = await withRetry(() =>
      ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: designUserPrompt(prompt),
        config: {
          responseMimeType: "application/json",
          responseSchema: DESIGN_SCHEMA,
        },
      })
    );
    return parseDesignResponse(response.text, 'Design generation');
  }

  async evolveDesign(current: CharacterDesign): Promise<CharacterDesign> {
    const ai = this.getAI();
    const response = await withRetry(() =>
      ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: evolveUserPrompt(current),
        config: {
          responseMimeType: "application/json",
          responseSchema: DESIGN_SCHEMA,
        },
      })
    );
    const evolved = parseDesignResponse(response.text, 'Evolution');
    // Never trust the model to increment exactly — enforce monotonic growth.
    evolved.evolutionStage = Math.max(current.evolutionStage + 1, evolved.evolutionStage);
    return evolved;
  }

  async generateImage(
    design: CharacterDesign,
    quality: QualityLevel,
    settings: AppSettings,
    type: 'character' | 'environment' = 'character',
  ): Promise<string> {
    const ai = this.getAI();
    const tier = resolveTier(quality, (settings.resolution ?? '1024') as ResolutionSetting);
    const aspectRatio = type === 'character' ? '3:4' : '16:9';
    const detail = DETAIL_ENHANCERS[tier.detail];
    const finalPrompt = buildImagePrompt(design, settings, type, detail);

    const attempt = async (model: string, imageSize?: '1K' | '2K' | '4K'): Promise<string> => {
      const imageConfig: Record<string, string> = { aspectRatio };
      if (imageSize) imageConfig.imageSize = imageSize;

      const response = await ai.models.generateContent({
        model,
        contents: { parts: [{ text: finalPrompt }] },
        config: { imageConfig },
      });

      const parts = response.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (part.inlineData?.data) {
          const mime = part.inlineData.mimeType ?? 'image/png';
          return `data:${mime};base64,${part.inlineData.data}`;
        }
      }
      throw new Error('Materialization failed. The void did not respond with an image.');
    };

    try {
      return await withRetry(() => attempt(tier.model, tier.imageSize));
    } catch (err) {
      if (tier.fallbackModel) {
        console.warn(`[gemini] ${tier.model} unavailable, falling back to ${tier.fallbackModel}`, err);
        return withRetry(() => attempt(tier.fallbackModel as string));
      }
      throw err;
    }
  }

  async generateThemeAudio(design: CharacterDesign): Promise<string> {
    const ai = this.getAI();
    const response = await withRetry(() =>
      ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: themeAudioScript(design) }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      })
    );

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error('Audio resonance failed — no audio data returned.');
    return base64Audio;
  }

  async updateField(design: CharacterDesign, field: keyof CharacterDesign): Promise<unknown> {
    const ai = this.getAI();
    const isPowerList = field === 'powers';
    const isStats = field === 'stats';
    const response = await withRetry(() =>
      ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: updateFieldPrompt(design, String(field)),
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              newValue: isPowerList
                ? { type: Type.ARRAY, items: { type: Type.STRING } }
                : isStats
                  ? {
                      type: Type.OBJECT,
                      properties: {
                        strength: { type: Type.INTEGER },
                        agility: { type: Type.INTEGER },
                        intelligence: { type: Type.INTEGER },
                        stamina: { type: Type.INTEGER },
                      },
                    }
                  : { type: Type.STRING },
            },
            required: ["newValue"],
          },
        },
      })
    );
    const parsed = safeJsonParse<{ newValue?: unknown }>(response.text, `Re-roll of "${String(field)}"`);
    if (parsed.newValue === undefined) {
      throw new Error(`Re-roll of "${String(field)}" returned no value.`);
    }
    // Clamp stats defensively — the model sometimes returns out-of-range numbers.
    if (isStats) return normalizeStats(parsed.newValue);
    if (isPowerList && !Array.isArray(parsed.newValue)) {
      throw new Error('Re-roll of "powers" did not return a list.');
    }
    return parsed.newValue;
  }

  async loreChat(design: CharacterDesign, userQuestion: string): Promise<string> {
    const ai = this.getAI();
    const response = await withRetry(() =>
      ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: oracleUserPrompt(design, userQuestion),
      })
    );
    const text = response.text?.trim();
    if (!text) throw new Error('Oracle returned an empty response. Try again.');
    return text;
  }

  async senseiAdvice(history: SenseiTurn[]): Promise<string> {
    const ai = this.getAI();
    const response = await withRetry(() =>
      ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: history,
        config: {
          systemInstruction: SYSTEM_SENSEI,
        },
      })
    );
    const text = response.text?.trim();
    if (!text) throw new Error('Sensei returned an empty response. Try again.');
    return text;
  }
}
