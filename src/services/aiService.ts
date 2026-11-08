import { CharacterDesign, QualityLevel, AppSettings } from '../types';
import { GeminiService, isGeminiConfigured, extractErrorMessage } from './geminiService';
import { GroqService, isGroqConfigured } from './groqService';
import { generatePollinationsImage, isPollinationsConfigured } from './pollinationsService';
import { shouldFallbackToGroq } from '../lib/aiFallback';

export interface ConnectionDiagnostic {
  gemini: { ok: boolean; detail: string };
  groq: { configured: boolean; ok: boolean; detail: string };
  pollinations: { configured: boolean; detail: string };
}

/**
 * Unified AI facade used by the UI.
 *
 * - TEXT calls (design/evolve/re-roll/oracle/sensei): Gemini first; on quota,
 *   auth, server or network failure — and automatically when only a Groq key
 *   is set — they route to Groq's free, fast Llama models instead.
 * - IMAGE and AUDIO calls remain Gemini-only (Groq has no image models, and
 *   Gemini TTS already works on the free tier).
 */
export class AiService {
  private gemini = new GeminiService();
  private groq = new GroqService();

  private async withTextFallback<T>(geminiCall: () => Promise<T>, groqCall: () => Promise<T>): Promise<T> {
    if (!isGeminiConfigured() && isGroqConfigured()) {
      console.warn('[ai] Gemini key missing — text generation via Groq.');
      return groqCall();
    }
    try {
      return await geminiCall();
    } catch (err) {
      if (isGroqConfigured() && shouldFallbackToGroq(err)) {
        console.warn(`[ai] Gemini failed (${extractErrorMessage(err)}) — falling back to Groq.`);
        return groqCall();
      }
      throw err;
    }
  }

  generateDesign(prompt: string): Promise<CharacterDesign> {
    return this.withTextFallback(() => this.gemini.generateDesign(prompt), () => this.groq.generateDesign(prompt));
  }

  evolveDesign(current: CharacterDesign): Promise<CharacterDesign> {
    return this.withTextFallback(() => this.gemini.evolveDesign(current), () => this.groq.evolveDesign(current));
  }

  updateField(design: CharacterDesign, field: keyof CharacterDesign): Promise<unknown> {
    return this.withTextFallback(() => this.gemini.updateField(design, field), () => this.groq.updateField(design, field));
  }

  loreChat(design: CharacterDesign, userQuestion: string): Promise<string> {
    return this.withTextFallback(() => this.gemini.loreChat(design, userQuestion), () => this.groq.loreChat(design, userQuestion));
  }

  senseiAdvice(history: Array<{ role: 'user' | 'model'; parts: { text: string }[] }>): Promise<string> {
    return this.withTextFallback(() => this.gemini.senseiAdvice(history), () => this.groq.senseiAdvice(history));
  }

  /**
   * Image chain: Gemini (paid/fast, tier-aware) → Pollinations (free hosted flux)
   * → throw, letting the UI manifest a Spectral Sketch. Groq has no image models.
   */
  async generateImage(
    design: CharacterDesign,
    quality: QualityLevel,
    settings: AppSettings,
    type: 'character' | 'environment' = 'character',
  ): Promise<string> {
    try {
      return await this.gemini.generateImage(design, quality, settings, type);
    } catch (geminiErr) {
      console.warn(`[ai] Gemini image failed (${extractErrorMessage(geminiErr)}) — trying Pollinations.`);
      try {
        return await generatePollinationsImage(design, settings, type);
      } catch (pollinationsErr) {
        console.warn('[ai] Pollinations also failed', pollinationsErr);
        throw new Error(
          `Gemini: ${extractErrorMessage(geminiErr)} · Pollinations: ${extractErrorMessage(pollinationsErr)}`,
        );
      }
    }
  }

  generateThemeAudio(design: CharacterDesign): Promise<string> {
    return this.gemini.generateThemeAudio(design);
  }

  /** 1-token pings against both text providers; Groq ping only runs when configured. */
  async testConnection(): Promise<ConnectionDiagnostic> {
    const geminiFailure = isGeminiConfigured() ? await this.gemini.testConnection() : 'VITE_GEMINI_API_KEY not set';
    const groqConfigured = isGroqConfigured();
    const groqFailure = groqConfigured ? await this.groq.testConnection() : null;
    return {
      gemini: {
        ok: geminiFailure === null,
        detail: geminiFailure ?? 'Key accepted — the API answered the ping.',
      },
      groq: {
        configured: groqConfigured,
        ok: groqConfigured && groqFailure === null,
        detail: !groqConfigured
          ? 'not configured (optional free key at console.groq.com/keys)'
          : groqFailure ?? 'Key accepted — the API answered the ping.',
      },
      pollinations: {
        configured: isPollinationsConfigured(),
        detail: isPollinationsConfigured()
          ? 'image fallback (flux) — key configured; used when Gemini fails'
          : 'no key — anonymous flux access attempted as image fallback',
      },
    };
  }
}
