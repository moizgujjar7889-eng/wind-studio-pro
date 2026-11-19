# Wind Studio Pro

Interactive 3D wind simulation for adult female characters (18+).

Blow into your phone microphone and the character's clothes react in real time. Stronger blow → stronger lift.

## Features

- **Microphone wind** – real breath / blow detection
- **Demo mode** – automatic gusts when mic is off
- **Manual slider** – precise wind control
- **Cloth physics** – skirt / dress lifts with wind strength (procedural characters)
- **Hand-hold animation** – arms rise to hold clothes when wind is strong
- **12 locations** – Garden, Beach, Park, Rooftop, Terrace, Forest, Courtyard, Snow, Desert, Night City, Lakeside, Flower Meadow
- **14 adult characters** – including 1 high-quality GLB model (Lady Red)
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
