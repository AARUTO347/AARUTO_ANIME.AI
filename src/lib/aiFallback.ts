import { extractStatus, isQuotaError } from '../services/geminiService';

/**
 * Decide whether a failed Gemini text call should fall back to the Groq
 * provider (free) instead of surfacing the error to the user.
 *
 * Fallback happens on: quota exhaustion (429), auth rejection (401 — the
 * Gemini key is missing/invalid), server errors (5xx), and unknown/network
 * failures. Client bugs (4xx like 400/403/404) are NOT retried elsewhere —
 * the same request would fail the same way on Groq.
 */
export function shouldFallbackToGroq(err: unknown): boolean {
  if (isQuotaError(err)) return true;
  const status = extractStatus(err);
  if (status === 401) return true;
  if (status !== null && status >= 500) return true;
  if (status === null) return true; // network/unknown — the request may never have landed
  return false;
}
