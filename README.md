# AARUTO_ANIME.AI

> The ultimate character summoning engine. Forge legendary anime personas with high-fidelity AI visuals and deep lore generation.

**A 100% free stack** — React 19 + TypeScript + Vite SPA powered entirely by free tiers: **Groq** (free Qwen 3.8 27B for text, Orpheus TTS for theme music) and **Pollinations** (free hosted flux image generation, anonymous or keyed), with **local SVG fallbacks** for offline/quota-proof art. No Gemini, no billing, no credit card required.

## Quick start

**Prerequisites:** Node.js ≥ 20.11.1, npm ≥ 10

```bash
npm install
cp .env.example .env.local   # then put your free keys in .env.local
npm run dev                  # http://localhost:3000
```

Recommended free keys (both optional but advised; total setup < 2 minutes, no card):

| Variable | Where to get it | What it unlocks |
|---|---|---|
| `VITE_GROQ_API_KEY` | <https://console.groq.com/keys> | Text generation + Orpheus TTS |
| `VITE_POLLINATIONS_API_KEY` | <https://enter.pollinations.ai> | Higher image rate limits (works anonymously too) |

Orpheus TTS needs a **one-time terms acceptance** in the Groq console: <https://console.groq.com/playground?model=canopylabs%2Forpheus-v1-english> — until you click it, the theme button speaks with your browser's built-in voice instead.

> **No keys at all?** The app still runs; a warning banner tells you what's missing, and image generation works anonymously via Pollinations.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start the dev server (port 3000) |
| `npm run build` | Typecheck (`tsc --noEmit`) + production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | TypeScript strict-mode check |
| `npm run lint` | ESLint (flat config) |
| `npm test` | Vitest unit tests |

## Features

- **AI character design** — structured JSON output (name, title, stats, powers, lore, homeworld, visual traits) via Groq's free `qwen/qwen3.8-27b`
- **Evolution system** — one-click ascension (stats clamped 1–100, stage increments enforced)
- **Image materialization** — free hosted flux via Pollinations (`VITE_POLLINATIONS_API_KEY` or anonymous). Full chain: Pollinations → **Spectral Sketch** (deterministic local SVG spirit-portrait). History never loses a design when the image fails
- **Homeworld expansion** — 16:9 environment render (Pollinations, with local SVG landscape fallback)
- **Theme audio** — Groq Orpheus TTS (`canopylabs/orpheus-v1-english`, `autumn` voice). Requires one-time terms acceptance; falls back to browser speech synthesis automatically
- **Akashic Oracle** — in-sheet lore chat grounded in the character's context (Groq)
- **Omni-Sensei** — general AI companion chat (separate from generation state)
- **Temporal History + Eternal Archive** — persisted in IndexedDB (no localStorage quota crashes), with grid/list views
- **Share chronicles** — Unicode-safe base64url link (`#/summon/...`) that imports the design into another session
- **PNG/SVG download** — save the manifestation directly
- **Backup & restore** — export/import history, scrolls and settings as JSON from the settings modal
- **Settings → TEST KEY** — 1-token pings against Groq + Pollinations status in one click
- **Demo auth** — local accounts on this device with SHA-256-hashed passwords (see Security notes)

## Project structure

```
├── index.html                  # Entry HTML (no CDN react/importmap)
├── src/
│   ├── main.tsx                # React root + ErrorBoundary
│   ├── index.css               # Tailwind + custom styles
│   ├── App.tsx                 # App shell, auth screen, modals
│   ├── types.ts                # Shared TypeScript types
│   ├── components/
│   │   ├── CharacterSheet.tsx  # Character detail/editor panel
│   │   └── ErrorBoundary.tsx   # Recovery screen on render crash
│   ├── services/
│   │   ├── aiService.ts        # Unified facade: Groq text/TTS + Pollinations images
│   │   ├── groqService.ts      # Groq free API client (Qwen text + Orpheus TTS)
│   │   └── pollinationsService.ts  # Free hosted flux image client
│   └── lib/                    # Pure, unit-tested logic
│       ├── storage.ts          # IndexedDB persistence + migration + backup
│       ├── shareCodec.ts       # UTF-8-safe base64url share links
│       ├── design.ts           # Design normalization & stat clamping
│       ├── prompts.ts          # Shared prompt bodies + image prompt builder
│       ├── aiErrors.ts         # Google/Groq/Pollinations JSON error decoding
│       ├── bytes.ts            # ArrayBuffer → base64 (chunked)
│       ├── spectralPortrait.ts # Local SVG portraits & landscapes (free image mode)
│       ├── safeJson.ts         # Labelled JSON parse errors (fence-stripping)
│       ├── authCrypto.ts       # SHA-256 password hashing (demo auth, with pure-TS fallback)
│       └── *.test.ts           # Vitest unit tests
├── vite.config.ts              # Vite + Vitest config
├── tailwind.config.js
├── netlify.toml
└── .github/workflows/netlify-deploy.yml
```

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `VITE_GROQ_API_KEY` | Recommended | Free Groq key — text + Orpheus TTS |
| `VITE_GROQ_TEXT_MODEL` | No | Override Groq model (default `qwen/qwen3.8-27b`) |
| `VITE_POLLINATIONS_API_KEY` | No | Free Pollinations key — raises free image rate limits |
| `VITE_ADMIN_EMAIL` / `VITE_ADMIN_PASSWORD` | No | Optional demo admin account (build-time, public in the bundle) |

Verify providers with **Settings → TEST KEY** (1-token ping + provider status).

## Security notes (read before deploying publicly)

This is a **client-side-only** app. Understand what that means:

1. **All API keys ship in the browser bundle.** Anyone who opens the deployed site can extract them. The free keys move slowly to abuse but still abuseable — for a public deployment, either use spend limits or move calls behind a serverless proxy (e.g. Netlify Functions).
2. **Demo auth is not real auth.** Accounts are stored in the browser's localStorage with SHA-256-hashed passwords. There is no server, no sessions, no rate limiting, no password reset. Do not reuse a real password.
3. **The optional admin account** is configured at build time via `VITE_ADMIN_EMAIL` / `VITE_ADMIN_PASSWORD` and is equally public. Use it only for demos — never for protecting anything real.
4. Share links encode the character design in the URL itself; treat them as public data.

## Deployment

See [NETLIFY_DEPLOY.md](./NETLIFY_DEPLOY.md) for Netlify (GitHub integration, CLI, or the included GitHub Action). Any static host works — `npm run build` → publish `dist/` with an SPA fallback to `/index.html`.

## Testing

Unit tests cover the pure logic (share codec round-trip incl. multi-byte Unicode, stat clamping, design normalization, credential hashing + pure-TS SHA-256 vs Web Crypto, spectral portrait/environment determinism, error-message decoding). Run `npm test`. React rendering is exercised manually via `npm run dev`.

## License

© 2025 AARUTO-347. All rights reserved.
