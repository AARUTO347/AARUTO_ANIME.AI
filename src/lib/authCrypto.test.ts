import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, timingSafeEqualHex, isPlausibleEmail, sha256PureHex } from './authCrypto';

describe('sha256PureHex (Web Crypto fallback)', () => {
  it('matches FIPS 180-4 test vectors', () => {
    expect(sha256PureHex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256PureHex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256PureHex('The quick brown fox jumps over the lazy dog')).toBe('d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592');
    expect(sha256PureHex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });

  it('matches Web Crypto on multi-byte UTF-8 input', async () => {
    const strings = ['魂魄パスキー', '蒼真 / Aoi — ✓', 'x'.repeat(1000), 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'a'.repeat(1000)];
    for (const s of strings) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
      const expected = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
      expect(sha256PureHex(s)).toBe(expected);
    }
  });
});

describe('hashPassword', () => {
  it('produces a 64-char hex SHA-256 digest', async () => {
    const hash = await hashPassword('soul-passkey-123');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic', async () => {
    expect(await hashPassword('abc')).toBe(await hashPassword('abc'));
  });

  it('differs for different passwords', async () => {
    expect(await hashPassword('abc')).not.toBe(await hashPassword('abd'));
  });
});

describe('verifyPassword', () => {
  it('accepts the correct password and rejects others', async () => {
    const hash = await hashPassword('open-sesame');
    expect(await verifyPassword('open-sesame', hash)).toBe(true);
    expect(await verifyPassword('open-sesame!', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
  });
});

describe('timingSafeEqualHex', () => {
  it('compares equal-length strings correctly', () => {
    expect(timingSafeEqualHex('deadbeef', 'deadbeef')).toBe(true);
    expect(timingSafeEqualHex('deadbeef', 'deadbee0')).toBe(false);
  });
  it('returns false for different lengths', () => {
    expect(timingSafeEqualHex('abc', 'abcd')).toBe(false);
  });
});

describe('isPlausibleEmail', () => {
  it('accepts normal addresses', () => {
    expect(isPlausibleEmail('user@example.com')).toBe(true);
    expect(isPlausibleEmail('a.b+tag@sub.domain.io')).toBe(true);
  });
  it('rejects malformed addresses', () => {
    expect(isPlausibleEmail('not-an-email')).toBe(false);
    expect(isPlausibleEmail('missing@tld')).toBe(false);
    expect(isPlausibleEmail('spaces in@address.com')).toBe(false);
    expect(isPlausibleEmail('')).toBe(false);
  });
});
