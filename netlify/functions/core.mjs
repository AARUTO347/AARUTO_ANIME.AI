// Server-only AI / auth / validation helpers.
// Used by Netlify Functions and the local node API server.
// Never import this file from the frontend bundle or commit secrets.

import crypto from 'node:crypto';

const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || `${8 * 60 * 60 * 1000}`);
export const MAX_PROMPT_LENGTH = 500;
export const MAX_BODY_BYTES = 16 * 1024; // 16 KB

export function json(status, body) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
    body: JSON.stringify(body),
  };
}

// ---------- Scrypt hashing (Node built-in) ----------
// Format: scrypt:<salt hex>:<hash hex>
export function scryptHash(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function scryptVerify(password, stored) {
  if (typeof stored !== 'string') return false;
  const [algo, saltHex, hashHex] = stored.split(':');
  if (algo !== 'scrypt' || !saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const actual = Buffer.from(hashHex, 'hex');
  const expected = crypto.scryptSync(password, salt, actual.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(actual, expected);
}

// ---------- Session store (in-memory, with revocation list) ----------
// For production Netlify/edge use a durable store (Upstash, Netlify Blobs, etc.).
export const sessions = new Map(); // token -> { email, isAdmin, expiresAt }
const revoked = new Set();

export function sessionCreate(payload) {
  const token = crypto.randomBytes(32).toString('hex');
  const ttl = SESSION_TTL_MS;
  sessions.set(token, { ...payload, expiresAt: Date.now() + ttl });
  return token;
}

export function sessionVerify(token) {
  if (!token || revoked.has(token)) return null;
  const data = sessions.get(token);
  if (!data) return null;
  if (data.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return data;
}

export function sessionRevoke(token) {
  sessions.delete(token);
  revoked.add(token);
}

export function sessionStats() {
  return { active: sessions.size, revoked: revoked.size };
}

// ---------- Simple prefix token bucket rate limiter ----------
const buckets = new Map();
export function checkRateLimit(key, limit, windowMs) {
  const now = Date.now();
  const bucket = buckets.get(key) || [];
  const recent = bucket.filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    buckets.set(key, recent);
    return { ok: false, retryAfterMs: windowMs - (now - recent[0]) };
  }
  recent.push(now);
  buckets.set(key, recent);
  return { ok: true };
}

// ---------- Safe parsing helpers ----------
export function safeJsonParse(raw, fallback) {
  try { return JSON.parse(raw); } catch { return fallback; }
}

export function normalizeDesign(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const asInt = (v, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(1, Math.min(100, Math.round(n))) : fallback;
  };
  const asStr = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const asStrList = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).slice(0, 24) : []);
  return {
    name: asStr(raw.name) || 'Unnamed',
    title: asStr(raw.title) || 'Untitled',
    personality: asStr(raw.personality) || 'Unknown',
    aesthetic: asStr(raw.aesthetic) || 'Classic Anime',
    powers: asStrList(raw.powers).length ? asStrList(raw.powers) : ['Mysterious Aura'],
    lore: asStr(raw.lore) || '',
    visualTraits: asStr(raw.visualTraits) || '',
    homeworld: asStr(raw.homeworld) || '',
    evolutionStage: Math.max(1, parseInt(raw.evolutionStage, 10) || 1),
    stats: {
      strength: asInt(raw?.stats?.strength, 50),
      agility: asInt(raw?.stats?.agility, 50),
      intelligence: asInt(raw?.stats?.intelligence, 50),
      stamina: asInt(raw?.stats?.stamina, 50),
    },
  };
}

// ---------- Groq API client ----------
function groqUrl() {
  return process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions';
}

export async function groqChat({ model, messages, response_format = undefined, max_tokens = 1024, temperature = 0.9, signal }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not configured on the server');
  const body = { model, messages, max_tokens, temperature };
  if (response_format) body.response_format = response_format;
  const res = await fetch(groqUrl(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: signal || AbortSignal.timeout(30_000),
  });
  const payload = await res.text();
  if (!res.ok) {
    const parsed = safeJsonParse(payload, null);
    const msg = parsed?.error?.message || `Groq HTTP ${res.status}`;
    throw Object.assign(new Error(msg), { status: res.status });
  }
  const parsed = safeJsonParse(payload, {});
  const text = parsed?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Groq returned an empty response');
  return text.trim();
}

// ---------- Pollinations image client ----------
export async function pollinationsImage({ design, type, resolution }) {
  // Server-side only — never forward API keys to browser.
  const width = type === 'environment' ? 1280 : (resolution === '2048' ? 1280 : resolution === '512' ? 512 : 1280);
  const height = type === 'environment' ? 720 : (width === 1280 ? 1706 : 683);
  const detail = 'masterpiece, ultra-detailed, 8k, sharp focus, depth of field, volumetric lighting, cinematic atmosphere, intricate textures, award-winning photorealism';
  const prompt = type === 'character'
    ? `${design.aesthetic} masterpiece. Character: ${design.name} (${design.title}). Traits: ${design.visualTraits}. Lighting: cinematic. Background: ${design.homeworld}. ${detail}`
    : `Cinematic ${design.aesthetic} environment. Location: ${design.homeworld}. Lighting: golden hour. ${detail}`;
  const params = new URLSearchParams({
    width: String(width),
    height: String(height),
    model: 'sana',
    nologo: 'true',
    referrer: 'aaruto_anime_ai',
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    const res = await fetch(`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params}`, {
      headers: process.env.POLLINATIONS_API_KEY ? { Authorization: `Bearer ${process.env.POLLINATIONS_API_KEY}` } : {},
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Pollinations HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    const b64 = Buffer.from(buf).toString('base64');
    return `data:image/jpeg;base64,${b64}`;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Prompt builders ----------
export function buildDesignPrompt(userPrompt) {
  return `You are the Master Architect of AARUTO_ANIME.AI. Design an apex-tier anime character based on: "${userPrompt}".
Requirements (ALL mandatory):
1. 'name': original character name
2. 'title': epithet
3. 'personality': 2-4 vivid traits
4. 'aesthetic': one theme
5. 'powers': array of 3-6 short noun phrases
6. 'lore': 2-4 sentences
7. 'visualTraits': physical description with cinematic detail
8. 'homeworld': environment
9. 'stats': lowercase keys strength, agility, intelligence, stamina (1-100)
10. 'evolutionStage': Start at 1.
Respond with a SINGLE FLAT JSON object. No extra prose.`;
}

export function buildEvolvePrompt(current) {
  return `Perform a God-Tier Ascension for: ${JSON.stringify(current)}.
Rules: dramatically upgrade stats (cap each at 100); update visualTraits to reflect supreme power; increment evolutionStage by exactly 1; enhance lore.
Respond with a SINGLE FLAT JSON object only.`;
}

export function buildUpdatePrompt(design, field) {
  return `Current state: ${JSON.stringify(design)}.
Rewrite the "${field}" with god-tier creativity. Maintain the ${design.aesthetic} theme.
Respond with a SINGLE FLAT JSON object only.`;
}

export function buildOraclePrompt(design, question) {
  return `Identity Context: ${JSON.stringify(design)}.
Oracle Inquiry: "${question}".
You are the Akashic Oracle. Provide an immersive response that explicitly weaves visualTraits and homeworld into the answer. Maintain mythic weight.`;
}

export function buildSenseiChat(history) {
  const mapped = history.map((m) => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: String(m.text ?? m.content ?? ''),
  }));
  return [{ role: 'system', content: 'You are the Omni-Sensei of AARUTO_ANIME.AI. Answer concisely and in-character.' }, ...mapped];
}
