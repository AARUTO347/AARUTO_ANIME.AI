
export type QualityLevel = 'GENIN' | 'CHUNIN' | 'JONIN';

export interface User {
  email: string;
  isAdmin: boolean;
}

export interface CharacterStats {
  strength: number;
  agility: number;
  intelligence: number;
  stamina: number;
}

export interface CharacterDesign {
  name: string;
  title: string;
  personality: string;
  aesthetic: string;
  powers: string[];
  lore: string;
  visualTraits: string;
  stats: CharacterStats;
  homeworld: string;
  evolutionStage: number;
}

export interface SenseiMessage {
  role: 'user' | 'sensei';
  text: string;
}

export interface GeneratedResult {
  id: string;
  imageUrl: string;
  envImageUrl?: string;
  audioData?: string;
  design: CharacterDesign;
  timestamp: number;
  quality: QualityLevel;
  resolution?: string;
  artStyle?: string;
  lighting?: string;
  composition?: string;
}

export type ArtStyle = 
  | 'Classic Anime' 
  | 'Ufotable Style' 
  | 'Studio Ghibli' 
  | 'Cyberpunk Edge' 
  | 'Retro 90s' 
  | 'Ink Wash' 
  | 'Realistic' 
  | 'Digital Concept'
  | 'Fantasy Oil'
  | 'High-Impact Shonen'
  | 'Vintage Manga';

export type LightingStyle = 'Cinematic' | 'Ethereal' | 'Dramatic' | 'Neon' | 'Golden Hour' | 'Cyber-Noir';
export type CompositionStyle = 'Dynamic Pose' | 'Portrait' | 'Wide Shot' | 'Epic Low Angle' | 'Close-up Detail';

export interface AppSettings {
  autoSave: boolean;
  resolution: '512' | '1024' | '2048';
  artStyle: ArtStyle;
  lighting: LightingStyle;
  composition: CompositionStyle;
}

export enum GenerationState {
  IDLE = 'IDLE',
  GENERATING_DESIGN = 'GENERATING_DESIGN',
  GENERATING_IMAGE = 'GENERATING_IMAGE',
  GENERATING_ENV = 'GENERATING_ENV',
  GENERATING_AUDIO = 'GENERATING_AUDIO',
  EVOLVING = 'EVOLVING',
  SENSEI_THINKING = 'SENSEI_THINKING',
  UPDATING_FIELD = 'UPDATING_FIELD',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}
