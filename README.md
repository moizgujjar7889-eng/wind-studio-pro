# Wind Studio Pro

Interactive 3D wind simulation for adult female characters (18+).

Blow into your phone microphone and the character’s clothes react in real time. Stronger blow → stronger lift. The character raises her hands to hold the hem down.

## Features

- **Microphone wind** – real breath / blow detection
- **Demo mode** – automatic gusts when mic is off
- **Manual slider** – precise wind control
- **Cloth physics** – skirt / dress lifts with wind strength
- **Hand-hold animation** – arms rise to hold clothes when wind is strong
- **7 locations** – Garden, Beach, Park, Rooftop, Terrace, Forest, Courtyard
- **7 adult characters** – different outfits & skin tones
- **Mobile-friendly** – works on phone browsers
- **Optional GLB** – place models in `public/assets/characters/` (future ready)

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
| Zoom              | Mouse wheel / pinch (browser)|

## Project structure

```
src/
  App.tsx                 # Main UI
  components/             # WindMeter, StylePanel
  lib/
    characters.ts         # Adult character presets
    locations.ts          # Environment presets
    windEngine.ts         # Mic + demo wind
    types.ts
  three/
    character.ts          # Procedural adult female
    cloth.ts              # Verlet cloth helpers
    dressSim.ts           # Skirt + hair + hands
    environment.ts        # Sky, ground, particles
    windScene.ts          # Three.js scene manager
```

## Characters

All characters are **adult (18+)** with realistic adult proportions.  
Do not replace them with child or teen models.

## Optional GLB models

Place GLB files here if you want to extend later:

```
public/assets/characters/<id>.glb
```

The current version uses a high-quality procedural adult female. GLB loading can be added on top of the existing rig.

## Build for production

```bash
npm run build
```

Output is in `dist/`. Deploy to any static host (Vercel, Netlify, GitHub Pages, etc.).

## License

Personal / educational use. Respect adult-only content guidelines.
