export type LocationId =
  | 'garden'
  | 'beach'
  | 'park'
  | 'rooftop'
  | 'terrace'
  | 'forest'
  | 'courtyard'
  | 'snow'
  | 'desert'
  | 'night_city'
  | 'lake'
  | 'meadow';

export interface LocationPreset {
  id: LocationId;
  name: string;
  description: string;
  ambient: number;
  response: number;
  skyTop: string;
  skyBottom: string;
  fogColor: string;
  fogDensity: number;
  groundColor: string;
  sunColor: string;
  sunIntensity: number;
  sunPosition: [number, number, number];
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  particles: 'petals' | 'sand' | 'leaves' | 'dust' | 'snow' | 'sparkles';
  particleColor: string;
  particleCount: number;
}

export type OutfitStyle =
  | 'long_dress'
  | 'summer_dress'
  | 'skirt_blouse'
  | 'jacket_skirt'
  | 'trousers_top'
  | 'saree'
  | 'gown'
  | 'casual';

export interface CharacterPreset {
  id: string;
  name: string;
  dressColor: string;
  accentColor: string;
  hairColor: string;
  skinTone: string;
  /** 1.0 = ankle length, lower = shorter */
  dressLength: number;
  /** 0 = loose A-line, 1 = fitted */
  fit: number;
  style: OutfitStyle;
  description: string;
  /** Optional path to a GLB model under public/assets/characters/ */
  glbPath?: string;
}

export type Phase = 'idle' | 'listening' | 'error';

export interface WindEngineStatus {
  phase: Phase;
  level: number;
  peak: number;
  message: string | null;
}
