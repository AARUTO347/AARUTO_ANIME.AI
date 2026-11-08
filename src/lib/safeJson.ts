/**
 * Parse JSON returned by the Gemini API without ever throwing a raw
 * SyntaxError / TypeError. Throws an Error with a human-readable,
 * labelled message instead so the UI can surface it.
 */
export function safeJsonParse<T>(raw: string | null | undefined, label: string): T {
  if (raw == null || raw.trim() === '') {
    throw new Error(`${label}: the AI returned an empty response. Please try again.`);
  }
  // Tolerate markdown code fences around the JSON (```json … ```).
  const trimmed = raw
    .trim()
    .replace(/^```(?:json|JSON)?\s*\n?/, '')
    .replace(/\n?```\s*$/, '')
    .trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`${label}: could not parse the AI response as JSON (${detail}).`);
  }
}
