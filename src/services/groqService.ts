import { CharacterDesign } from '../types';
import { safeJsonParse } from '../lib/safeJson';
import { parseDesignResponse, normalizeStats } from '../lib/design';
import { designUserPrompt, evolveUserPrompt, updateFieldPrompt, oracleUserPrompt, SYSTEM_SENSEI } from '../lib/prompts';
import { extractErrorMessage } from './geminiService';

export const GROQ_API_KEY: string | undefined = (import.meta.env.VITE_GROQ_API_KEY as string | undefined)?.trim() || undefined;
// Qwen 3.8 27B — fast, free tier, verified working with response_format json_object.
// (GPT-OSS models return HTTP 400 on json_object; allam-2-7b has only 4k context.)
// Override with VITE_GROQ_TEXT_MODEL.
export const GROQ_TEXT_MODEL: string = (import.meta.env.VITE_GROQ_TEXT_MODEL as string | undefined)?.trim() || 'qwen/qwen3.8-27b';

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export function isGroqConfigured(): boolean {
  return Boolean(GROQ_API_KEY);
}

export class GroqNotConfiguredError extends Error {
  constructor() {
    super('Groq API key missing. Set VITE_GROQ_API_KEY in .env.local (free key at https://console.groq.com/keys).');
    this.name = 'GroqNotConfiguredError';
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface GroqChatBody {
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  response_format?: { type: 'json_object' };
  temperature?: number;
  max_tokens?: number;
}

/** One OpenAI-compatible chat completion against Groq, with a single retry on transient failures. */
async function groqChat(body: GroqChatBody): Promise<string> {
  if (!GROQ_API_KEY) throw new GroqNotConfiguredError();
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(GROQ_CHAT_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      lastError = err; // network failure — retry once
      if (attempt === 0) {
        await sleep(800);
        continue;
      }
      throw err;
    }

    if (res.ok) {
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = json.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error('Groq: empty response from the model.');
      return text;
    }

    const errBody = await res.text().catch(() => '');
    let message = `Groq request failed (HTTP ${res.status}).`;
    if (errBody) {
      try {
        const parsed = JSON.parse(errBody) as { error?: { message?: string; type?: string } };
        if (typeof parsed?.error?.message === 'string') message = parsed.error.message;
      } catch {
        message = `${message} ${errBody.slice(0, 300)}`;
      }
    } else if (res.statusText) {
      message = `${message} ${res.statusText}`;
    }
    lastError = new Error(message);
    const retryable = RETRYABLE.has(res.status);
    if (!retryable || attempt === 1) throw lastError;
    await sleep(800);
  }
  throw lastError;
}

/** OpenAI-style assistant turn parsing for Gemini-format sensei history. */
const toGroqMessages = (history: Array<{ role: string; parts: Array<{ text: string }> }>) =>
  history.map((turn) => ({
    role: (turn.role === 'model' ? 'assistant' : turn.role) as 'user' | 'assistant' | 'system',
    content: turn.parts.map((p) => p.text).join('\n'),
  }));

export class GroqService {
  async testConnection(): Promise<null | string> {
    try {
      await groqChat({
        model: GROQ_TEXT_MODEL,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      });
      return null;
    } catch (err) {
      return extractErrorMessage(err);
    }
  }

  async generateDesign(prompt: string): Promise<CharacterDesign> {
    const text = await groqChat({
      model: GROQ_TEXT_MODEL,
      messages: [{ role: 'user', content: designUserPrompt(prompt) }],
      response_format: { type: 'json_object' },
      temperature: 0.9,
    });
    return parseDesignResponse(text, 'Design generation');
  }

  async evolveDesign(current: CharacterDesign): Promise<CharacterDesign> {
    const text = await groqChat({
      model: GROQ_TEXT_MODEL,
      messages: [{ role: 'user', content: evolveUserPrompt(current) }],
      response_format: { type: 'json_object' },
      temperature: 0.9,
    });
    const evolved = parseDesignResponse(text, 'Evolution');
    evolved.evolutionStage = Math.max(current.evolutionStage + 1, evolved.evolutionStage);
    return evolved;
  }

  async updateField(design: CharacterDesign, field: keyof CharacterDesign): Promise<unknown> {
    const isPowerList = field === 'powers';
    const isStats = field === 'stats';
    const text = await groqChat({
      model: GROQ_TEXT_MODEL,
      messages: [{ role: 'user', content: updateFieldPrompt(design, String(field)) }],
      response_format: { type: 'json_object' },
      temperature: 0.9,
    });
    const wrapped = safeJsonParse<Record<string, unknown>>(text, `Re-roll of "${String(field)}"`);
    const newValue = wrapped.newValue !== undefined ? wrapped.newValue : Object.values(wrapped)[0];
    if (newValue === undefined) throw new Error(`Re-roll of "${String(field)}" returned no value.`);
    if (isStats) return normalizeStats(newValue);
    if (isPowerList && !Array.isArray(newValue)) throw new Error('Re-roll of "powers" did not return a list.');
    return newValue;
  }

  async loreChat(design: CharacterDesign, userQuestion: string): Promise<string> {
    return groqChat({
      model: GROQ_TEXT_MODEL,
      messages: [{ role: 'user', content: oracleUserPrompt(design, userQuestion) }],
      temperature: 0.8,
    });
  }

  async senseiAdvice(history: Array<{ role: 'user' | 'model'; parts: { text: string }[] }>): Promise<string> {
    return groqChat({
      model: GROQ_TEXT_MODEL,
      messages: [{ role: 'system', content: SYSTEM_SENSEI }, ...toGroqMessages(history)],
      temperature: 0.7,
    });
  }
}
