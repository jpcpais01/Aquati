# Shores O' Fortune for Android

The native Android game, built with Godot 4 (GDScript, Mobile renderer on
Vulkan). It is a rebuild of the web game in `../src`, not a line-by-line copy:
the look and the feel are the same, the engineering is redone for phones.

Every push to `main` that touches this folder builds a signed APK in GitHub
Actions and publishes it as a GitHub release (see
`.github/workflows/android.yml`). Pull requests build and smoke-test the same
way and keep the APK as a workflow artifact.

## Layout

| Folder | What lives there |
| --- | --- |
| `src/core` | Settings (quality tiers), small maths helpers |
| `src/world` | Waves, wind and gusts, the ocean surface, the wake field, the sky, the hour and the weather (`Atmosphere`: eight kinds of weather that follow one another, the wind backing and veering with them, the stars wheeling through the night and the moon in its phase), the sea-spark blooms on the high seas (`SeaGlow`); the archipelagos (`Region`), their ground (`Ground`) and their planting (`Flora`) |
| `src/render` | The colour grade (a GPU-baked 3D LUT) |
| `src/audio` | The sound (`Sound`: the mix, the sea, the wind and the rain round you, thunder rolling in late from the strike, and every gun, blow and splash heard where it happens, late by its distance and dulled by the air) and the music (`Music`: the voyage band's songs for fair sailing, the high seas' own theme out on the open ocean) |
| `src/ships` | Ship classes and liveries, the procedural ship builder, figureheads, the sailing physics, battle damage, dismasting, re-rigging and sinking (`ShipDamage`), the pirate captains (`PirateAI`), the crews on deck (`ShipCrew` for a ship's sailors and their deck, `Crew` and `CrewView` to run and draw every crew afloat) |
| `src/fx` | Particles (one MultiMesh for every spray, splash and puff of smoke), the bow wave, the wreckage afloat (`Debris`), the rain, the lightning and the spindrift a gale tears off the crests (all three drawn from one static buffer each, animated on the GPU) |
| `src/game` | The voyage scene, the camera rig, the controls; the guns (`Gunnery`, `Shots`), hull-to-hull collisions, the pirates and the shipyard that builds their hulls ahead of time |
| `src/ui` | The HUD, the touch helm, the sail lever, the fire pad, the shot pie, the hull and enemy bars, damage numbers, and the farewell card (`WreckScreen`) |
| `shaders` | Every shader; `shaders/inc` holds the shared pieces (atmosphere, the night sky, sea, ground, plants, ship lighting, battle damage, the sea's height for what floats). Each ship shader comes twice: the plain one every ship draws with, and a `_dmg` one a ship switches to with her first wound |
| `art` | The tiling textures every shader samples, the moon's face (baked from the web game's own), the baked figurehead sculptures and the baked sailor (`crew.json`, `crew.bin`: four cuts of the web game's sculpt) |
| `world` | The baked world: both archipelagos' heightfields, ground maps, surf fields and plants, and the plant meshes |
| `audio` | The sounds (`audio/sfx`) and the songs (`audio/music`), rendered from the web game's own audio code, and `sounds.json`: the level each sound was rendered at, which are stereo, and each song's title, its leaning to day or night and when its last note is done |
| `tools` | The CI checks and the asset generators (`tools/crew` bakes the sailor and `tools/audio` the sounds and songs from the web game's own code) |

## Running it

Install [Godot 4.7.2](https://godotengine.org/download) and open this folder,
or run it from a terminal:

```sh
godot --path godot
```

Keys: A / D or the arrows steer, W / S set and take in sail, Q and E fire
the port and starboard broadsides and Space whichever side bears (or click the
sea on the side to fire), C changes the camera, the mouse wheel zooms, and
Enter sails again from the farewell card; 1 to 5 load a kind of shot and R
cycles them. On a phone: drag from low on the left (by the sail lever) to
steer, use the lever bottom left for the sails and the guns bottom right,
hold the shot button over Fire and slide onto a kind of shot to load it (or
tap it, then tap one), pinch to zoom (all the way out, a fresh pinch leans
the view over toward the horizon).

Handy flags (after `--`): `--hour 18.5` sets the time of day (or `--time
dusk` by name), `--wx storm` holds a weather (clear, fair, cloudy, mist, rain,
storm, calm, hot, glow), `--strike` brings a bolt of lightning down just before a
shot, `--view 0..3`
(or `--zoom 0..1 --tilt 0..1`) picks a camera, `--at X,Z` and `--heading R`
start somewhere else, `--shot out.png` saves a frame and quits (after
`--frames N`, and prints the frame's triangles and draw calls), `--smoke`
runs a few seconds and prints `SMOKE OK`. `--noshadow`, `--noocean` and
`--noflora` leave a layer out, and `--discover` charts islands during a shot.
For fights: `--battle brig` puts a pirate off your beam (`--foe-dist M`,
`--foe-hp F`, `--foe-wounds N` for breaches already in her, `--foe-dismast
0,2` to bring masts down, `--foe-anchor` to hold her still, `--foe-sink S` to
sink her, `--wreck split` or `capsize` for how she goes, `--watch` to follow
her with the camera, `--fov F` for a close-up lens),
`--eye X,Y,Z` and `--look X,Y,Z` to stand the lens on the followed ship's
deck, `--nocrew` to leave every deck empty,
`--autofire` fires each side as it bears, `--touch` shows the touch
controls, `--sink S` sends your ship down after S seconds, `--voyage` gives
her a long voyage first (a full farewell card), and `--nopirates` keeps the
sea clear. The header of `src/game/game.gd` lists them all.

## Sound and music

Every sound is the web game's own, rendered offline (see Regenerating assets)
and played the way the web plays it: a sound out on the water arrives late by
the distance it carried, the air dulls it on the way and more of a far one
comes back as echo off the isles, a crowded mix lets the faint and far go
first, and a close broadside ducks the sea for a moment. The sea, the wind,
the rain and a downpour's roar are four beds of one looping noise that follow
her way, the gusts and the weather; thunder rolls in late from each strike.

The band plays its songs for fair sailing among the islands, every one before
any repeats and leaning toward those that suit the hour, with the sea's own
sound between them; it rests in a storm and during her farewell, and out on
the open ocean the high seas' theme takes over. Every song listed under
`music` in `audio/sounds.json` is in the rotation, so a new song (from Suno,
say) drops straight in:

1. Put it in `audio/music/` as Ogg Vorbis (`ffmpeg -i song.mp3 -c:a libvorbis
   -q:a 4 audio/music/my_song.ogg`).
2. Add its entry under `music` in `audio/sounds.json`:

   ```json
   "my_song": { "title": "Trade Winds", "day": 1, "night": 0.4, "end": 152.5, "gain": 1, "seconds": 153.1 }
   ```

   `day` and `night` (0 to 1) are how well it suits each (the band leans to
   songs that suit the hour), `end` is when its last note is done (the sea
   has its turn from there) and `gain` its level (1 is as made). Take a song
   out of the rotation by taking out its entry; a full re-bake keeps songs
   added by hand.

The volumes, sound on or off and music on or off are in `Settings` (the
settings screen to change them comes later).

## The checks CI runs

```sh
cd godot
godot --headless --import                       # compiles every script
godot --headless --script res://tools/check.gd  # loads every script, builds each ship (normals, triangle budgets), loads the world and the sound, stacks a broadside's damage numbers
godot --headless --script res://tools/bake.gd   # builds every figurehead
godot --headless --quit-after 600 -- --smoke    # sails for a few seconds
```

## Signing the release APK

Until the signing secrets exist, CI signs the APK with the shared test key in
`.github/android/fallback-debug.keystore`, so releases already install and run.
To sign with your own key (do this once, and keep the file and its password
somewhere safe: every future update must be signed with the same key):

1. Make a keystore (any machine with Java):

   ```sh
   keytool -genkeypair -v -storetype PKCS12 -keystore shores-release.keystore \
     -alias shores -keyalg RSA -keysize 4096 -validity 10000 \
     -dname "CN=Shores O' Fortune"
   ```

   It asks for a password; PKCS12 uses the same password for the store and
   the key.

2. Encode it: `base64 -w0 shores-release.keystore > keystore.b64`
   (on macOS: `base64 -i shores-release.keystore | tr -d '\n' > keystore.b64`).

3. In the GitHub repository, open Settings → Secrets and variables → Actions
   and add three repository secrets:

   | Secret | Value |
   | --- | --- |
   | `ANDROID_KEYSTORE_BASE64` | the contents of `keystore.b64` |
   | `ANDROID_KEYSTORE_PASSWORD` | the password from step 1 |
   | `ANDROID_KEY_ALIAS` | `shores` (the `-alias` from step 1) |

The next build is signed with your key. Android treats a new key as a new
app, so uninstall a test-key build once before installing the first build
signed with your key.

## Regenerating assets

- `cd godot && node tools/world/bake_world.mjs` (after `npm ci` at the repo
  root) runs the web game's own world generator and writes `world/`: the
  islands, reefs, sites and every plant, exactly as the web game builds them
  at load. It also writes the tiling textures in `art/` (noise, ripple
  normals, caustics and foam), byte for byte the ones the web game makes.
  Run it again whenever the web game's islands or plants change.
- `cd godot && node tools/bake_figures.mjs` (needs the `meshoptimizer` npm
  package) re-bakes the figurehead sculptures in `art/figures.*` from the web
  game's sources.
- `cd godot && node tools/audio/bake_audio.mjs [name ...]` (after `npm ci` at
  the repo root; needs Playwright's Chromium and ffmpeg) renders every sound
  and song from the web game's own audio code (`tools/audio/entry.ts` says
  what each one is) into `audio/`, with their levels in `audio/sounds.json`.
  Names given re-render only those. Run it again whenever the web game's
  sounds or songs change.
