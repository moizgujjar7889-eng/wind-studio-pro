import type { CharacterPreset } from './types';

/** Only real 3D models. Add a new one: copy the .glb to public/assets/characters/ and add a line here. */
const MANNEQUIN = '/assets/characters/mannequin-anna.glb';

export const DEFAULT_CHARACTER_ID = 'nicole';

export const CHARACTERS: CharacterPreset[] = [
  { id: 'nicole', name: 'Nicole', description: 'Realistic character in a fitted dress', glbPath: '/assets/characters/nicole.glb', swatch: '#d9a98c' },
  { id: 'rebeca', name: 'Rebeca', description: 'Realistic character, casual outfit', glbPath: '/assets/characters/rebeca.glb', swatch: '#d4a07f' },
  { id: 'kira', name: 'Kira', description: 'Realistic character, long hair', glbPath: '/assets/characters/kira.glb', swatch: '#d6a58a' },
  { id: 'ginget', name: 'Ginget', description: 'Realistic character', glbPath: '/assets/characters/ginget.glb', swatch: '#d9ae96' },
  { id: 'anna-summer-dress', name: 'Anna', description: 'Realistic character, denim top and flared dress', glbPath: '/assets/characters/anna-summer-dress.glb', swatch: '#c4d4e8' },
  { id: 'brown-halter-dress', name: 'Brown Halter Dress', description: 'Brown halter mini dress', glbPath: '/assets/characters/brown-halter-dress.glb', swatch: '#80543b' },
  { id: 'elegance-dress', name: 'Elegance Dress', description: 'Elegant long dress', glbPath: '/assets/characters/elegance-dress.glb', swatch: '#5a2a3a' },
  { id: 'long-hair-mini-dress', name: 'Long Hair Mini Dress', description: 'Long hair with mini dress', glbPath: '/assets/characters/long-hair-mini-dress.glb', swatch: '#8a3a5a' },
  { id: 'blonde-gray-dress', name: 'Blonde Gray Dress', description: 'Blonde, fitted gray dress', glbPath: '/assets/characters/blonde-gray-dress.glb', swatch: '#8d8f94' },
  { id: 'woman-dress-2', name: 'Denim Dress Girl', description: 'Denim-top dress with heels', glbPath: '/assets/characters/woman-dress-2.glb', swatch: '#4a6a94' },
  { id: 'ruffle-dress-rigged', name: 'Ruffle Dress (rigged)', description: 'Rigged character, ruffle dress, plays idle animation', glbPath: '/assets/characters/ruffle-dress-rigged.glb', swatch: '#c9a0b4' },
  { id: 'melisa', name: 'Melisa', description: 'Very detailed model (heavy, desktop only)', glbPath: '/assets/characters/melisa.glb', swatch: '#b88a78' },
  { id: 'gown-red-renaissance', name: 'Red Renaissance Gown', description: 'Long red gown with fitted sleeves', glbPath: '/assets/characters/gown-red-renaissance.glb', kind: 'garment', mannequin: MANNEQUIN, offset: [-0.0, -0.132], garmentHeight: 1.45, swatch: '#c8483c' },
  { id: 'gown-navy-court', name: 'Navy Court Gown', description: 'Navy gown with gold belt', glbPath: '/assets/characters/gown-navy-court.glb', kind: 'garment', mannequin: MANNEQUIN, offset: [0.078, 0.035], garmentHeight: 1.45, swatch: '#10203a' },
  { id: 'gown-golden', name: 'Golden Gown', description: 'Long golden gown with train', glbPath: '/assets/characters/gown-golden.glb', kind: 'garment', mannequin: MANNEQUIN, offset: [-0.009, -0.264], garmentHeight: 1.45, swatch: '#b89a50' },
  { id: 'robe-blue', name: 'Blue Robe', description: 'Long blue robe', glbPath: '/assets/characters/robe-blue.glb', kind: 'garment', mannequin: MANNEQUIN, offset: [0.101, 0.038], garmentHeight: 1.45, swatch: '#12506e' },
  { id: 'surcoat-embroidered', name: 'Embroidered Surcoat', description: 'Orange embroidered sleeveless gown', glbPath: '/assets/characters/surcoat-embroidered.glb', kind: 'garment', mannequin: MANNEQUIN, offset: [0.009, -0.123], garmentHeight: 1.45, swatch: '#b4502a' },
  { id: 'cream-underdress', name: 'Cream Underdress', description: 'Long cream dress', glbPath: '/assets/characters/cream-underdress.glb', kind: 'garment', mannequin: MANNEQUIN, offset: [0.005, -0.023], garmentHeight: 1.45, swatch: '#f4ecd0' },
  { id: 'red-mini-dress', name: 'Red Mini Dress', description: 'Short red skater dress', glbPath: '/assets/characters/red-mini-dress.glb', kind: 'garment', mannequin: MANNEQUIN, offset: [-0.008, 0.028], garmentHeight: 0.78, swatch: '#8a1020' },
  { id: 'short-denim-dress', name: 'Denim Dress', description: 'Short dress with denim top', glbPath: '/assets/characters/short-denim-dress.glb', kind: 'garment', mannequin: MANNEQUIN, offset: [0.009, 0.015], garmentHeight: 0.8, swatch: '#2a2a30' },
];
