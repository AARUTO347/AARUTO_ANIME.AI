import { describe, it, expect } from 'vitest';
import { safeJsonParse } from './safeJson';

describe('safeJsonParse', () => {
  it('parses valid JSON', () => {
    expect(safeJsonParse<{ a: number }>('{"a": 42}', 'Test')).toEqual({ a: 42 });
  });

  it('throws a labelled error on empty input', () => {
    expect(() => safeJsonParse(undefined, 'Design generation')).toThrow(/Design generation: the AI returned an empty response/);
    expect(() => safeJsonParse(null, 'Design generation')).toThrow(/empty response/);
    expect(() => safeJsonParse('   ', 'Design generation')).toThrow(/empty response/);
  });

  it('throws a labelled error on malformed JSON', () => {
    expect(() => safeJsonParse('{not json', 'Evolution')).toThrow(/Evolution: could not parse the AI response as JSON/);
  });

  it('strips markdown code fences around JSON', () => {
    expect(safeJsonParse<{ a: number }>('```json\n{"a": 7}\n```', 'Test')).toEqual({ a: 7 });
    expect(safeJsonParse<{ a: number }>('```\n{"a": 7}\n```', 'Test')).toEqual({ a: 7 });
  });
});
