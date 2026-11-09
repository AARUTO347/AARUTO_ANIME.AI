// Netlify Function / local API handler.
// Server-only. Never ship API keys or bypass validation here from the client.

import {
  json,
  scryptHash,
  scryptVerify,
  sessions,
  sessionCreate,
  sessionVerify,
  sessionRevoke,
  checkRateLimit,
  MAX_PROMPT_LENGTH,
  MAX_BODY_BYTES,
  normalizeDesign,
  safeJsonParse,
  groqChat,
  pollinationsImage,
  buildDesignPrompt,
  buildEvolvePrompt,
  buildUpdatePrompt,
  buildOraclePrompt,
  buildSenseiChat,
} from './core.mjs';

// In-memory demo user store (replace with a DB in production).
const users = new Map();

function readBody(event) {
  try {
    const raw = event?.body;
    if (!raw) return {};
    const text = event.isBase64Encoded ? Buffer.from(raw, 'base64').toString('utf8') : raw;
    if (text.length > MAX_BODY_BYTES) return { __tooLarge: true };
    const stripped = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
    return safeJsonParse(stripped, {});
  } catch {
    return {};
  }
}

function parseCookies(event) {
  const header = event?.headers?.cookie || event?.headers?.Cookie || '';
  return header.split(';').map(s => s.trim()).filter(Boolean).reduce((acc, pair) => {
    const idx = pair.indexOf('=');
    if (idx > -1) acc[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
    return acc;
  }, {});
}

function authFromEvent(event) {
  const cookies = parseCookies(event);
  return sessionVerify(cookies.__Host_aaruto_session);
}

function isSecureRequest(event) {
  const proto = event?.headers?.["x-forwarded-proto"] || event?.headers?.["X-Forwarded-Proto"] || "";
  return proto.split(",")[0].trim().toLowerCase() === "https";
}

function isAdminCredentials(email, password) {
  const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase();
  const adminHash = process.env.ADMIN_PASSWORD_SCRYPT;
  return Boolean(adminHash && adminEmail) && email === adminEmail && scryptVerify(password, adminHash);
}

function unauthorized(message, status = 401) {
  return json(status, { error: message });
}

export async function handler(event) {
  const path = (event.path || '').replace(/\/$/, '').replace(/^\/\.netlify\/functions\/api/, '');
  const method = (event.httpMethod || 'GET').toUpperCase();
  const ip = event?.headers?.['x-forwarded-for'] || event?.headers?.['client-ip'] || 'unknown';
  const isProduction = process.env.NODE_ENV === 'production';

  const body = readBody(event);
  if (body.__tooLarge) return json(413, { error: 'Payload too large' });
  if (path === '/health' && method === 'GET') {
    return json(200, {
      groq: Boolean(process.env.GROQ_API_KEY),
      pollinations: Boolean(process.env.POLLINATIONS_API_KEY),
      nodeEnv: process.env.NODE_ENV,
    });
  }

  // ---------- Auth: signup ----------
  if (path === '/auth/signup' && method === 'POST') {
    const { email, password } = body || {};
    const emailOk = typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
    if (!emailOk) return json(400, { error: 'Invalid email address' });
    if (typeof password !== 'string' || password.length < 8) return json(400, { error: 'Passkey must be at least 8 characters' });

    const rl = checkRateLimit(`signup:${ip}`, 5, 60 * 60 * 1000);
    if (!rl.ok) return json(429, { error: 'Too many signups from this address. Try later.' });

    const normalized = email.trim().toLowerCase();
    if (users.has(normalized)) return json(409, { error: 'Identity already bound' });

    const hash = scryptHash(password);
    const isAdmin = isAdminCredentials(normalized, password);
    users.set(normalized, { email: normalized, passwordHash: hash, createdAt: Date.now(), isAdmin });

    const token = sessionCreate({ email: normalized, isAdmin });
    const secure = isProduction && isSecureRequest(event) ? '; Secure' : '';
    return json(200, { user: { email: normalized, isAdmin } }, {
      'Set-Cookie': `__Host_aaruto_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${8 * 3600}${secure}`,
    });
  }

  // ---------- Auth: login ----------
  if (path === '/auth/login' && method === 'POST') {
    const { email, password } = body || {};
    const emailOk = typeof email === 'string' && email.trim().length <= 254;
    if (!emailOk || typeof password !== 'string') return json(400, { error: 'Invalid credentials format' });

    const normalized = email.trim().toLowerCase();
    const perIp = checkRateLimit(`loginIp:${ip}`, 20, 5 * 60 * 1000);
    const perEmail = checkRateLimit(`loginEmail:${normalized}`, 8, 5 * 60 * 1000);
    if (!perIp.ok || !perEmail.ok) return json(429, { error: 'Too many attempts. Try again shortly.' });

    const stored = users.get(normalized);
    const ok = stored ? scryptVerify(password, stored.passwordHash) : isAdminCredentials(normalized, password);
    if (!ok) return json(401, { error: 'Mismatch. Access denied.' });

    const isAdmin = stored?.isAdmin ?? isAdminCredentials(normalized, password);
    if (!stored) {
      users.set(normalized, { email: normalized, passwordHash: scryptHash(password), createdAt: Date.now(), isAdmin });
    } else if (isAdmin && !stored.isAdmin) {
      stored.isAdmin = true;
      users.set(normalized, stored);
    }
    const token = sessionCreate({ email: normalized, isAdmin });
    const secure = isProduction && isSecureRequest(event) ? '; Secure' : '';
    return json(200, { user: { email: normalized, isAdmin } }, {
      'Set-Cookie': `__Host_aaruto_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${8 * 3600}${secure}`,
    });
  }

  // ---------- Auth: logout ----------
  if (path === '/auth/logout' && method === 'POST') {
    const cookies = parseCookies(event);
    const token = cookies.__Host_aaruto_session;
    sessionRevoke(token);
    return json(200, { ok: true }, {
      'Set-Cookie': '__Host_aaruto_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
    });
  }

  // ---------- Auth: me ----------
  if (path === '/auth/me' && method === 'GET') {
    const sess = authFromEvent(event);
    if (!sess) return json(401, { error: 'Not authenticated' });
    return json(200, { user: { email: sess.email, isAdmin: sess.isAdmin } });
  }

  // ---------- AI: design ----------
  if (path === '/ai/design' && method === 'POST') {
    const sess = authFromEvent(event);
    if (!sess) return unauthorized('Sign in to manifest designs.', 401);
    const rl = checkRateLimit(`ai:${sess.email}`, 20, 60 * 1000);
    if (!rl.ok) return json(429, { error: 'Rate limit reached. Try again in a minute.' });

    const prompt = String(body?.prompt || '').trim();
    if (!prompt) return json(400, { error: 'Prompt is required' });
    if (prompt.length > MAX_PROMPT_LENGTH) return json(400, { error: `Prompt exceeds ${MAX_PROMPT_LENGTH} characters` });

    try {
      const text = await groqChat({
        model: process.env.GROQ_TEXT_MODEL || 'qwen/qwen3.8-27b',
        messages: [{ role: 'user', content: buildDesignPrompt(prompt) }],
        response_format: { type: 'json_object' },
        max_tokens: 2048,
        temperature: 0.9,
      });
      const design = normalizeDesign(safeJsonParse(text, {}));
      if (!design) return json(502, { error: 'Upstream returned malformed design' });
      return json(200, { design });
    } catch (err) {
      console.error('design error', err);
      return json(502, { error: err?.message || 'Upstream AI unavailable' });
    }
  }

  // ---------- AI: evolve ----------
  if (path === '/ai/evolve' && method === 'POST') {
    const sess = authFromEvent(event);
    if (!sess) return unauthorized('Sign in required', 401);
    const rl = checkRateLimit(`ai:${sess.email}`, 20, 60 * 1000);
    if (!rl.ok) return json(429, { error: 'Rate limit reached.' });
    const current = normalizeDesign(body?.design);
    if (!current) return json(400, { error: 'Valid design payload required' });
    try {
      const text = await groqChat({
        model: process.env.GROQ_TEXT_MODEL || 'qwen/qwen3.8-27b',
        messages: [{ role: 'user', content: buildEvolvePrompt(current) }],
        response_format: { type: 'json_object' },
        max_tokens: 2048,
        temperature: 0.9,
      });
      const evolved = normalizeDesign(safeJsonParse(text, {}));
      if (!evolved) return json(502, { error: 'Upstream returned malformed evolution' });
      evolved.evolutionStage = Math.max((current.evolutionStage || 1) + 1, evolved.evolutionStage || 1);
      return json(200, { design: evolved });
    } catch (err) {
      console.error('evolve error', err);
      return json(502, { error: err?.message || 'Upstream AI unavailable' });
    }
  }

  // ---------- AI: update field ----------
  if (path === '/ai/updateField' && method === 'POST') {
    const sess = authFromEvent(event);
    if (!sess) return unauthorized('Sign in required', 401);
    const current = normalizeDesign(body?.design);
    const field = String(body?.field || '');
    if (!current || !field) return json(400, { error: 'Design and field are required' });
    const allowed = new Set(['name', 'title', 'personality', 'aesthetic', 'powers', 'lore', 'visualTraits', 'homeworld', 'stats']);
    if (!allowed.has(field)) return json(400, { error: 'Field not allowed' });
    try {
      const text = await groqChat({
        model: process.env.GROQ_TEXT_MODEL || 'qwen/qwen3.8-27b',
        messages: [{ role: 'user', content: buildUpdatePrompt(current, field) }],
        response_format: { type: 'json_object' },
        max_tokens: 1024,
        temperature: 0.9,
      });
      const parsed = safeJsonParse(text, {});
      let newValue = parsed.newValue !== undefined ? parsed.newValue : Object.values(parsed)[0];
      if (!newValue && field === 'powers') newValue = ['???'];
      return json(200, { newValue });
    } catch (err) {
      console.error('updateField error', err);
      return json(502, { error: err?.message || 'Upstream AI unavailable' });
    }
  }

  // ---------- AI: lore chat ----------
  if (path === '/ai/lore' && method === 'POST') {
    const sess = authFromEvent(event);
    if (!sess) return unauthorized('Sign in required', 401);
    const design = normalizeDesign(body?.design);
    const question = String(body?.question || '').trim();
    if (!design || !question) return json(400, { error: 'Design and question are required' });
    if (question.length > MAX_PROMPT_LENGTH) return json(400, { error: `Question exceeds ${MAX_PROMPT_LENGTH} characters` });
    try {
      const text = await groqChat({
        model: process.env.GROQ_TEXT_MODEL || 'qwen/qwen3.8-27b',
        messages: [{ role: 'user', content: buildOraclePrompt(design, question) }],
        max_tokens: 800,
        temperature: 0.8,
      });
      return json(200, { answer: text });
    } catch (err) {
      console.error('lore error', err);
      return json(502, { error: err?.message || 'Upstream AI unavailable' });
    }
  }

  // ---------- AI: sensei ----------
  if (path === '/ai/sensei' && method === 'POST') {
    const sess = authFromEvent(event);
    if (!sess) return unauthorized('Sign in required', 401);
    const messages = Array.isArray(body?.history) ? body.history.slice(-12) : [];
    if (messages.length === 0) return json(400, { error: 'History required' });
    try {
      const text = await groqChat({
        model: process.env.GROQ_TEXT_MODEL || 'qwen/qwen3.8-27b',
        messages: buildSenseiChat(messages),
        max_tokens: 1024,
        temperature: 0.7,
      });
      return json(200, { reply: text });
    } catch (err) {
      console.error('sensei error', err);
      return json(502, { error: err?.message || 'Upstream AI unavailable' });
    }
  }

  // ---------- AI: image ----------
  if (path === '/ai/image' && method === 'POST') {
    const sess = authFromEvent(event);
    if (!sess) return unauthorized('Sign in required', 401);
    const rl = checkRateLimit(`img:${sess.email}`, 8, 60 * 1000);
    if (!rl.ok) return json(429, { error: 'Image rate limit reached. Try again in a minute.' });
    const design = normalizeDesign(body?.design);
    if (!design) return json(400, { error: 'Valid design payload required' });
    const type = body?.type === 'environment' ? 'environment' : 'character';
    try {
      const imageDataUrl = await pollinationsImage({ design, type, resolution: '1024' });
      return json(200, { imageDataUrl });
    } catch (err) {
      console.error('image error', err);
      return json(502, { error: err?.message || 'Image provider unavailable' });
    }
  }

  // ---------- AI: audio (theme) ----------
  if (path === '/ai/audio' && method === 'POST') {
    const sess = authFromEvent(event);
    if (!sess) return unauthorized('Sign in required', 401);
    const design = normalizeDesign(body?.design);
    if (!design) return json(400, { error: 'Valid design payload required' });
    try {
      const script = `Heed the call of ${design.name}, the ${design.title}. Originating from ${design.homeworld}, their presence reshapes reality itself. Power levels are peaking at stage ${design.evolutionStage}. Let the chronicle begin!`;
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) return json(503, { error: 'Audio provider not configured on server' });
      const res = await fetch('https://api.groq.com/openai/v1/audio/speech', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'canopylabs/orpheus-v1-english', input: script, voice: 'autumn', response_format: 'mp3' }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) {
        const parsed = safeJsonParse(await res.text(), {});
        return json(502, { error: parsed?.error?.message || `Orpheus HTTP ${res.status}. Accept terms at https://console.groq.com/playground?model=canopylabs%2Forpheus-v1-english` });
      }
      const buf = await res.arrayBuffer();
      const b64 = Buffer.from(buf).toString('base64');
      return json(200, { audioDataUrl: `data:audio/mpeg;base64,${b64}` });
    } catch (err) {
      console.error('audio error', err);
      return json(502, { error: err?.message || 'Audio provider unavailable' });
    }
  }

  // ---------- Admin stats ----------
  if (path === '/admin/stats' && method === 'GET') {
    const sess = authFromEvent(event);
    if (!sess || !sess.isAdmin) return json(403, { error: 'Admin access required' });
    return json(200, { sessionCount: sessions.size, userCount: users.size });
  }

  return json(404, { error: 'Not found' });
}
