// Client facade for the trusted server-side API.
// Never imports provider keys — all AI calls route through /api/...
import type { CharacterDesign, AppSettings, QualityLevel, SenseiMessage } from '../types';
import * as api from './apiClient';

export interface ConnectionDiagnostic {
  groq: { configured: boolean; ok: boolean; detail: string };
  pollinations: { configured: boolean; detail: string };
}

export class AiService {
  async generateDesign(prompt: string): Promise<CharacterDesign> {
    return api.generateDesign(prompt);
  }
  async evolveDesign(current: CharacterDesign): Promise<CharacterDesign> {
    return api.evolveDesign(current);
  }
  async updateField(design: CharacterDesign, field: keyof CharacterDesign): Promise<unknown> {
    return api.updateField(design, field);
  }
  async loreChat(design: CharacterDesign, userQuestion: string): Promise<string> {
    return api.loreChat(design, userQuestion);
  }
  async senseiAdvice(history: Array<{ role: 'user' | 'model' | 'sensei'; parts: { text: string }[] | string }>): Promise<string> {
    const mapped: SenseiMessage[] = history.map((m) => ({
      role: m.role === 'model' || m.role === 'sensei' ? 'sensei' : 'user',
      text: Array.isArray(m.parts) ? m.parts.map((p) => p.text || '').join(' ') : String(m.parts || ''),
    }));
    return api.senseiAdvice(mapped);
  }
  async generateImage(
    design: CharacterDesign,
    _quality: QualityLevel,
    _settings: AppSettings,
    type: 'character' | 'environment' = 'character',
  ): Promise<string> {
    return api.generateImage(design, type);
  }
  async generateThemeAudio(design: CharacterDesign): Promise<{ data: string; format: 'wav' | 'mp3' }> {
    const url = await api.generateThemeAudio(design);
    const base64 = url.split(',')[1] || '';
    return { data: base64, format: 'mp3' };
  }
  async testConnection(): Promise<ConnectionDiagnostic> {
    const health = await api.health();
    const groqOk = health?.groq ?? false;
    return {
      groq: {
        configured: groqOk,
        ok: groqOk,
        detail: groqOk ? 'Server-side Groq reachable' : 'Server Groq key not configured',
      },
      pollinations: {
        configured: health?.pollinations ?? true,
        detail: 'Anonymous flux via /api/image',
      },
    };
  }
}
