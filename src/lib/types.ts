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
  | 'meadow'
  | 'western';

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

export interface CharacterPreset {
  id: string;
  name: string;
  description: string;
  /** GLB file under public/assets/characters/ */
  glbPath: string;
  /** 'body' = full character (default). 'garment' = dress only, shown on an invisible mannequin. */
  kind?: 'body' | 'garment';
  /** garment only: real-world length of the garment in metres */
  garmentHeight?: number;
  /** colour dot shown in the list */
  swatch: string;
}

export type Phase = 'idle' | 'listening' | 'error';

export interface WindEngineStatus {
  phase: Phase;
  level: number;
  peak: number;
  message: string | null;
}
