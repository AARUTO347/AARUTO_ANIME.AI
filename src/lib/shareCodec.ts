import type { CharacterDesign } from '../types';
import { normalizeDesign } from './design';

export const SUMMON_HASH_PREFIX = '#/summon/';
export const SUMMON_HASH_PATTERN = /^#\/summon\/([A-Za-z0-9_-]{10,})$/;

/** UTF-8 safe base64url encode. */
export function encodeSharePayload(design: CharacterDesign): string {
  const json = JSON.stringify(design);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** UTF-8 safe base64url decode → validated CharacterDesign, or null when invalid. */
export function decodeSharePayload(base64url: string): CharacterDesign | null {
  try {
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    return normalizeDesign(JSON.parse(json));
  } catch {
    return null;
  }
}

export function buildShareUrl(design: CharacterDesign): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}${SUMMON_HASH_PREFIX}${encodeSharePayload(design)}`;
}

/** Parse `window.location.hash`; returns the imported design or null. */
export function decodeShareHash(hash: string): CharacterDesign | null {
  const match = SUMMON_HASH_PATTERN.exec(hash);
  if (!match || !match[1]) return null;
  return decodeSharePayload(match[1]);
}
