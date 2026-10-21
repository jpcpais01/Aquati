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
| `src/world` | Waves, wind and gusts, the ocean surface, the wake field, the sky and the hour |
| `src/render` | The colour grade (a GPU-baked 3D LUT) |
| `src/ships` | Ship classes and liveries, the procedural ship builder, figureheads, the sailing physics |
| `src/fx` | Particles (one MultiMesh for every spray, splash and puff of smoke), the bow wave |
| `src/game` | The voyage scene, the camera rig, the controls |
| `src/ui` | The HUD, the touch helm, the sail lever |
| `shaders` | Every shader; `shaders/inc` holds the shared pieces (atmosphere, sea, ship lighting) |
| `art` | Generated textures and the baked figurehead sculptures |
| `tools` | The CI checks and the asset generators |

## Running it

Install [Godot 4.7.2](https://godotengine.org/download) and open this folder,
or run it from a terminal:

```sh
godot --path godot
```

Keys: A / D or the arrows steer, W / S set and take in sail, C changes the
camera, the mouse wheel zooms. On a phone: drag on the left of the screen to
steer, use the lever on the right for the sails, pinch to zoom.

Handy flags (after `--`): `--hour 18.5` sets the time of day, `--view 0..3`
picks a camera, `--shot out.png` saves a frame and quits, `--smoke` runs a few
seconds and prints `SMOKE OK`.

## The checks CI runs

```sh
cd godot
godot --headless --import                       # compiles every script
godot --headless --script res://tools/check.gd  # loads every script, builds each ship, checks normals and triangle budgets
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

- `python3 godot/tools/gen_textures.py` (from the repo root, needs numpy and
  Pillow) rewrites the sea textures in `art/`: the same noise, foam, caustics
  and ripple maps the web game generates at start.
- `cd godot && node tools/bake_figures.mjs` (needs the `meshoptimizer` npm
  package) re-bakes the figurehead sculptures in `art/figures.*` from the web
  game's sources.
