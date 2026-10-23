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
| `src/core` | Settings (quality tiers, the sound, the frame counter, the camera's shake), what's kept between plays (`Progress`: your ship, the waters you set out in, the view you sail with, your purse, the archipelagos charted and your records, written whole to a fresh file and swapped in), small maths helpers and the web's own random numbers (`Mulberry32`, so seeded things come out as the web's do) |
| `src/world` | Waves, wind and gusts, the ocean surface, the wake field, the sky, the hour and the weather (`Atmosphere`: eight kinds of weather that follow one another, the wind backing and veering with them, the stars wheeling through the night and the moon in its phase), the sea-spark blooms on the high seas (`SeaGlow`); the archipelagos (`Region`), their ground (`Ground`) and their planting (`Flora`) |
| `src/render` | The colour grade (a GPU-baked 3D LUT) |
| `src/audio` | The sound (`Sound`: the mix, the sea, the wind and the rain round you, thunder rolling in late from the strike, every gun, blow and splash heard where it happens, late by its distance and dulled by the air, and a trading port's quay: its bell, the squeezebox, gold counted out, the yard at work, gulls, the water among the pilings and the crowd) and the music (`Music`: the voyage band's songs for fair sailing, the high seas' own theme out on the open ocean) |
| `src/ships` | Ship classes and liveries, the procedural ship builder, figureheads, the sailing physics, battle damage, dismasting, re-rigging and sinking (`ShipDamage`), the pirate captains (`PirateAI`), the crews on deck (`ShipCrew` for a ship's sailors and their deck, `Crew` and `CrewView` to run and draw every crew afloat) |
| `src/fx` | Particles (one MultiMesh for every spray, splash and puff of smoke), the bow wave, the wreckage afloat (`Debris`), the rain, the lightning and the spindrift a gale tears off the crests (all three drawn from one static buffer each, animated on the GPU) |
| `src/game` | The voyage scene (and docking at a trading port), the camera rig (with the port's shot of her alongside), the controls; the guns (`Gunnery`, `Shots`), hull-to-hull collisions, the pirates and the shipyard that builds their hulls ahead of time; plunder, the hold and each port's market (`Treasure`) |
| `src/port` | The trading ports (`TradePorts`, `TradePort`): six market towns along their quays, each built once in two cuts (whole near the camera, a shell further off) with the mesh kit in `TownKit`, its harbourmaster, porters carrying goods ashore, merchants, fishers and the town band (`Figure`, drawn by the crews' sailor), its lamps mirrored by the sea after dark |
| `src/ui` | The harbour (`Harbour`) and "Where shall we sail?" (`SeaPick`), a trading port's market and the prompt to come alongside (`MarketPanel`), the voyage on hold (`PauseScreen`), Settings (`SettingsSheet`), the veil between scenes and the frame counter; the HUD, the touch helm, the sail lever, the fire pad, the shot pie, the hull and enemy bars, damage numbers, and the farewell card (`WreckScreen`). `MenuKit`, `UiBox`, `UiButton` and `UiText` draw the web's glass panels, gilt buttons and type |
| `shaders` | Every shader; `shaders/inc` holds the shared pieces (atmosphere, the night sky, sea, ground, plants, ship lighting, battle damage, the sea's height for what floats). Each ship shader comes twice: the plain one every ship draws with, and a `_dmg` one a ship switches to with her first wound |
| `art` | The tiling textures every shader samples, the moon's face (baked from the web game's own), the baked figurehead sculptures, the baked sailor (`crew.json`, `crew.bin`: four cuts of the web game's sculpt) and the towns' painted signs and flags (`town_signs.png`, `town_flags.png`) |
| `world` | The baked world: both archipelagos' heightfields, ground maps, surf fields and plants, and the plant meshes |
| `audio` | The sounds (`audio/sfx`) and the songs (`audio/music`), rendered from the web game's own audio code, and `sounds.json`: the level each sound was rendered at, which are stereo, and each song's title, its leaning to day or night and when its last note is done |
| `tools` | The CI checks and the asset generators (`tools/crew` bakes the sailor, `tools/audio` the sounds and songs and `tools/bake_signs.mjs` the towns' signs and flags, all from the web game's own code) |

## Running it

Install [Godot 4.7.2](https://godotengine.org/download) and open this folder,
or run it from a terminal:

```sh
godot --path godot
```

In the harbour A / D or the arrows (or 1 to 3) pick a ship and Enter sets
sail. Esc, like Android's back button, closes whatever is on top and puts a
voyage on hold (in the harbour Android's back button leaves the game).

At sea: A / D or the arrows steer, W / S set and take in sail, Q and E fire
the port and starboard broadsides and Space whichever side bears (or click the
sea on the side to fire), C changes the camera, the mouse wheel zooms, and
Enter sails again from the farewell card; 1 to 5 load a kind of shot and R
cycles them. Off a market town's quay F comes alongside (or tap the prompt at
the foot of the screen); tied up, Enter sells the whole hold and Esc casts
off. On a phone: drag from low on the left (by the sail lever) to
steer, use the lever bottom left for the sails and the guns bottom right,
hold the shot button over Fire and slide onto a kind of shot to load it (or
tap it, then tap one), pinch to zoom (all the way out, a fresh pinch leans
the view over toward the horizon).

The game opens in the harbour. A shot of the voyage, a fight or a
farewell (below) starts at sea instead; for the menus, `--menu` opens on the
harbour (`--orbit A` sets how far round her the camera has come),
`--seapick` on "Where shall we sail?", `--pause` puts the voyage on hold and
`--settings` opens Settings (over the harbour, or with `--pause` over the
paused voyage), and `--dock K` ties her up at the K-th market town (0 to 5:
the home waters' four, then Las Brumas' two) with its market open (`--hold`
puts goods aboard to sell, and `--sell ID` or `--sell all` sells just before
the frame); `--off K` puts her off its quay instead, the prompt to come
alongside up.

Handy flags (after `--`): `--hour 18.5` sets the time of day (or `--time
dusk` by name), `--wx storm` holds a weather (clear, fair, cloudy, mist, rain,
storm, calm, hot, glow), `--strike` brings a bolt of lightning down just before a
shot, `--view 0..3`
(or `--zoom 0..1 --tilt 0..1`) picks a camera, `--at X,Z` and `--heading R`
start somewhere else, `--shot out.png` saves a frame and quits (after
`--frames N`, and prints the frame's triangles and draw calls), `--smoke`
walks the menus (a ship picked, Set Sail for Las Brumas, paused, Settings,
back to the harbour, out into the home waters, paused and resumed with the
back button, then off a market's quay: the prompt tapped, goods sold, her hull
mended, fresh shot and cast off), prints what it saw in `SMOKE MENU`, sails
on for a few seconds and prints `SMOKE OK` (`--smoke-at N`: after N frames). `--noshadow`, `--noocean` and
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
sea clear. `--phone` plays as a phone would at MEDIUM (`--phone 360` for a
screen 360 dp across): the lean graphics path, with the plants and crews
sized for its screen, so a shot's triangle count is the phone's. The header
of `src/game/game.gd` lists them all.

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

The sound on or off, the volumes and the music's own switch are on the
Settings screen (the gear in the harbour, or Settings on the pause screen),
kept in `Settings`.

## The checks CI runs

```sh
cd godot
godot --headless --import                       # compiles every script
godot --headless --script res://tools/check.gd  # loads every script, builds each ship (normals, triangle budgets), loads the world, builds the market towns (prices to the coin against the web's), loads the sound, stacks a broadside's damage numbers, saves and loads your progress (and a damaged save)
godot --headless --script res://tools/bake.gd   # builds every figurehead
godot --headless --fixed-fps 60 --quit-after 1400 -- --smoke --smoke-at 1200  # walks the menus and a market, then sails for a few seconds
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
- `cd godot && node tools/bake_signs.mjs` (needs Playwright's Chromium) paints
  the trading towns' signs and flags into `art/town_signs.png` and
  `art/town_flags.png` the way the web game draws them, with its own Cinzel.
