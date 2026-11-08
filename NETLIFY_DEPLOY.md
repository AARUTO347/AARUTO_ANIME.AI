# AARUTO_ANIME.AI — Netlify Deployment Guide

## Prerequisites
- Node.js ≥ 20.11.1 and npm ≥ 10 installed locally
- A Netlify account
- A free Groq API key (`https://console.groq.com/keys`) — text + TTS
- (Optional) A free Pollinations API key (`https://enter.pollinations.ai`) — higher image rate limits

## 1. Verify the build locally

```bash
npm install
npm run build
npm run preview   # http://localhost:4173
```

`npm run build` must finish green (it runs `tsc --noEmit` first). The output is `dist/`.

## 2. Configure environment variables

Set these in **Netlify UI → Site configuration → Environment variables** (never commit them):

| Variable | Required | Notes |
|---|---|---|
| `VITE_GROQ_API_KEY` | Recommended | Free Groq key — text + Orpheus TTS |
| `VITE_GROQ_TEXT_MODEL` | No | Override Groq model (default `qwen/qwen3.8-27b`) |
| `VITE_POLLINATIONS_API_KEY` | No | Free Pollinations key — higher free image limits |
| `VITE_ADMIN_EMAIL` | No | Optional demo admin account |
| `VITE_ADMIN_PASSWORD` | No | Optional demo admin password |

Locally the same values go in `.env.local` (git-ignored).

**Orpheus TTS terms:** the free theme-music model requires a one-time acceptance at <https://console.groq.com/playground?model=canopylabs%2Forpheus-v1-english>. Until accepted, the theme button gracefully speaks with the browser's built-in voice.

## 3a. GitHub integration (recommended)

1. Push this repository to GitHub.
2. Netlify → **Add new site → Import an existing project** → pick the repo.
3. Build settings (auto-detected from `netlify.toml`):
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Node 20.11.1
4. Add the environment variables from step 2 in the Netlify UI.
5. Deploy. SPA fallback, security headers and immutable asset caching are preconfigured in `netlify.toml`.

## 3b. GitHub Actions

`.github/workflows/netlify-deploy.yml` runs on every push/PR to `main`:

1. `npm ci` → typecheck → lint → test → build
2. On **push to main only**, deploys `dist/` with `netlify-cli deploy --prod`

Required repo secrets: `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID` (deploy), and the `VITE_*` variables from step 2 (build). PRs only build — they never deploy.

Publishing `.github/workflows/netlify-deploy.yml` to GitHub requires the `workflow` scope on your `gh` token (`gh auth refresh -h github.com -s workflow`).

## 3c. Manual deploy with Netlify CLI

```bash
npm install -g netlify-cli
netlify login
npm run build
netlify deploy --prod --dir=dist
```

## 4. Post-deploy checklist

- [ ] Site loads, login/signup works
- [ ] MANIFEST generates a design (Groq) and an image (Pollinations)
- [ ] Evolve / Expand World / Theme audio all work
- [ ] Share link (`#/summon/...`) opens and imports the chronicle
- [ ] History persists across reloads (IndexedDB — check DevTools → Application)
- [ ] PNG/SVG download works
- [ ] Security headers present (`X-Content-Type-Options`, `Referrer-Policy`, …) — see `netlify.toml`
- [ ] **Settings → TEST KEY** shows Groq ✓ and Pollinations status correctly

## Troubleshooting

| Issue | Fix |
|---|---|
| Blank page | Open DevTools console; usually a missing `VITE_GROQ_API_KEY` or a stale deploy |
| Groq 401/INVALID_API_KEY | Key is wrong or missing — verify at <https://console.groq.com/keys> and redeploy |
| Groq 429 | Rate limit — free tier is fine for personal use; retry shortly |
| Orpheus TTS: "model requires terms acceptance" | One-time: open <https://console.groq.com/playground?model=canopylabs%2Forpheus-v1-english> and accept the terms |
| Images fail with 5xx/429 | Pollinations "classic at limit" is transient — the app retries and then falls back to a local Spectral Sketch (SVG) automatically |
| `npm ci` fails in CI | `package-lock.json` is committed — keep it in sync when changing deps |
| Routes 404 | `netlify.toml` ships the SPA rewrite `/* → /index.html` |
