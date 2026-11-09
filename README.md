# AARUTO_ANIME.AI

> The ultimate character summoning engine. Forge legendary anime personas with high-fidelity AI visuals and deep lore generation.

**React SPA + Netlify Functions** — a secure server-side AI backend powered by **Groq** (free Qwen 3.8 27B text, Orpheus TTS) and **Pollinations** (free flux image generation), with local SVG fallbacks when providers are unavailable. No secrets in the browser bundle; all AI and authentication happen on the server.

## Quick start

```bash
npm install
cp .env.example .env
# edit .env — add GROQ_API_KEY (required for text/TTS); optionally POLLINATIONS_API_KEY (free flux)
npm run dev:api   # starts the local API on 127.0.0.1:8787
npm run dev       # http://localhost:3010  (Vite proxies /api → the local API)
```

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run dev:api` | Start local API server |
| `npm run build` | Production build with typecheck |
| `npm run preview` | Preview the production build |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests |

## Architecture

- **Frontend** (`src/`) — React 19 + Tailwind + TypeScript. Never imports provider keys; all AI calls go to `/api/...`.
- **API** (`netlify/functions/`, mirrored locally by `api-server.mjs`) — trusted serverless/Node handler:
  - Auth: signup / login / logout / me. PBKDF-ish **scrypt** password hashing, **HttpOnly SameSite=Lax cookies**, per-IP + per-account **rate limiting**, in-memory session store (swap for Redis/Postgres in production).
  - AI: design, evolve, field re-roll, lore chat, sensei, image and theme audio — all server-side. Prompts are length-limited and validated; failures are caught and sanitized.
  - Admin: admin role is only granted if `ADMIN_EMAIL` matches **and** the supplied password verifies the server-stored `ADMIN_PASSWORD_SCRYPT` hash. No client-side admin flags.
- **Client** stores no user secrets; history/saves live in IndexedDB.

## Environment variables

| Name | Required | Purpose |
|---|---|---|
| `GROQ_API_KEY` | Yes | Groq API key (text + TTS). https://console.groq.com/keys |
| `GROQ_TEXT_MODEL` | No | Default `qwen/qwen3.8-27b` |
| `POLLINATIONS_API_KEY` | No | Optional Pollinations key; anonymous flux works without it |
| `ADMIN_EMAIL` | No | Email for optional admin account |
| `ADMIN_PASSWORD_SCRYPT` | No | Scrypt hash (`scrypt:<salt>:<hash>`). Generate with Node; see NETLIFY_DEPLOY.md |

**Never put these in `VITE_*` variables or any client-side env var.**

## Testing & audit

- 35 unit tests (Vitest). Run `npm test`.
- See `AUDIT_REPORT.md` for the full security audit and `FIX_REPORT.md` for applied fixes.
- `netlify.toml` configures Netlify: `/api/*` → `.netlify/functions/api`, SPA fallback to `index.html`, security headers, immutable asset caching.

## Deployment

Push to GitHub, connect to Netlify, set env vars, deploy. See `NETLIFY_DEPLOY.md`.

> **Security**: this repository deliberately pushes `AUDIT_REPORT.md` to surface any vulnerabilities for remediation. If you deploy publicly, treat the client-side store (IndexedDB) as untrusted and rely on server-side auth checks.

## License
© 2025 AARUTO-347. All rights reserved.
