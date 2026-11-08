import { get, set, del } from 'idb-keyval';
import type { AppSettings, GeneratedResult } from '../types';

const KEYS = {
  history: 'aaruto_history',
  savedScrolls: 'aaruto_saved_scrolls',
  currentDraft: 'aaruto_current_draft',
} as const;

const LEGACY_LOCAL_STORAGE_KEYS = [
  KEYS.history,
  KEYS.savedScrolls,
  KEYS.currentDraft,
] as const;

export function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isGeneratedResult(value: unknown): value is GeneratedResult {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<GeneratedResult>;
  return typeof v.imageUrl === 'string' && typeof v.timestamp === 'number' && !!v.design && typeof v.design === 'object';
}

/** Ensure every item has an `id` (legacy entries predate the id field). */
function withId(item: GeneratedResult): GeneratedResult {
  return item.id ? item : { ...item, id: createId() };
}

function parseList(raw: unknown): GeneratedResult[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isGeneratedResult).map(withId);
}

export async function loadHistory(): Promise<GeneratedResult[]> {
  return parseList(await get<unknown>(KEYS.history));
}

export async function persistHistory(items: GeneratedResult[]): Promise<void> {
  await set(KEYS.history, items);
}

export async function loadSavedScrolls(): Promise<GeneratedResult[]> {
  return parseList(await get<unknown>(KEYS.savedScrolls));
}

export async function persistSavedScrolls(items: GeneratedResult[]): Promise<void> {
  await set(KEYS.savedScrolls, items);
}

export async function loadDraft(): Promise<GeneratedResult | null> {
  const raw = await get<unknown>(KEYS.currentDraft);
  return isGeneratedResult(raw) ? withId(raw) : null;
}

export async function persistDraft(draft: GeneratedResult): Promise<void> {
  await set(KEYS.currentDraft, draft);
}

export async function clearDraft(): Promise<void> {
  await del(KEYS.currentDraft);
}

/**
 * One-time migration: move legacy localStorage entries (which frequently
 * overflowed the ~5 MB quota because of base64 images) into IndexedDB,
 * then remove the legacy keys. Safe to call on every startup.
 */
export async function migrateLocalStorageToIdb(): Promise<void> {
  for (const key of LEGACY_LOCAL_STORAGE_KEYS) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed: unknown = JSON.parse(raw);
      const existing = await get<unknown>(key);
      if (existing == null) {
        await set(key, parsed);
      }
      window.localStorage.removeItem(key);
    } catch (err) {
      console.warn(`[storage] migration of "${key}" failed`, err);
    }
  }
}

export interface BackupPayload {
  version: 1;
  exportedAt: number;
  history: GeneratedResult[];
  savedScrolls: GeneratedResult[];
  settings: AppSettings;
}

export function buildBackup(
  history: GeneratedResult[],
  savedScrolls: GeneratedResult[],
  settings: AppSettings,
): string {
  const payload: BackupPayload = {
    version: 1,
    exportedAt: Date.now(),
    history,
    savedScrolls,
    settings,
  };
  return JSON.stringify(payload, null, 2);
}

/** Validate and parse a backup file. Throws with a readable message on failure. */
export function parseBackup(json: string): BackupPayload {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('Backup file is not valid JSON.');
  }
  if (!raw || typeof raw !== 'object') throw new Error('Backup file has an unexpected format.');
  const obj = raw as Record<string, unknown>;
  const history = parseList(obj.history);
  const savedScrolls = parseList(obj.savedScrolls);
  const settings = obj.settings && typeof obj.settings === 'object' ? (obj.settings as AppSettings) : null;
  if (!settings) throw new Error('Backup file is missing the settings section.');
  return {
    version: 1,
    exportedAt: typeof obj.exportedAt === 'number' ? obj.exportedAt : Date.now(),
    history,
    savedScrolls,
    settings,
  };
}
