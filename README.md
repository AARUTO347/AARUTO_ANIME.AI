# AARUTO_ANIME.AI

> The ultimate character summoning engine. Forge legendary anime personas with high-fidelity AI visuals and deep lore generation.

React 19 + TypeScript + Vite single-page app powered by the Google Gemini API. Generate anime character designs, visualize them, evolve them, expand their worlds, synthesize their theme music, and chat with an AI "Omni-Sensei".

## Quick start

**Prerequisites:** Node.js ≥ 20.11.1, npm ≥ 10

```bash
npm install
cp .env.example .env.local   # then put your key in .env.local
npm run dev                  # http://localhost:3000
```

Required environment variable in `.env.local`:

```
VITE_GEMINI_API_KEY=your_gemini_api_key_here
```

Get a key at <https://aistudio.google.com/apikey>.

> **No key configured?** The app still runs, but a warning banner is shown and every generation will fail with a clear error.

> **Free-tier keys and image generation.** The Gemini API free tier gives **zero quota** for image models (`gemini-2.5-flash-image`, `gemini-3-pro-image-preview`, …). Text features (designs, lore, Sensei, stat re-rolls) and **theme audio** work for free; MANIFEST/evolve images return `429 RESOURCE_EXHAUSTED (limit: 0)` without billing. The app automatically manifests a **Spectral Sketch** (deterministic local SVG portrait, seeded from the design — zero API cost) in place of the image, and keeps the design either way. To test your key, use **Settings → TEST KEY** (1-token ping).

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

- **AI character design** — structured JSON output (name, title, stats, powers, lore, homeworld, visual traits) via `gemini-3-flash-preview`
- **Image materialization** — `GENIN`/`CHUNIN` tiers use `gemini-2.5-flash-image` (fast / high-detail); `JONIN` uses `gemini-3-pro-image-preview` at 1K–2K with automatic fallback to flash-image. See `src/lib/quality.ts`
- **Evolution system** — one-click ascension (stats clamped 1–100, stage increments enforced)
- **World expansion** — 16:9 environment render of the character's homeworld
- **Spectral Sketch (free mode)** — deterministic, locally generated SVG spirit-portraits **and homeworld landscapes** (seeded by identity/homeworld: palette from aesthetic, element glow from powers, crown/horns by evolution stage). Zero API cost — manifests whenever image generation fails, e.g. free-tier keys where all image models have quota 0
- **Theme audio** — TTS-based theme narration via `gemini-2.5-flash-preview-tts` (works on the free tier)
- **Free hosted images via Pollinations** — set `VITE_POLLINATIONS_API_KEY` (<https://enter.pollinations.ai>) and MANIFEST/evolve/expand-world render real flux images for **free** whenever Gemini image generation fails (works anonymously too). Full chain: Gemini → Pollinations → Spectral Sketch (local SVG)
- **Optional free Groq fallback** — set `VITE_GROQ_API_KEY` (free at <https://console.groq.com/keys>) and every text call (design / evolution / oracle / sensei / re-rolls) automatically falls back to Groq's free `qwen/qwen3.8-27b` when Gemini fails (quota, bad key, network). Gemini stays primary. Groq has no image models, so visuals remain Gemini or Spectral Sketch
- **Akashic Oracle** — in-sheet lore chat grounded in the character's context
- **Omni-Sensei** — general AI companion chat (separate from generation state)
- **Temporal History + Eternal Archive** — persisted in IndexedDB (no localStorage quota crashes), with grid/list views
- **Share chronicles** — Unicode-safe base64url link (`#/summon/...`) that imports the design into another session
- **PNG download** — save the manifestation directly
- **Backup & restore** — export/import history, scrolls and settings as JSON from the settings modal
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
│   │   ├── aiService.ts        # Facade: Gemini primary → Groq automatic fallback (text)
│   │   ├── geminiService.ts    # Gemini API client (retry, validation, images, TTS)
│   │   └── groqService.ts      # Groq free Llama API client (text, OpenAI-compatible)
│   └── lib/                    # Pure, unit-tested logic
│       ├── storage.ts          # IndexedDB persistence + migration + backup
│       ├── shareCodec.ts       # UTF-8-safe base64url share links
│       ├── design.ts           # Design normalization & stat clamping
│       ├── quality.ts          # GENIN/CHUNIN/JONIN → model mapping
│       ├── prompts.ts          # Shared prompt bodies (both providers)
│       ├── aiFallback.ts       # shouldFallbackToGroq (quota/401/5xx/network)
│       ├── safeJson.ts         # Labelled JSON parse errors (fence-stripping)
│       ├── spectralPortrait.ts # Local SVG portraits & landscapes (free image mode)
│       ├── authCrypto.ts       # SHA-256 password hashing (demo auth)
│       └── *.test.ts           # Vitest unit tests
├── vite.config.ts              # Vite + Vitest config
├── tailwind.config.js
├── netlify.toml
└── .github/workflows/netlify-deploy.yml
```

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `VITE_GEMINI_API_KEY` | Yes | Gemini API — design/images/TTS (free tier: text + audio only) |
| `VITE_GROQ_API_KEY` | No (recommended) | Free Groq key (<https://console.groq.com/keys>) — automatic text-generation fallback when Gemini fails (quota/auth/network), or primary when no Gemini key is set |
| `VITE_POLLINATIONS_API_KEY` | No (recommended) | Free Pollinations key (<https://enter.pollinations.ai>) — free hosted flux image generation when Gemini image fails; works anonymously too |
| `VITE_GROQ_TEXT_MODEL` | No | Override Groq model (default `qwen/qwen3.8-27b`) |
| `VITE_ADMIN_EMAIL` / `VITE_ADMIN_PASSWORD` | No | Optional demo admin account (build-time, public in the bundle) |

Verify both providers with **Settings → TEST KEY** (1-token ping each).

## Security notes (read before deploying publicly)

This is a **client-side-only** app. Understand what that means:

1. **Your Gemini API key ships in the browser bundle.** Anyone who opens the deployed site can extract and abuse it. For a public deployment, either restrict the key (HTTP referrer restrictions in Google AI Studio) or move the Gemini calls behind a serverless proxy (e.g. Netlify Functions). The `.env.example` documents the current model.
2. **Demo auth is not real auth.** Accounts are stored in the browser's localStorage with SHA-256-hashed passwords. There is no server, no sessions, no rate limiting, no password reset. Do not reuse a real password.
3. **The optional admin account** is configured at build time via `VITE_ADMIN_EMAIL` / `VITE_ADMIN_PASSWORD` and is equally public (it is embedded in the bundle). Use it only for demos — never for protecting anything real. If unset, no admin account exists.
4. Share links encode the character design in the URL itself; treat them as public data.

## Deployment

See [NETLIFY_DEPLOY.md](./NETLIFY_DEPLOY.md) for Netlify (GitHub integration, CLI, or the included GitHub Action). Any static host works — `npm run build` → publish `dist/` with an SPA fallback to `/index.html`.

## Testing

Unit tests cover the pure logic (share codec round-trip incl. multi-byte Unicode, stat clamping, design normalization, quality-tier mapping, credential hashing + pure-TS SHA-256 vs Web Crypto, Groq-fallback decision logic, spectral portrait/environment determinism, error-message decoding). Run `npm test`. React rendering is exercised manually via `npm run dev`.

## License

© 2025 AARUTO-347. All rights reserved.
