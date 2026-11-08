# AARUTO_ANIME.AI — Netlify Deployment Guide

## Prerequisites
- Node.js ≥ 20.11.1 and npm ≥ 10 installed locally
- A Netlify account
- A Google Gemini API key (`https://aistudio.google.com/apikey`)

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
| `VITE_GEMINI_API_KEY` | Yes | Embedded in the client bundle — see README "Security notes" |
| `VITE_GROQ_API_KEY` | No | Free Groq key — automatic text-generation fallback when Gemini fails |
| `VITE_POLLINATIONS_API_KEY` | No | Free Pollinations key — free flux image fallback when Gemini fails |
| `VITE_ADMIN_EMAIL` | No | Optional demo admin account |
| `VITE_ADMIN_PASSWORD` | No | Optional demo admin password |

Locally the same values go in `.env.local` (git-ignored).

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

## 3c. Manual deploy with Netlify CLI

```bash
npm install -g netlify-cli
netlify login
npm run build
netlify deploy --prod --dir=dist
```

## 4. Post-deploy checklist

- [ ] Site loads, login/signup works
- [ ] MANIFEST generates a design + image (key present, browser console clean)
- [ ] Evolve / Expand World / Theme audio all work
- [ ] Share link (`#/summon/...`) opens and imports the chronicle
- [ ] History persists across reloads (IndexedDB — check DevTools → Application)
- [ ] PNG download works
- [ ] Security headers present (`X-Content-Type-Options`, `Referrer-Policy`, …) — see `netlify.toml`

## Troubleshooting

| Issue | Fix |
|---|---|
| Blank page | Open DevTools console; usually a missing `VITE_GEMINI_API_KEY` or a stale deploy |
| "Missing Gemini API key" banner | Env var not set for this deploy context; set it in Netlify UI and redeploy |
| `npm ci` fails in CI | `package-lock.json` must be committed — it is part of this repo now |
| Routes 404 | `netlify.toml` ships the SPA rewrite `/* → /index.html` |
| API errors 429 | Key quota — check Google AI Studio. **Note:** with a free-tier key, `429` + `limit: 0` for `gemini-*-image*` means image generation is not available at all without billing. The app auto-manifests **Spectral Sketch** portraits and **landscapes** (local SVG, no API cost) instead; text + audio features still work |
| HTTP 401 · UNAUTHENTICATED / "API key not valid" | The key was copied incorrectly or is not a Gemini API key. Re-copy it from <https://aistudio.google.com/apikey> and verify with **Settings → TEST KEY** (1-token ping) |
| Image generation returns nothing | Often quota; the app retries transient errors and JONIN falls back to the flash model |
