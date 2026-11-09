// Client for the trusted server-side API. Never embeds provider keys.
import type { CharacterDesign, SenseiMessage } from '../types';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const BASE = '/api';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(typeof body?.error === 'string' ? body.error : res.statusText || 'Request failed', res.status);
  }
  return res.json() as Promise<T>;
}

// ---------- Auth ----------
export function signup(email: string, password: string) {
  return request<{ user: { email: string; isAdmin: boolean } }>('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}
export function login(email: string, password: string) {
  return request<{ user: { email: string; isAdmin: boolean } }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}
export function logout() {
  return request<{ ok: boolean }>('/auth/logout', { method: 'POST' });
}
export function me() {
  return request<{ user: { email: string; isAdmin: boolean } }>('/auth/me', { method: 'GET' });
}
export async function health() {
  const res = await fetch(`${BASE}/health`).catch(() => null);
  return res?.ok ? (await res.json()) : null;
}

// ---------- AI ----------
export function generateDesign(prompt: string) {
  return request<{ design: CharacterDesign }>('/ai/design', {
    method: 'POST',
    body: JSON.stringify({ prompt }),
  }).then((r) => r.design);
}
export function evolveDesign(current: CharacterDesign) {
  return request<{ design: CharacterDesign }>('/ai/evolve', {
    method: 'POST',
    body: JSON.stringify({ design: current }),
  }).then((r) => r.design);
}
export function updateField(design: CharacterDesign, field: keyof CharacterDesign) {
  return request<{ newValue: unknown }>('/ai/updateField', {
    method: 'POST',
    body: JSON.stringify({ design, field: String(field) }),
  }).then((r) => r.newValue);
}
export function loreChat(design: CharacterDesign, question: string) {
  return request<{ answer: string }>('/ai/lore', {
    method: 'POST',
    body: JSON.stringify({ design, question }),
  }).then((r) => r.answer);
}
export function senseiAdvice(history: SenseiMessage[]) {
  return request<{ reply: string }>('/ai/sensei', {
    method: 'POST',
    body: JSON.stringify({ history }),
  }).then((r) => r.reply);
}
export function generateImage(design: CharacterDesign, type: 'character' | 'environment' = 'character') {
  return request<{ imageDataUrl: string }>('/ai/image', {
    method: 'POST',
    body: JSON.stringify({ design, type }),
  }).then((r) => r.imageDataUrl);
}
export function generateThemeAudio(design: CharacterDesign) {
  return request<{ audioDataUrl: string }>('/ai/audio', {
    method: 'POST',
    body: JSON.stringify({ design }),
  }).then((r) => r.audioDataUrl);
}
