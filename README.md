# Shores of Fortune

_(repo and code name: Aquati)_

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

## Cloud saves (Firebase)

Players can sign in with Google or email from the captain chip in the harbour's top bar; their gold, Treasure Vault collection, livery, saved designs, records and favourite ship then sync through Firestore. Guests keep playing on local saves, and the first sign-in carries that progress into the account. Code: `src/cloud/` (profile + three-way merge in `profile.ts`, sync in `cloud.ts`, the lazily loaded SDK in `firebase.ts`) and the UI in `src/ui/account.ts`.

Setup, once:

1. Create a Firebase project and add a **Web app** to it.
2. **Authentication** › Sign-in method: enable **Google** and **Email/Password**. Under Settings › Authorized domains, add the Vercel domain(s) the game is served from.
3. **Firestore Database**: create it (production mode), then paste `firestore.rules` into the Rules tab (or `firebase deploy --only firestore:rules`).
4. In Vercel › Settings › Environment Variables, set the values from the web app's config (see `.env.example`): `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MESSAGING_SENDER_ID`. Redeploy.

Without those variables the sign-in chip is hidden and the game runs on local saves only.
