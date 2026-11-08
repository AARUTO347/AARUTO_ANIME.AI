import { CharacterDesign, QualityLevel, AppSettings } from '../types';
import { GroqService, isGroqConfigured, GROQ_TEXT_MODEL } from './groqService';
import { generatePollinationsImage, isPollinationsConfigured } from './pollinationsService';

export interface ConnectionDiagnostic {
  groq: { configured: boolean; ok: boolean; detail: string };
  pollinations: { configured: boolean; detail: string };
}

export interface ThemeAudioResult {
  data: string;
  format: 'wav' | 'mp3';
}

/**
 * Unified AI facade used by the UI — a 100% free stack:
 *
 * - TEXT calls (design/evolve/re-roll/oracle/sensei): Groq free Qwen 3.8 27B.
 * - IMAGE calls: Pollinations hosted flux (free, works anonymously; key raises
 *   limits) → throws, letting the UI manifest a local Spectral Sketch.
 * - AUDIO (theme narration): Groq Orpheus TTS (free; requires one-time terms
 *   acceptance in the Groq console — the UI falls back to browser speech).
 */
export class AiService {
  private groq = new GroqService();

  generateDesign(prompt: string): Promise<CharacterDesign> {
    return this.groq.generateDesign(prompt);
  }

  evolveDesign(current: CharacterDesign): Promise<CharacterDesign> {
    return this.groq.evolveDesign(current);
  }

  updateField(design: CharacterDesign, field: keyof CharacterDesign): Promise<unknown> {
    return this.groq.updateField(design, field);
  }

  loreChat(design: CharacterDesign, userQuestion: string): Promise<string> {
    return this.groq.loreChat(design, userQuestion);
  }

  senseiAdvice(history: Array<{ role: 'user' | 'model'; parts: { text: string }[] }>): Promise<string> {
    return this.groq.senseiAdvice(history);
  }

  generateImage(
    design: CharacterDesign,
    quality: QualityLevel,
    settings: AppSettings,
    type: 'character' | 'environment' = 'character',
  ): Promise<string> {
    return generatePollinationsImage(design, quality, settings, type);
  }

  generateThemeAudio(design: CharacterDesign): Promise<ThemeAudioResult> {
    return this.groq.generateThemeAudio(design);
  }

  /** 1-token ping against Groq; Pollinations is reported without spending quota. */
  async testConnection(): Promise<ConnectionDiagnostic> {
    const groqConfigured = isGroqConfigured();
    const groqFailure = groqConfigured ? await this.groq.testConnection() : null;
    return {
      groq: {
        configured: groqConfigured,
        ok: groqConfigured && groqFailure === null,
        detail: !groqConfigured
          ? 'not configured — set VITE_GROQ_API_KEY (free at console.groq.com/keys)'
          : groqFailure ?? `Key accepted — answered the ping on ${GROQ_TEXT_MODEL}.`,
      },
      pollinations: {
        configured: isPollinationsConfigured(),
        detail: isPollinationsConfigured()
          ? 'image rendering — key configured (flux), fallback for every image call'
          : 'image rendering — no key; anonymous flux access attempted',
      },
    };
  }
}
