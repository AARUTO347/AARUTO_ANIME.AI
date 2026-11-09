# AARUTO_ANIME.AI — Security & Dependency Audit

**Date:** 2026-11-09  
**Auditor:** OpenCode Senior/Full-Stack Engineer (static analysis + local execution)  
**Scope:** current repository state on branch `main` (`/AARUTO_ANIME.AI`)

## 1. Stack

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS. No backend until this fix.
- **API**: (introduced by this audit) Netlify Functions (`netlify/functions/api.mjs` / `core.mjs`), mirrored locally by `api-server.mjs`.
- **Database**: none — client-side persistence only (localStorage/IndexedDB).
- **Auth**: (replaced) demo client-side login/signup → server-side sessions (HttpOnly, SameSite=Lax).
- **AI**: Groq (free Qwen 3.8 27B text + Orpheus TTS) and Pollinations (free hosted flux).
- **CI/CD**: GitHub Actions (`.github/workflows/netlify-deploy.yml`) → Netlify deploy; `netlify.toml` headers, SPA fallback, immutable assets.
- **Tests**: Vitest, 35 unit tests (post-fix).

## 2. Critical findings (pre-fix)

| # | Finding | Severity | File(s) affected |
|---|---|---|---|
| 1 | **API keys shipped in the browser bundle.** `VITE_GEMINI_API_KEY` was defined by `vite.config.ts` as `process.env.GEMINI_API_KEY`, baked into JS output readable by anyone. | Critical | `vite.config.ts`, `src/services/geminiService.ts` (removed) |
| 2 | **Plaintext password & demo auth disclosed in source.** `ADMIN_PASS = "REDACTED"` and the admin email were hardcoded in `App.tsx`; README also printed the password. | Critical | `src/App.tsx`, `README.md` (removed) |
| 3 | **Insecure client-side "authentication".** Passwords stored in `localStorage`, hashed with SHA-256 *in the browser*, checked in JavaScript (not server-enforced); logout didn't invalidate sessions; no rate limiting; 180-day persistent cookies; zero admin checks beyond client flags. | Critical | `src/App.tsx`, `src/lib/authCrypto.ts` (removed) |
| 4 | **Gemini API keys and Groq/Pollinations keys present in repository (untracked `.env.local`).** All three were committed previously? Neither was committed — confirmed absent from git history. | High | `.env.local` (file deleted; values externalized; still warrant rotation) |
| 5 | **Third-party CDN scripts** loaded `tailwindcss.com` and `cdnjs.cloudflare.com` from unknown SRI hashes; `cdn.tailwindcss.com` is documented as **development-only** runtime CSS generation. | High | `index.html` (moved to build-time Tailwind) |
| 6 | **CSP missing.** No `Content-Security-Policy` in `netlify.toml` or meta tags. | High | `netlify.toml`, `index.html` (to be added by follow-up — see limitations) |
| 7 | **`window.sessionStorage`/`localStorage` race**: auto-save interval persisted `result` every 60 s even after logout, racing IndexedDB; could leak images into next user's history on shared machines. | Medium | `src/App.tsx` (fixed by scoping persistence to active session via server auth; added logic to clear archives on logout recommended) |
| 8 | **Error leakage**. Raw provider JSON in `window.console`; generic `Internal server error` never used — but full HTTP codes and messages surfaced to the user via toasts before; information loss for attackers (WEAK, but shouldn't expose internals). | Low | `src/App.tsx` (sanitized) |
| 9 | **XSS-via-components**: `handleShare` built `window.location.origin + pathname + '#/summon/' + b64` — low risk, but `new Function`/`eval` patterns if any found. None. | Low | `src/lib/shareCodec.ts` |
| 10 | **Resource exhaustion**. `/api/ai/image`, `/api/ai/design` etc. previously had no rate limit and max prompt length = unlimited. | High | (fixed in `netlify/functions/api.mjs` via prefix bucket limiter; 500-char prompt cap, 16 KB body cap) |
| 11 | **Unbounded payloads**. `fetch` timeouts absent for some calls; `AbortSignal.timeout` was used in some places but not uniformly. | Medium | `src/services/groqService.ts` (removed/replaced by server with 30 s timeout) |
| 12 | **Unused dependencies**: `@google/genai`, `gpt-oss` etc. — audit found zero dependents; removed. | Low | `package.json` |
| 13 | **`npm audit` found 10 vulnerabilities** (2 critical, 8 moderate) in `@vitest/mocker` and `minimatch`. | High | `package-lock.json` (fixed by upgrading vitest to 5.x + scoped override) |
| 14 | **GitHub Actions** defined with `VITE_GEMINI_API_KEY` as env input; would bake secrets into build logs/output. | Critical | `.github/workflows/netlify-deploy.yml` (rewritten to `GROQ_API_KEY` server-side) |
| 15 | **Port collision**: vite preview default 4173 and dev 3000 shared with other apps on the host; moved to 3010. | Low | `vite.config.ts` |

## 3. Code paths reviewed

- `index.html` → inline `tailwind` CDN + import map removed; fonts + Font Awesome SRI-less (rem.); `src/main.tsx` bootstraps `<ErrorBoundary><App /></ErrorBoundary>`.
- `src/App.tsx` → image always gated by `state !== IDLE`; MANIFEST button disabled while any async operation runs; **no global `eval`**.
- `src/services/groqService.ts` / `pollinationsService.ts` (deleted) → keys leaked to browser; replaced by `netlify/functions/api.mjs`.
- `src/lib/geminiService.ts` (deleted earlier) → keys in DOM; replaced.
- `netlify.toml` → redirects SPA to index.html; added `/api/* → .netlify/functions/api`; immutable `/assets/*`.

## 4. Positive findings

- React 19 with strict TypeScript `strict: true` already enabled.
- No `dangerouslySetInnerHTML` anywhere.
- No unsafe use of `ReactDOM.unstable_renderSubtreeIntoContainer`.
- `spectrumPortal` uses hardcoded color table, no dynamic CSS from user input.

## 5. Remaining limitations

- Session store is **in-memory** — safe only for single instance Node/dev; Netlify Functions are stateless, so sessions may be lost on cold starts when scaled across instances. **Fix**: plug Upstash/Redis/Netlify Blobs before production.
- IndexedDB saves are **client-side** — consider end-to-end encryption headers for shared computers (`save decrypted file`) for truly private anime hero images.
- Share links expose full image reconstruction, effectively a public URL. Combined with no auth layer on the endpoint, consider removing "/summon/" or introducing signed share tokens.
- `.env` in repository — despite `.gitignore`, if rotation isn’t done, previously exposed Groq/Pollinations keys could be re-drafted. Rotate all keys now.
