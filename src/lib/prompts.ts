import type { CharacterDesign } from '../types';

/** Shared prompt bodies for the Groq provider (and any OpenAI-compatible provider). */

export const SYSTEM_SENSEI =
  'You are the Omni-Sensei of AARUTO_ANIME.AI, the most advanced character generation terminal.';

export const designUserPrompt = (prompt: string) =>
  `You are the Master Architect of AARUTO_ANIME.AI. Design an apex-tier anime character based on: "${prompt}".

Requirements (ALL fields are MANDATORY):
1. 'name': an original character name.
2. 'title': an epithet (e.g., 'The Crimson Moon's Silent Blade').
3. 'personality': 2-4 vivid personality traits.
4. 'aesthetic': one aesthetic theme (e.g., 'Cyberpunk', 'Dark Fantasy', 'High Fantasy').
5. 'powers': array of 3-6 distinct powers (each a short noun phrase).
6. 'lore': 2-4 sentences of mythic backstory.
7. 'visualTraits': Describe with supreme detail (e.g., 'eyes burning with celestial supernova energy', 'armor forged from the core of a dying star', 'a cloak that flows like liquid obsidian').
8. 'homeworld': An environment that dictates their biology and power (e.g., 'A dimension of suspended crystal shards where light travels in slow-motion').
9. 'stats': 1-100 values for Strength, Agility, Intelligence, Stamina (lowercase keys exactly: strength, agility, intelligence, stamina).
10. 'evolutionStage': Start at 1.

Respond with a SINGLE FLAT JSON object with exactly these top-level keys. No nesting, no extra prose, no markdown.`;

export const evolveUserPrompt = (current: CharacterDesign) =>
  `Perform a God-Tier Ascension for: ${JSON.stringify(current)}.

Rules:
1. Dramatically upgrade stats (cap each at 100).
2. Update 'visualTraits' to reflect supreme power (e.g., aura of localized space-time distortion, hair turning into pure light, growing spectral wings).
3. Increment 'evolutionStage' by exactly 1.
4. Enhance lore to describe this mythic transformation.

Respond with a single JSON object only.`;

export const updateFieldPrompt = (design: CharacterDesign, field: string) =>
  `Current state: ${JSON.stringify(design)}.
  Rewrite the "${field}" with god-tier creativity. Maintain the ${design.aesthetic} theme and homeworld lore.
  Respond with a single JSON object only.`;

export const oracleUserPrompt = (design: CharacterDesign, userQuestion: string) =>
  `Identity Context: ${JSON.stringify(design)}.
Oracle Inquiry: "${userQuestion}".

Instruction: You are the Akashic Oracle. Provide a response that feels like an organic expansion of this character's mythos.
CRITICAL: You must explicitly weave together their visual appearance ('visualTraits') and their origin ('homeworld') into your answer.
Every answer should explain how their physical form or their environment influences the information you are providing.
Maintain a tone of mythic weight and god-tier immersion.`;

export const themeAudioScript = (design: CharacterDesign) =>
  `Heed the call of ${design.name}, the ${design.title}! Originating from ${design.homeworld}, their presence reshapes reality itself. Power levels are peaking at stage ${design.evolutionStage}. Let the chronicle begin!`;

export type ImagePromptType = 'character' | 'environment';

export type PromptDetail = 'standard' | 'high' | 'master';

/** Detail-level prompt enhancers appended to the image prompt. */
export const DETAIL_ENHANCERS: Record<PromptDetail, string> = {
  standard:
    'clean composition, bold colors, sharp focus.',
  high:
    'intricate details, crisp linework, rich textures, cinematic lighting, volumetric atmosphere.',
  master:
    'masterpiece, top-tier quality, hyper intricate detail, award-winning illustration, 8k resolution, cinematic lighting, volumetric fog, trending on artstation and pixiv.',
};

export const buildImagePrompt = (
  design: CharacterDesign,
  settings: { artStyle: string; composition: string; lighting: string },
  type: ImagePromptType,
  detailEnhancer: string,
): string =>
  type === 'character'
    ? `${settings.artStyle} masterpiece. ${settings.composition}. Character: ${design.name} (${design.title}). traits: ${design.visualTraits}. Lighting: ${settings.lighting}. Background: ${design.homeworld}. ${detailEnhancer}`
    : `Cinematic ${settings.artStyle} environment background. Wide angle. Location: ${design.homeworld}. Lighting: ${settings.lighting}. Atmospheric world-building, high-fidelity textures. ${detailEnhancer}`;
