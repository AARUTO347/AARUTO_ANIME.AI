import type { CharacterDesign, CharacterStats } from '../types';
import { safeJsonParse } from './safeJson';

export const STAT_MIN = 1;
export const STAT_MAX = 100;
export const STAT_DEFAULT = 50;

/** Clamp any unknown value into a valid 1–100 stat. */
export function clampStat(value: unknown, fallback: number = STAT_DEFAULT): number {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || Number.isNaN(n) || !Number.isFinite(n)) return fallback;
  return Math.min(STAT_MAX, Math.max(STAT_MIN, Math.round(n)));
}

export function normalizeStats(raw: unknown): CharacterStats {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    strength: clampStat(obj.strength),
    agility: clampStat(obj.agility),
    intelligence: clampStat(obj.intelligence),
    stamina: clampStat(obj.stamina),
  };
}

function asNonEmptyString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const cleaned = value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  return cleaned.length > 0 ? cleaned : fallback;
}

/**
 * Coerces an arbitrary AI-produced payload into a valid CharacterDesign.
 * Throws only when the response is structurally unusable (no name/title at all).
 */
export function normalizeDesign(raw: unknown): CharacterDesign {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Design: the AI returned a non-object payload.');
  }
  const obj = raw as Record<string, unknown>;
  const name = asNonEmptyString(obj.name, '');
  if (!name) {
    throw new Error('Design: the AI response did not include a character name.');
  }

  const stageRaw = obj.evolutionStage;
  const evolutionStage =
    typeof stageRaw === 'number' && Number.isFinite(stageRaw)
      ? Math.max(1, Math.round(stageRaw))
      : 1;

  return {
    name,
    title: asNonEmptyString(obj.title, 'Untitled Manifestation'),
    personality: asNonEmptyString(obj.personality, 'Enigmatic and unreadable.'),
    aesthetic: asNonEmptyString(obj.aesthetic, 'Classic Anime'),
    powers: asStringArray(obj.powers, ['Mysterious Aura']),
    lore: asNonEmptyString(obj.lore, 'Origin unknown — even the Akashic Records falter.'),
    visualTraits: asNonEmptyString(obj.visualTraits, 'A silhouette wreathed in unwritten fate.'),
    homeworld: asNonEmptyString(obj.homeworld, 'A realm beyond the mapped multiverse.'),
    evolutionStage,
    stats: normalizeStats(obj.stats),
  };
}

/** Parse + validate an AI JSON response that should contain a CharacterDesign. */
export function parseDesignResponse(rawText: string | null | undefined, label: string): CharacterDesign {
  return normalizeDesign(safeJsonParse<unknown>(rawText, label));
}
