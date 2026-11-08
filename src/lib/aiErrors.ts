/**
 * Shared error-inspection helpers for Google/Groq/Pollinations JSON errors.
 * Shared error-inspection helpers for the Groq/Pollinations JSON error surfaces.
 */

export function extractStatus(err: unknown): number | null {
  const anyErr = err as { status?: unknown; statusCode?: unknown; code?: unknown; response?: { status?: unknown }; message?: unknown } | null;
  const raw = anyErr?.status ?? anyErr?.statusCode ?? anyErr?.response?.status ?? anyErr?.code;
  const n = typeof raw === 'string' ? Number(raw) : raw;
  if (typeof n === 'number' && Number.isFinite(n)) return n;
  // Google-style errors embed the code in the message JSON ("ApiError: {…}").
  if (typeof anyErr?.message === 'string') {
    const brace = anyErr.message.indexOf('{');
    if (brace >= 0) {
      try {
        const parsed = JSON.parse(anyErr.message.slice(brace)) as { error?: { code?: unknown } };
        const code = parsed?.error?.code;
        const codeNum = typeof code === 'string' ? Number(code) : code;
        if (typeof codeNum === 'number' && Number.isFinite(codeNum)) return codeNum;
      } catch {
        /* not JSON — ignore */
      }
    }
  }
  return null;
}

/** True when the error looks like a rate/quota rejection (HTTP 429 / RESOURCE_EXHAUSTED / free-tier limit 0). */
export function isQuotaError(err: unknown): boolean {
  const text = `${extractErrorMessage(err)} ${err instanceof Error ? err.message : String(err ?? '')}`;
  return /quota|resource_exhausted|429|rate.?limit/i.test(text);
}

export function extractErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) {
    const trimmed = err.message.trim();
    // Google/Groq-style errors arrive as "ApiError: {...json...}" (or raw JSON).
    // Decode them into a readable one-liner.
    const brace = trimmed.indexOf('{');
    if (brace >= 0) {
      try {
        const parsed = JSON.parse(trimmed.slice(brace)) as {
          error?: { message?: unknown; status?: unknown; code?: unknown };
        };
        const apiMsg = parsed?.error?.message;
        if (typeof apiMsg === 'string' && apiMsg.trim()) {
          const code = typeof parsed.error?.code === 'number' ? parsed.error.code : undefined;
          const status = typeof parsed.error?.status === 'string' ? parsed.error.status : undefined;
          const suffix = [code !== undefined ? `HTTP ${code}` : undefined, status].filter(Boolean).join(' · ');
          return suffix ? `${apiMsg} (${suffix})` : apiMsg;
        }
      } catch {
        // Not JSON — fall through to the raw message.
      }
    }
    return trimmed;
  }
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err) ?? String(err);
  } catch {
    return String(err);
  }
}
