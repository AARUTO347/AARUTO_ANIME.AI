import type { CharacterDesign } from '../types';

/**
 * Spectral Sketch — a deterministic, fully local fallback portrait for
 * free-tier keys (the Gemini API free tier has zero image quota).
 * Each character produces a unique "summoning sigil spirit" SVG:
 * palette from their aesthetic, element glow from their powers,
 * crown/horns from their evolution stage, seeded by their identity.
 */

const hashString = (input: string): number => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/** mulberry32 — small, fast, fully deterministic PRNG. */
const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const DEFAULT_PALETTES: Array<[string, string]> = [
  ['#ff6b00', '#ff003c'],
  ['#00e0ff', '#0066ff'],
  ['#a855f7', '#ff2d78'],
  ['#facc15', '#fb923c'],
  ['#34d399', '#0ea5e9'],
];

const AESTHETIC_PALETTES: Record<string, [string, string]> = {
  Cyberpunk: ['#00f2ff', '#ff00ff'],
  Steampunk: ['#ffd700', '#d2691e'],
  Gothic: ['#a855f7', '#2b0036'],
  'High Fantasy': ['#7dd3fc', '#facc15'],
  'Dark Fantasy': ['#ef4444', '#1c0a0a'],
  'Space Opera': ['#e2e8f0', '#1e3a8a'],
  Solarpunk: ['#4ade80', '#fbbf24'],
  'Art Nouveau': ['#e7d8c9', '#8b6f47'],
  Grimdark: ['#94a3b8', '#b91c1c'],
  'Classic Anime': ['#ff6b00', '#ff003c'],
  'Ufotable Style': ['#fb7185', '#6366f1'],
  'Studio Ghibli': ['#86efac', '#38bdf8'],
  'Retro 90s': ['#f472b6', '#22d3ee'],
  'Ink Wash': ['#e5e5e5', '#404040'],
  Realistic: ['#d6a77a', '#334155'],
  'Digital Concept': ['#22d3ee', '#a78bfa'],
  'Fantasy Oil': ['#fef08a', '#7c2d12'],
  'High-Impact Shonen': ['#ff9e00', '#ff2d2d'],
  'Vintage Manga': ['#f5f5f5', '#525252'],
};

const ELEMENT_RULES: Array<[RegExp, string]> = [
  [/fire|flame|pyro|ember|inferno|blaze|burn/, '#ff7a18'],
  [/ice|frost|cryo|glacier|freeze/, '#7dd3fc'],
  [/lightning|volt|thunder|bolt|electric|storm/, '#fde047'],
  [/water|aqua|hydro|tidal|ocean|sea/, '#38bdf8'],
  [/earth|stone|rock|terra|mountain|granite/, '#d4a373'],
  [/wind|gale|tempest|aero|cyclone/, '#5eead4'],
  [/holy|divine|radian|solar|dawn|light/, '#fff7ae'],
  [/dark|shadow|void|umbra|night|abyss/, '#c084fc'],
  [/tech|cyber|droid|machine|circuit|neon|steel/, '#22d3ee'],
  [/magic|arcane|mystic|spell|spirit/, '#f472b6'],
];

const elementColor = (powers: string[]): string => {
  for (const power of powers) {
    for (const [rule, color] of ELEMENT_RULES) {
      if (rule.test(power.toLowerCase())) return color;
    }
  }
  return '#ff9e00';
};

const paletteFor = (aesthetic: string, seed: number): [string, string] => {
  const exact = AESTHETIC_PALETTES[aesthetic];
  if (exact) return exact;
  const direct = Object.entries(AESTHETIC_PALETTES).find(([key]) =>
    aesthetic.toLowerCase().includes(key.toLowerCase()),
  );
  if (direct) return direct[1];
  return DEFAULT_PALETTES[seed % DEFAULT_PALETTES.length]!;
};

const f2 = (n: number) => Number(n.toFixed(2));

const polygonPoints = (cx: number, cy: number, r: number, sides: number, rotationDeg: number): string => {
  const pts: string[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = ((Math.PI * 2) / sides) * i + (rotationDeg * Math.PI) / 180 - Math.PI / 2;
    pts.push(`${f2(cx + r * Math.cos(angle))},${f2(cy + r * Math.sin(angle))}`);
  }
  return pts.join(' ');
};

/** Build the portrait SVG for a design (pure, deterministic). */
export function buildSpectralSvg(design: CharacterDesign): string {
  const identity = `${design.name}|${design.homeworld}|${design.powers.join(',')}|${design.evolutionStage}`;
  const seed = hashString(identity);
  const rand = mulberry32(seed);
  const [primary, secondary] = paletteFor(design.aesthetic, seed);
  const element = elementColor(design.powers);
  const stage = Math.max(1, Math.min(9, Math.round(design.evolutionStage || 1)));
  const haloSides = Math.max(5, Math.min(9, (design.powers.length || 3) + 3));
  const hairSpikes = 6 + Math.floor(rand() * 5); // 6–10
  const hornSpread = 108 + rand() * 14;

  // --- Hair silhouette (zig-zag spikes above the head) ---
  const hairBaseY = 372;
  const hairLeft = 228;
  const hairRight = 372;
  const hairPts: string[] = [`${hairLeft},${hairBaseY}`];
  for (let i = 0; i <= hairSpikes; i++) {
    const x = hairLeft + ((hairRight - hairLeft) / hairSpikes) * i;
    const up = 26 + rand() * 34;
    hairPts.push(`${f2(x - (hairRight - hairLeft) / hairSpikes / 2)},${f2(hairBaseY - up)}`);
    hairPts.push(`${f2(x)},${f2(hairBaseY - rand() * 8)}`);
  }
  hairPts.push(`${hairRight},${hairBaseY}`);

  // --- Spirit horns (stage ≥ 2) and energy crown (stage ≥ 3) ---
  const horns = stage >= 2
    ? `
  <!-- horns -->
    <path d="M ${f2(300 - hornSpread)} 420 L ${f2(300 - hornSpread - 14)} ${f2(420 - 58 - rand() * 22)} L ${f2(300 - hornSpread + 26)} 408 Z" fill="#12121a" stroke="${element}" stroke-width="2" stroke-opacity="0.85"/>
    <path d="M ${f2(300 + hornSpread)} 420 L ${f2(300 + hornSpread + 14)} ${f2(420 - 58 - rand() * 22)} L ${f2(300 + hornSpread - 26)} 408 Z" fill="#12121a" stroke="${element}" stroke-width="2" stroke-opacity="0.85"/>`
    : '';
  const crown = stage >= 3
    ? `
  <!-- crown -->
    <polygon points="300,${f2(236 - rand() * 10)} ${f2(272 + rand() * 8)},338 328,${f2(300 + rand() * 10)} 300,330 ${f2(328 - rand() * 8)},338 ${f2(300)},${f2(214 + rand() * 8)}" fill="none" stroke="${element}" stroke-width="2.5" stroke-opacity="0.9" filter="url(#fGlow)"/>`
    : '';

  // --- Rune ticks on the outer circle ---
  const runeTicks: string[] = [];
  for (let i = 0; i < 24; i++) {
    if (rand() < 0.22) continue; // knock out a few runes
    const a = (Math.PI * 2 * i) / 24;
    const r1 = 172;
    const r2 = 172 + (rand() < 0.3 ? 16 : 9);
    runeTicks.push(
      `<line x1="${f2(300 + r1 * Math.cos(a))}" y1="${f2(330 + r1 * Math.sin(a))}" x2="${f2(300 + r2 * Math.cos(a))}" y2="${f2(330 + r2 * Math.sin(a))}" stroke="${secondary}" stroke-width="2" stroke-opacity="0.8"/>`,
    );
  }

  // --- Stardust particles ---
  const particles: string[] = [];
  for (let i = 0; i < 30; i++) {
    const x = f2(36 + rand() * 528);
    const y = f2(30 + rand() * 730);
    const r = f2(0.7 + rand() * 1.6);
    const o = f2(0.35 + rand() * 0.6);
    particles.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="${i % 3 === 0 ? primary : '#ffffff'}" opacity="${o}"/>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800" role="img" aria-label="Spectral sketch of ${escapeXml(design.name)}">
  <defs>
    <radialGradient id="gGlow" cx="0.5" cy="0.42" r="0.75">
      <stop offset="0" stop-color="${primary}" stop-opacity="0.42"/>
      <stop offset="0.55" stop-color="${secondary}" stop-opacity="0.14"/>
      <stop offset="1" stop-color="#050505" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="gBody" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#111118"/>
      <stop offset="1" stop-color="#050505"/>
    </linearGradient>
    <radialGradient id="gFigure" cx="0.5" cy="0.35" r="0.9">
      <stop offset="0" stop-color="#1b1b26"/>
      <stop offset="1" stop-color="#0c0c12"/>
    </radialGradient>
    <linearGradient id="gFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#050505" stop-opacity="0"/>
      <stop offset="1" stop-color="#050505" stop-opacity="0.9"/>
    </linearGradient>
    <filter id="fGlow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="6" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="fSoft" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="16"/>
    </filter>
  </defs>

  <rect width="600" height="800" fill="url(#gBody)"/>
  <rect width="600" height="800" fill="url(#gGlow)"/>
  ${particles.join('\n  ')}

  <!-- summoning circle -->
  <circle cx="300" cy="330" r="196" fill="none" stroke="${primary}" stroke-width="2.5" stroke-opacity="0.8" stroke-dasharray="3 13"/>
  <circle cx="300" cy="330" r="150" fill="none" stroke="${secondary}" stroke-width="1.5" stroke-opacity="0.7" stroke-dasharray="1.5 9"/>
  <circle cx="300" cy="330" r="196" fill="none" stroke="${element}" stroke-width="3" stroke-opacity="0.28" filter="url(#fSoft)"/>
  <polygon points="${polygonPoints(300, 330, 118, haloSides, rand() * 360)}" fill="none" stroke="${primary}" stroke-width="1.6" stroke-opacity="0.9"/>
  <polygon points="${polygonPoints(300, 330, 118, haloSides, rand() * 360 + 180 / haloSides)}" fill="none" stroke="${secondary}" stroke-width="1" stroke-opacity="0.65"/>
  ${runeTicks.join('\n  ')}

  <!-- silhouette -->
  <path d="M 108 800 Q 146 618 300 600 Q 454 618 492 800 Z" fill="url(#gFigure)" stroke="${element}" stroke-width="1.4" stroke-opacity="0.55"/>
  <ellipse cx="300" cy="452" rx="64" ry="74" fill="url(#gFigure)" stroke="${element}" stroke-width="1.4" stroke-opacity="0.6"/>
  <polygon points="${hairPts.join(' ')}" fill="#16161f" stroke="${primary}" stroke-width="1.3" stroke-opacity="0.75"/>
  ${horns}
  ${crown}

  <!-- glowing eyes -->
  <ellipse cx="272" cy="446" rx="11" ry="3.6" fill="${element}" transform="rotate(14 272 446)" filter="url(#fGlow)"/>
  <ellipse cx="328" cy="446" rx="11" ry="3.6" fill="${element}" transform="rotate(-14 328 446)" filter="url(#fGlow)"/>

  <!-- chest gem -->
  <polygon points="300,650 313,672 300,700 287,672" fill="${element}" filter="url(#fGlow)" opacity="0.95"/>

  <!-- bottom fade -->
  <rect x="0" y="560" width="600" height="240" fill="url(#gFade)"/>
</svg>`;
}

const escapeXml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Build the environmental scene SVG for a design (pure, deterministic). */
export function buildSpectralEnvironment(design: CharacterDesign): string {
  const seed = hashString(`env|${design.homeworld}|${design.aesthetic}|${design.powers.join(',')}`);
  const rand = mulberry32(seed);
  const [primary, secondary] = paletteFor(design.aesthetic, seed);
  const element = elementColor(design.powers);

  const W = 1600;
  const H = 900;
  const horizon = 520 + Math.floor(rand() * 60);

  // Stars
  const stars: string[] = [];
  for (let i = 0; i < 90; i++) {
    const x = f2(rand() * W);
    const y = f2(rand() * horizon * 0.72);
    const r = f2(0.5 + rand() * 1.7);
    const o = f2(0.3 + rand() * 0.7);
    stars.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="#ffffff" opacity="${o}"/>`);
  }

  // Ridge generator — jagged polygon from x=0..W with seeded peaks
  const ridge = (baseY: number, amplitude: number, steps: number, color: string, opacity = 1): string => {
    const pts: string[] = [`0,${H}`, `0,${f2(baseY)}`];
    for (let i = 1; i <= steps; i++) {
      const x = (W / steps) * i;
      const y = baseY - (rand() * amplitude * (0.35 + rand() * 0.95));
      pts.push(`${f2(x - W / steps / 2)},${f2(baseY - rand() * amplitude * 0.5)}`);
      pts.push(`${f2(x)},${f2(y)}`);
    }
    pts.push(`${W},${f2(baseY)}`, `${W},${H}`);
    return `<polygon points="${pts.join(' ')}" fill="${color}" opacity="${opacity}"/>`;
  };

  // Distant citadel spires (center cluster)
  const spires: string[] = [];
  const spireCount = 4 + Math.floor(rand() * 4);
  for (let i = 0; i < spireCount; i++) {
    const cx = 560 + rand() * 480;
    const w = 26 + rand() * 46;
    const h = 90 + rand() * 190;
    spires.push(
      `<polygon points="${f2(cx - w)},${horizon} ${f2(cx)},${f2(horizon - h)} ${f2(cx + w)},${horizon}" fill="#0b0b12" stroke="${primary}" stroke-width="1.2" stroke-opacity="0.5"/>`,
    );
    if (rand() < 0.75) {
      spires.push(`<circle cx="${f2(cx)}" cy="${f2(horizon - h)}" r="2.6" fill="${element}" filter="url(#fGlow)"/>`);
    }
  }

  // Floating shattered shards
  const shards: string[] = [];
  for (let i = 0; i < 9; i++) {
    const cx = f2(120 + rand() * (W - 240));
    const cy = f2(horizon * (0.18 + rand() * 0.5));
    const s = f2(5 + rand() * 18);
    shards.push(
      `<polygon points="${cx},${f2(Number(cy) - s)} ${f2(Number(cx) + s * 0.7)},${cy} ${cx},${f2(Number(cy) + s)} ${f2(Number(cx) - s * 0.7)},${cy}" fill="${i % 2 ? primary : secondary}" opacity="0.75" stroke="#050505" stroke-width="0.6"/>`,
    );
  }

  // Light motes drifting
  const motes: string[] = [];
  for (let i = 0; i < 26; i++) {
    const x = f2(rand() * W);
    const y = f2(horizon * 0.5 + rand() * (H - horizon * 0.5));
    motes.push(`<circle cx="${x}" cy="${y}" r="${f2(0.8 + rand() * 1.8)}" fill="${i % 3 === 0 ? secondary : '#ffffff'}" opacity="${f2(0.3 + rand() * 0.6)}"/>`);
  }

  const moonR = f2(46 + rand() * 30);
  const moonX = f2(W * (0.18 + rand() * 0.64));
  const moonY = f2(horizon * (0.22 + rand() * 0.28));

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" role="img" aria-label="Spectral landscape of ${escapeXml(design.homeworld)}">
  <defs>
    <linearGradient id="eSky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0a0a14"/>
      <stop offset="0.62" stop-color="${secondary}" stop-opacity="0.42"/>
      <stop offset="1" stop-color="${primary}" stop-opacity="0.62"/>
    </linearGradient>
    <radialGradient id="eNebula" cx="0.3" cy="0.22" r="0.85">
      <stop offset="0" stop-color="${primary}" stop-opacity="0.5"/>
      <stop offset="0.55" stop-color="${secondary}" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#050505" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="eHorizon" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${element}" stop-opacity="0.85"/>
      <stop offset="1" stop-color="${element}" stop-opacity="0"/>
    </linearGradient>
    <filter id="fGlow" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="7" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="fHaze" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="10"/>
    </filter>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#eSky)"/>
  <rect width="${W}" height="${H}" fill="url(#eNebula)"/>
  ${stars.join('\n  ')}

  <!-- celestial body -->
  <circle cx="${moonX}" cy="${moonY}" r="${moonR}" fill="#f5f3ce" filter="url(#fHaze)" opacity="0.95"/>
  <circle cx="${moonX}" cy="${moonY}" r="${f2(moonR * 0.72)}" fill="#fffbe0"/>

  <!-- horizon glow -->
  <rect x="0" y="${f2(horizon - 44)}" width="${W}" height="120" fill="url(#eHorizon)" opacity="0.8"/>

  ${shards.join('\n  ')}
  ${spires.join('\n  ')}

  <!-- ridgelines -->
  ${ridge(horizon, 150, 9, '#151520', 0.96)}
  ${ridge(f2(horizon + 78), 210, 7, '#101018', 1)}
  ${ridge(f2(horizon + 168), 240, 6, '#0a0a10', 1)}

  ${motes.join('\n  ')}

  <!-- atmospheric vignette -->
  <rect width="${W}" height="${H}" fill="#050505" opacity="0.18"/>
</svg>`;
}

/** Data-URL wrapper for the environment scene. */
export function generateSpectralEnvironment(design: CharacterDesign): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildSpectralEnvironment(design))}`;
}

/** Data-URL wrapper usable directly in <img src>. */
export function generateSpectralPortrait(design: CharacterDesign): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildSpectralSvg(design))}`;
}
