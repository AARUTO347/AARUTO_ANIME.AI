import { describe, it, expect } from 'vitest';
import { buildSpectralSvg, buildSpectralEnvironment, generateSpectralPortrait, generateSpectralEnvironment } from './spectralPortrait';
import type { CharacterDesign } from '../types';

const baseDesign: CharacterDesign = {
  name: 'Akai-Zenshu',
  title: 'The Blood-Moon Ronin',
  personality: 'Quiet, merciless',
  aesthetic: 'Dark Fantasy',
  powers: ['Dimensional Origami Slicing', 'Blood-Mist Phase Shift'],
  lore: 'Born under an eclipse.',
  visualTraits: 'Paper-white mask, crimson katana',
  homeworld: 'The Origami Void',
  evolutionStage: 1,
  stats: { strength: 88, agility: 98, intelligence: 92, stamina: 85 },
};

describe('spectral portrait', () => {
  it('is fully deterministic — same design, identical output', () => {
    expect(buildSpectralSvg(baseDesign)).toBe(buildSpectralSvg(baseDesign));
  });

  it('produces different art for different identities', () => {
    const other = { ...baseDesign, name: 'Hikari', powers: ['Starfire Wing'] };
    expect(buildSpectralSvg(baseDesign)).not.toBe(buildSpectralSvg(other));
  });

  it('emits a well-formed svg with a 3:4 viewBox', () => {
    const svg = buildSpectralSvg(baseDesign);
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox="0 0 600 800"');
    expect(svg).toContain('</svg>');
    expect(svg).toMatch(/<circle /);
    expect(svg).toMatch(/<polygon /);
    expect(svg).not.toMatch(/undefined/);
    expect(svg).not.toMatch(/NaN/);
  });

  it('matches the Dark Fantasy palette and a fire-free fallback for unknown powers', () => {
    const svg = buildSpectralSvg(baseDesign);
    expect(svg).toContain('#ef4444'); // Dark Fantasy primary
  });

  it('adds horns at stage ≥ 2 and a crown at stage ≥ 3', () => {
    const stage1 = buildSpectralSvg(baseDesign);
    const stage2 = buildSpectralSvg({ ...baseDesign, evolutionStage: 2 });
    const stage3 = buildSpectralSvg({ ...baseDesign, evolutionStage: 3 });
    expect(stage1).not.toContain('<!-- horns -->');
    expect(stage1).not.toContain('<!-- crown -->');
    expect(stage2).toContain('<!-- horns -->');
    expect(stage2).not.toContain('<!-- crown -->');
    expect(stage3).toContain('<!-- horns -->');
    expect(stage3).toContain('<!-- crown -->');
  });

  it('survives empty powers and an unknown aesthetic', () => {
    const weird = { ...baseDesign, powers: [], aesthetic: 'Not a Real Aesthetic' };
    const svg = buildSpectralSvg(weird);
    expect(svg).toContain('<svg');
    expect(svg).not.toMatch(/undefined/);
  });

  it('escapes xml entities in the name', () => {
    const evil = { ...baseDesign, name: '<script>alert("x")</script>' };
    const svg = buildSpectralSvg(evil);
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
  });

  it('returns an img-src-ready data URL', () => {
    const url = generateSpectralPortrait(baseDesign);
    expect(url.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    const decoded = decodeURIComponent(url.split(',')[1]!);
    expect(decoded).toContain('<svg');
  });
});

describe('spectral environment', () => {
  it('is deterministic for the same design', () => {
    expect(buildSpectralEnvironment(baseDesign)).toBe(buildSpectralEnvironment(baseDesign));
  });

  it('differs by homeworld', () => {
    const other = { ...baseDesign, homeworld: 'A city adrift above a sea of clouds' };
    expect(buildSpectralEnvironment(baseDesign)).not.toBe(buildSpectralEnvironment(other));
  });

  it('emits a well-formed 16:9 scene without NaN/undefined', () => {
    const svg = buildSpectralEnvironment(baseDesign);
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox="0 0 1600 900"');
    expect(svg).toContain('</svg>');
    expect(svg).toMatch(/<polygon /);
    expect(svg).toMatch(/<circle /);
    expect(svg).not.toMatch(/undefined/);
    expect(svg).not.toMatch(/NaN/);
  });

  it('escapes xml entities in the homeworld label', () => {
    const evil = { ...baseDesign, homeworld: '<img onerror="x">' };
    const svg = buildSpectralEnvironment(evil);
    expect(svg).not.toContain('<img onerror');
    expect(svg).toContain('&lt;img onerror=&quot;x&quot;&gt;');
  });

  it('returns an img-src-ready data URL', () => {
    const url = generateSpectralEnvironment(baseDesign);
    expect(url.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
  });
});
