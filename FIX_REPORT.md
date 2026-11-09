# AARUTO_ANIME.AI — Fix & Hardening Report

**Date:** 2026-11-09  
**Branch:** `main` (local)  
**Tests:** 35 passed, typecheck clean, lint clean, build green  
**Deployment:** NOT performed (see advisory note in README)

## 1. What was done

### 1.1 Secrets removed from the frontend
- Deleted `.env.local` which contained live production keys (`VITE_GEMINI_API_KEY`, `VITE_GROQ_API_KEY`, `VITE_POLLINATIONS_API_KEY`).
- Removed `.github/workflows/netlify-deploy.yml`'s `VITE_GEMINI_API_KEY` build secret; replaced with server-side `GROQ_API_KEY`.
- Rewrote `vite.config.ts`: **no longer injects** `process.env.API_KEY` into bundles.
- Deleted `geminiService.ts`, `groqService.ts`, `pollinationsService.ts` (client-side AI clients that shipped keys).
- Rewire AI via same-origin `/api/...` — keys never reach the browser.
- `.env.example` restructured to server-only variable names with explanatory comments.

### 1.2 Server-side secure core (new)
- `netlify/functions/core.mjs` (Netlify / local Node)
  - `scryptHash` / `scryptVerify` — uses Node's built-in `scrypt` (N=2^14 iterations), constant-time comparison, no external native dependency.
  - `sessions` — signed session tokens + in-memory `Map` + revocation list; 8 h TTL; `Set-Cookie` with `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` when `NODE_ENV=production`.
  - `checkRateLimit` — **token bucket** per (route × IP) or (route × email) to prevent brute-force signup/login/AI flood.
  - `normalizeDesign` — coerces and clamps all AI-generated stats 1–100; ensures arrays are strings; truncates runaway strings.
  - `groqChat` — server-side proxy for `api.groq.com/openai/v1/chat/completions`; `AbortSignal.timeout(30_000)`; propagates provider errors sanitized.
  - `pollinationsImage` — server-side proxy for `https://image.pollinations.ai/prompt/<prompt>`; validates content-type `image/*`; converts to base64 data URL.
- `netlify/functions/api.mjs` — routes `/auth/signup|login|logout|me`, `/ai/design|evolve|updateField|lore|sensei|image|audio`, `/admin/stats`. Returns only public shapes; never returns `GROQ_API_KEY`.
  - **Signup**: Zod-less validation (email regex + length, password ≥ 8 chars), `429` rate-limited per-IP (5/hr), `scrypt` password hashed (N=2^14).
  - **Login**: identical hashing; per-email 8/5min + per-IP 20/5min buckets; rejects missing users identically to mismatched passwords (uniform 401) to frustrate user enumeration.
  - **Admin**: no hard-coded credentials. `ADMIN_EMAIL` + `ADMIN_PASSWORD_SCRYPT` (server-side scrypt) grant `isAdmin=true`.
  - **AI endpoints**: all require cookie session; per-user 20/min overall (5/min image); prompts capped at 500 chars; body ≤ 16 KB; no raw provider errors surfaced verbatim.
- `api-server.mjs` — mirrors Netlify Function locally so `npm run dev` (Vite on 3010) proxies `/api/*` to `127.0.0.1:8787`.

### 1.3 Auth rewritten server-side
- Replaced browser `btoa(unescape(encodeURIComponent(...)))` admin credentials and localStorage-based `{email, password}` plaintext/JS checks with server-side sessions.
- `src/lib/authCrypto.ts` deleted; `hashPassword` now runs **only on the server**.
- `src/App.tsx` — removed `ADMIN_EMAIL`/`ADMIN_PASS`, removed `readStoredUsers`, `writeStoredUsers`, legacy plaintext migration logic; authentication calls `POST /api/auth/{signup,login,logout}` over same-origin fetch; cookie bears identity; no localStorage user records at all.
- `src/App.tsx` handleAuth now: validates email/password format client-side (helpful UX), sends to server, shows server-provided messages; on failure does NOT reveal whether an account exists.
- UI “Sessions: n” badge renamed to `“Summoner” / “Admin”`; no lengthy session cookie text is shown.

### 1.4 Data & storage
- Local user store removed; history is stored client-side in IndexedDB (same UX, no privacy regression for single-user/device).
- `src/lib/authCrypto.ts` and its tests deleted.
- `StoredUser` interface removed from `src/types.ts`.

### 1.5 Dependencies & tooling
- `vitest` upgraded `^3` → `^5.1.x`; `minimatch` override added for `@typescript-eslint/typescript-estree` → resolved **10 npm vulnerabilities (2 critical / 8 moderate → 0)**.
- `@google/genai` removed from `package.json` (zero dependents) + 4 other transitive unused packages.
- `eslint.config.js` now ignores generated `.mjs` server code correctly and includes Node globals for `netlify/` + `api-server.mjs`.
- `package.json` scripts: `dev:api` (`node api-server.mjs`) added.

### 1.6 Docs & CI
- `.env.example` rewritten with server-only variables and inline help; includes `ADMIN_PASSWORD_SCRYPT` generation one-liner.
- `README.md`, `NETLIFY_DEPLOY.md`, `netlify.toml` — updated with architecture, post-deploy checklist, Orpheus TTS terms note.
- `.github/workflows/netlify-deploy.yml` — updated to server-side env var names (`GROQ_API_KEY`, `POLLINATIONS_API_KEY`); **note**: publishing the workflow still requires the `workflow` scope (`gh auth refresh -h github.com -s workflow`).
- `index.html` — removed `cdn.tailwindcss.com`, import map, and CDN Tailwind; Tailwind built at build time; metadata.json retained.
- `netlify.toml` — `/api/*` redirect precedes SPA fallback; CORS-restricted asset paths.

## 2. Verification (local run)

```
npm install            ✓
npm run typecheck      ✓ (0 errors)
npm run lint           ✓ (0 errors, 0 warnings fixed)
npm test               ✓ (35 tests passing)
npm run build          ✓ (295 KB bundle, gzip 95 KB)
```

## 3. Required environment variables

Set these before deploying:

| Variable | Required | Reason |
|---|---|---|
| `GROQ_API_KEY` | **Yes** | Groq API key (free tier) |
| `GROQ_TEXT_MODEL` | No | Default `qwen/qwen3.8-27b` |
| `POLLINATIONS_API_KEY` | No | If omitted, Pollinations is used anonymously (lower rate limits) |
| `ADMIN_EMAIL` | No | Admin account email (no admin if unset) |
| `ADMIN_PASSWORD_SCRYPT` | No | `scrypt:<salt_hex>:<hash_hex>` admin hash — generate once via Node; never commit |
| `SESSION_TTL_MS` | No | Default `28800000` (8 h) |

## 4. Remaining limitations / follow-ups

- Sessions are in-memory → loss on cold instance; swap for Redis/Upstash/Netlify Blobs.
- In-memory user store → implement persistence (Postgres on Neon / Netlify Postgres) before Internet exposure.
- No CSP header yet (intentional to keep shipping: add `Content-Security-Policy` with nonce-based scripts once inline styles are eliminated).
- Image downloads still rely on `data:image/svg+xml` fallback when Pollinations quota fails – consider validating MIME type with `Magic bytes` server-side.
- `AUDIT_REPORT.md` is committed intentionally — review finding #7 before exposing publicly.

## 5. Command record

```bash
npx tsc --noEmit          ✓
npx eslint .              ✓
npx vitest run            ✓ 35 passing
npm run build             ✓ dist/index.html (1.45 kB) gzip ≈ 0.81 kB
```
