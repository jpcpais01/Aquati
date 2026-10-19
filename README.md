# Aquati

A sun-drenched pirate archipelago: sail, explore and battle. Built with **Vite + TypeScript + three.js (WebGL 2)** as an installable PWA, deployed to Vercel from `main`.

## Play

```bash
npm install
npm run dev      # local dev server
npm run build    # typecheck + production build (dist/)
```

Append `?q=low`, `?q=med` or `?q=high` to force a graphics tier.

## How it's built

Everything is procedural: no models or textures are downloaded.

- **Frame graph** (`src/render/pipeline.ts`): opaque HDR pass (MSAA + depth texture) → water & particles pass that refracts the opaque pass → half-res dual-filter bloom → final pass with diorama tilt-shift, split-tone grade, ACES and dithering. Dynamic resolution reacts to real frame times.
- **Ocean** (`src/world/ocean.ts`): Gerstner swell shared with CPU buoyancy, depth-aware Beer–Lambert absorption over the refracted seabed, sky reflection, sun glitter, crest sub-surface glow, sun-shadow sampling, shoreline surf bands, hull contact foam and a painted wake field (`wakeField.ts`).
- **Islands** (`src/world/terrain.ts`, `vegetation.ts`): a hero volcano, lagoon atolls, terraced sandstone isles and jungle isles on a shared 2 m height grid, with ray-marched horizon AO baked into the mesh, caustics, wet sand, cloud shadows and instanced palms, trees, bushes and rocks.
- **Ships** (`src/ships/`): lofted hulls with sheer, tumblehome and castles, painted canvas textures with gunports, braced yards and billowing sails, rigging, cannons. Three classes (Sloop, Brigantine, Galleon) with distinct speed, agility, armour, hull and broadsides.
- **Gameplay** (`src/game/`): wind-dependent sailing, rippling broadsides with aim assist, pirate AI that jockeys for a broadside and flees when beaten, salvage, island discovery.

Patch notes live in `src/data/patchNotes.ts` and are shown in game.
