# AARUTO_ANIME.AI — Netlify Deployment Guide

React SPA + Netlify Functions (server-side API). Deploy to GitHub + Netlify.

## 1. Install & verify locally

```bash
npm install
cp .env.example .env
# edit .env — add GROQ_API_KEY; optionally POLLINATIONS_API_KEY and ADMIN_* credentials
npm run dev:api   # http://127.0.0.1:8787
npm run dev       # http://localhost:3010  (Vite proxies /api → 127.0.0.1:8787)
npm test
npm run build
```

## 2. Environment variables

Set in **Netlify UI → Site configuration → Environment variables** (or `.env` locally):

| Name | Required | Notes |
|---|---|---|
| `GROQ_API_KEY` | Yes | Groq API key (free tier). https://console.groq.com/keys |
| `GROQ_TEXT_MODEL` | No | Defaults to `qwen/qwen3.8-27b` |
| `POLLINATIONS_API_KEY` | No | Optional Pollinations key; anonymous flux works without it |
| `ADMIN_EMAIL` | No | Email for the admin account (optional) |
| `ADMIN_PASSWORD_SCRYPT` | No | Scrypt hash of admin password in `scrypt:<salt>:<hash>` format. Use `node -e "console.log(require('crypto').scryptSync('pw', require('crypto').randomBytes(16), 64).toString('hex'))"`. If unset, no admin exists. |

**Never** put these in `VITE_*` or client-side variables — the client calls `/api/...` only.

## 3a. GitHub + Netlify (recommended)

1. Push this repository to GitHub.
2. Netlify → Add new site → Import an existing project → pick the repository.
3. Build settings (auto-detected): command `npm run build`, publish `dist`, Node 20.11.1.
4. Add environment variables in Netlify UI before deploying.
5. Deploy. SPA + API are wired in `netlify.toml`: `/api/*` → `.netlify/functions/api`, other paths → `index.html`.

## 3b. GitHub Actions

`.github/workflows/netlify-deploy.yml` runs on every push/PR to `main`:

1. `npm ci` → typecheck → lint → test → build
2. On push to main only, `netlify-cli deploy --prod --dir=dist`.

Required secrets: `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID` (deploy), `GROQ_API_KEY`, `POLLINATIONS_API_KEY` (build).

**Publishing the workflow file requires the `workflow` scope:** `gh auth refresh -h github.com -s workflow`.

## 3c. Manual deploy with Netlify CLI

```bash
npm install -g netlify-cli
netlify login
npm run build
netlify deploy --prod --dir=dist
```

## 4. Post-deploy checklist
- [ ] Site loads, login/signup works (server-side authentication)
- [ ] MANIFEST produces a design (Groq via `/api/ai/design`) and image (Pollinations via `/api/ai/image`)
- [ ] Evolve / Expand World / Theme audio work
- [ ] Share link (`#/summon/...`) works
- [ ] History persists (IndexedDB)
- [ ] Security headers present
- [ ] `https://your-site/api/health` returns `{"groq":true,...}`

## Troubleshooting
- 404 on `/api/*` → `netlify.toml` must list the `/api/*` redirect before `/*`.
- `429` → rate limited, wait and retry.
- CORS/cookie errors → clear cookies for the domain; ensure `SESSION_TTL_MS` and cookies aren’t blocked.
- Images are SVG → Pollinations unavailable (anonymous quota / key cooldown); the app falls back to local Spectral Sketches.
- Orpheus TTS: `400 model_terms_required` → one-time terms acceptance at
  https://console.groq.com/playground?model=canopylabs%2Forpheus-v1-english
