import { describe, it, expect } from 'vitest';
import { clampStat, normalizeStats, normalizeDesign, parseDesignResponse } from './design';
import type { CharacterDesign } from '../types';

const validDesign: CharacterDesign = {
  name: 'Kaede Voss',
  title: 'The Ember Sovereign',
  personality: 'Brooding, loyal',
  aesthetic: 'Cyberpunk',
  powers: ['Pyrokinesis', 'Ember Step'],
  lore: 'Born in a burning city.',
  visualTraits: 'Crimson hair, smouldering eyes',
  homeworld: 'A smog-choked reactor spire',
  evolutionStage: 1,
  stats: { strength: 80, agility: 70, intelligence: 60, stamina: 90 },
};

describe('clampStat', () => {
  it('clamps above STAT_MAX and below STAT_MIN', () => {
    expect(clampStat(150)).toBe(100);
    expect(clampStat(-20)).toBe(1);
  });
  it('rounds fractional values', () => {
    expect(clampStat(74.6)).toBe(75);
  });
  it('accepts numeric strings', () => {
    expect(clampStat('88')).toBe(88);
  });
  it('falls back on garbage input', () => {
    expect(clampStat('high')).toBe(50);
    expect(clampStat(undefined)).toBe(50);
    expect(clampStat(NaN, 33)).toBe(33);
    expect(clampStat(Infinity)).toBe(50);
  });
});

describe('normalizeStats', () => {
  it('clamps every stat into range', () => {
    const stats = normalizeStats({ strength: 999, agility: -5, intelligence: 55, stamina: '71' });
    expect(stats).toEqual({ strength: 100, agility: 1, intelligence: 55, stamina: 71 });
  });
  it('returns defaults for non-object input', () => {
    expect(normalizeStats(null)).toEqual({ strength: 50, agility: 50, intelligence: 50, stamina: 50 });
  });
});

describe('normalizeDesign', () => {
  it('passes a valid design through', () => {
    expect(normalizeDesign(validDesign)).toEqual(validDesign);
  });

  it('throws when the name is missing or blank', () => {
    expect(() => normalizeDesign({ ...validDesign, name: '' })).toThrow(/character name/);
    expect(() => normalizeDesign({})).toThrow(/character name/);
    expect(() => normalizeDesign('nope')).toThrow(/non-object/);
  });

  it('coerces evolutionStage to an integer ≥ 1', () => {
    expect(normalizeDesign({ ...validDesign, evolutionStage: 3.7 }).evolutionStage).toBe(4);
    expect(normalizeDesign({ ...validDesign, evolutionStage: -2 }).evolutionStage).toBe(1);
    expect(normalizeDesign({ ...validDesign, evolutionStage: 'many' }).evolutionStage).toBe(1);
  });

  it('drops empty powers and falls back when nothing remains', () => {
    expect(normalizeDesign({ ...validDesign, powers: ['Fireball', '', 12 as unknown as string] }).powers)
      .toEqual(['Fireball']);
    expect(normalizeDesign({ ...validDesign, powers: [] }).powers).toEqual(['Mysterious Aura']);
    expect(normalizeDesign({ ...validDesign, powers: 'not-an-array' }).powers).toEqual(['Mysterious Aura']);
  });

  it('fills missing optional strings with defaults', () => {
    const d = normalizeDesign({ name: 'Rin' });
    expect(d.title.length).toBeGreaterThan(0);
    expect(d.lore.length).toBeGreaterThan(0);
    expect(d.homeworld.length).toBeGreaterThan(0);
    expect(d.evolutionStage).toBe(1);
  });
});

describe('parseDesignResponse', () => {
  it('parses and validates a raw model response', () => {
    const parsed = parseDesignResponse(JSON.stringify(validDesign), 'Test');
    expect(parsed.name).toBe('Kaede Voss');
  });
  it('throws a labelled error on invalid JSON', () => {
    expect(() => parseDesignResponse('{broken', 'Evolution')).toThrow(/Evolution/);
  });
});
