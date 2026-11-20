# Wind Studio Pro

Interactive 3D wind simulation for adult female characters (18+).

Blow into your phone microphone and the character's clothes react in real time. Stronger blow → stronger lift.

## Features

- **Microphone wind** – real breath / blow detection
- **Demo mode** – automatic gusts when mic is off
- **Manual slider** – precise wind control
- **Cloth response** – procedural skirts use cloth simulation; imported GLBs get lower-mesh wind deformation
- **Hand-hold animation** – procedural arms react; imported GLB arms react only if arm bones are present
- **12 locations** – Garden, Beach, Park, Rooftop, Terrace, Forest, Courtyard, Snow, Desert, Night City, Lakeside, Flower Meadow
- **14 procedural adult characters plus 4 imported GLB models**
- **Mobile-friendly** – works on phone browsers
- **GLB support** – place models in `public/assets/characters/`

## Quick start

```bash
npm install
npm run dev
```

Open the local URL (usually `http://localhost:5173`).

On a phone: allow microphone access, then blow.

## Controls

| Action            | How                          |
|-------------------|------------------------------|
| Start mic wind    | Tap **Start Mic**            |
| Demo gusts        | Tap **Demo**                 |
| Manual control    | Tap **Slider**               |
| Change character  | **Style** → Character        |
| Change location   | **Style** → Location         |
| Orbit camera      | Drag left / right            |
| Zoom              | Mouse wheel / pinch          |

## Characters

- **Lady Red** – High quality GLB model (red evening dress)
- Amara, Sofia, Mei, Lila, Nora, Elena, Aria – procedural
- Zara, Priya – saree style
- Isabella – ball gown
- Hana – casual
- Maya, Luna – more dress styles

All characters are **adult (18+)**. Do not replace them with child or teen models.

## Locations (12)

Garden · Beach · City Park · Rooftop · Outdoor Terrace · Forest Clearing · Modern Courtyard · Snow Field · Desert Dunes · Night City · Lakeside · Flower Meadow

## Adding more GLB models

1. Put the `.glb` file in `public/assets/characters/`
2. Add a new entry in `src/lib/characters.ts` with `glbPath: '/assets/characters/your-model.glb'`

## Build for production

```bash
npm run build
```

Output is in `dist/`. Deploy to Vercel, Netlify, or any static host.

## Project structure

```
src/
  App.tsx                 # Main UI
  components/             # WindMeter, StylePanel
  lib/
    characters.ts         # Character presets
    locations.ts          # Environment presets
    windEngine.ts         # Mic + demo wind
    types.ts
  three/
    character.ts          # Procedural adult female
    glbCharacter.ts       # GLB model loader
    cloth.ts              # Verlet cloth helpers
    dressSim.ts           # Skirt + hair + hands
    environment.ts        # Sky, ground, particles
    windScene.ts          # Three.js scene manager
```


## Imported GLB models in this package

- Lady Red (`lady-red.glb`)
- Elegance Dress (`elegance-dress.glb`)
- Brown Halter Dress (`brown-halter-dress.glb`)
- Long Hair Mini Dress (`long-hair-mini-dress.glb`)

Imported files are checked at load time. Static meshes receive a restrained lower-mesh wind response; rigged files can also play embedded animation clips and arm bones can react when recognizable names are present. Full physical cloth simulation and reliable hand-to-hem posing still require a separate cloth mesh and a correctly rigged character.


## Wind and scene improvements

- Imported GLB meshes now receive a subtle lower-mesh wind deformation; the effect is strongest near the hem.
- GLB animation clips are played when included in the model. Arm posing is only applied when the GLB contains recognizable arm bones.
- Procedural characters retain the full simulated skirt, hair strands, and hand-hold response.
- Locations now include lightweight procedural scenery (trees, palms, city blocks, water, dunes, and rocks) rather than only a sky and flat ground.
- Renderer pixel ratio and shadow settings are tuned to reduce mobile GPU load.

Note: arbitrary static GLB meshes cannot provide physically accurate garment simulation or a hand-catching pose without a rigged character and separate cloth mesh. For the best result, use rigged models with arm bones and cloth meshes.
