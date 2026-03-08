# Thor Cinematic Webpage

A Marvel-style cinematic Thor experience with a storm sky, lightning, and scroll-driven scenes.
A cinematic scroll storytelling webpage inspired by Thor.

## Versions

v1.1 — Initial scroll experiment  
v1.2 — Improved transitions  
v1.3 — Refined animation timing  
v2.1 — Visual redesign  
v2.2 — Final cinematic version

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Scroll through the three scenes.

## Build

```bash
npm run build
npm run preview
```

## Features

- **Three.js** storm environment: volumetric clouds, fog, electric particles, animated lightning
- **GSAP ScrollTrigger** for camera zoom, scene reveals, screen shake, and thunder flashes
- **Scene 1:** Hero with floating Thor (`thor_sky.png`), parallax zoom, lightning behind
- **Scene 2:** Thor strike reveal (`thor_strike.png`) with lightning strike, screen shake, full-screen thunder flash
- **Scene 3:** Thor power reveal (`thor_power.png`) with intense lightning and a **massive scroll-synced lightning strike** when entering the scene
- **Custom cursor:** Lightning bolt with electric particle trail
- **Postprocessing:** Unreal bloom for glow on lightning and bright elements

## Assets

Place (or keep) these images in `public/`:

- `thor_sky.png`
- `thor_strike.png`
- `thor_power.png`

Images are already copied into `public/` from the project root when setting up.
