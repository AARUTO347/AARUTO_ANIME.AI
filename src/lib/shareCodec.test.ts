import { describe, it, expect } from 'vitest';
import { encodeSharePayload, decodeSharePayload, decodeShareHash } from './shareCodec';
import type { CharacterDesign } from '../types';

const unicodeDesign: CharacterDesign = {
  name: '蒼真 / Aoi',
  title: '天火の覇王 ✦ Sovereign of the Celestial Flame — ✓',
  personality: 'Wry, merciless, secretly kind',
  aesthetic: 'High Fantasy',
  powers: ['永遠の炎', 'Starfire Wing', 'Éclat du ciel'],
  lore: 'Né sous une éclipse —  born beneath an eclipse, 光を喰らう者。',
  visualTraits: '銀の瞳と黒曜石の翼 — silver eyes, wings of volcanic glass',
  homeworld: '雲海に浮かぶ古都 — an ancient city adrift above a sea of clouds',
  evolutionStage: 3,
  stats: { strength: 92, agility: 88, intelligence: 74, stamina: 81 },
};

describe('share codec', () => {
  it('round-trips a design containing multi-byte Unicode', () => {
    const encoded = encodeSharePayload(unicodeDesign);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/); // base64url alphabet, no padding
    const decoded = decodeSharePayload(encoded);
    expect(decoded).toEqual(unicodeDesign);
  });

  it('produces URL-safe output (no +, / or =)', () => {
    // Try many designs to hit edge bytes in the encoded stream.
    for (let i = 0; i < 50; i++) {
      const d = { ...unicodeDesign, name: `Char-${i}-${'x'.repeat(i)}` };
      expect(encodeSharePayload(d)).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('returns null on tampered input', () => {
    expect(decodeSharePayload('!!!not-base64!!!')).toBeNull();
    expect(decodeSharePayload(btoa('{"truncated":').replace(/\+/g, '-').replace(/\//g, '_'))).toBeNull();
    expect(decodeSharePayload(encodeSharePayload(unicodeDesign) + 'corrupt')).toBeNull();
  });

  it('returns null for payloads that are valid JSON but not a design', () => {
    const notADesign = btoa(JSON.stringify({ hello: 'world' })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(decodeSharePayload(notADesign)).toBeNull();
  });

  it('parses the #/summon/ hash and rejects other hashes', () => {
    const encoded = encodeSharePayload(unicodeDesign);
    expect(decodeShareHash(`#/summon/${encoded}`)).toEqual(unicodeDesign);
    expect(decodeShareHash('')).toBeNull();
    expect(decodeShareHash('#/summon/')).toBeNull();
    expect(decodeShareHash('#/other/abc123def456')).toBeNull();
    expect(decodeShareHash('#/summon/short')).toBeNull();
  });
});
