import * as THREE from 'three';
import { angleDelta, clamp, lerp, smoothstep } from '../core/noise';
import { Input } from '../core/input';
import { Audio } from '../core/audio';
import { detectQuality, QualityProfile, ResolutionScaler } from '../core/quality';
import { Profiler } from '../core/profiler';
import { GraphicsSettings, Settings } from '../core/settings';
import { globalUniforms, SkyEnvironment } from '../render/environment';
import { Pipeline } from '../render/pipeline';
import { warmDraw } from '../render/warmup';
import { installSoftShadows, updateSoftShadows } from '../render/softShadows';
import { Particles } from '../fx/particles';
import { Birds } from '../fx/birds';
import { Debris, Pusher } from '../fx/debris';
import { WindField, WindWisps } from '../fx/wind';
import { Rain } from '../fx/rain';
import { Lightning } from '../fx/lightning';
import { Terrain } from '../world/terrain';
import { Vegetation } from '../world/vegetation';
import { installPassCulling } from '../render/passCull';
import { Ocean } from '../world/ocean';
import { WakeField } from '../world/wakeField';
import { buildWaves, setSeaState, Wave } from '../world/waves';
import { Atmosphere, AtmosSnapshot, TIMES, WEATHER } from '../world/atmosphere';
import { Ship } from '../ships/ship';
import { Pack, PirateAI } from '../ships/ai';
import { CrewSystem } from '../ships/crew';
import { ShipModel } from '../ships/shipModel';
import { PIRATE_LIVERIES, SHIP_CLASSES, ShipClassId } from '../ships/shipTypes';
import { hullKey, loadLook, lookToLivery, saveLook, ShipLook } from '../ships/look';
import { onPaintReady, preloadPaint } from '../ships/heraldry';
import { UI } from '../ui/ui';
import type { VoyageEvent, WreckReport } from '../ui/wreck';
import { SHAKE_SCALE } from '../ui/settings';
import { GraphicsPanel } from '../ui/graphics';
import { Customizer, SwTab } from '../ui/customizer';
import { Vault } from '../ui/vault';
import { PhotoMode } from '../ui/photo';
import { fxItem, skinItem, VaultStore } from '../ships/cosmetics';
import { Port, PortFocus } from '../port/port';
import { findPortSite, portClearings } from '../port/site';
import { CameraRig } from './cameraRig';
import { Gunnery, Side } from './gunnery';
import { Captain } from './captain';
import { createSkyDome } from '../render/sky';
import { Projectiles } from './projectiles';
import { Loot, RARITY } from './loot';
import { AMMO, AMMO_ORDER, AmmoId, AmmoStock, SPECIALS, ammoLoot, freshStock } from './ammo';
import { World } from './world';

/** Image-based sky light. Kept a little under the sun so lit faces and shade read apart. */
const SKY_LIGHT = 0.72;
const _a = new THREE.Vector3();
const _shear = new THREE.Matrix4();
/** Heights the sun's shadow map spans: masts, peaks and birds down to the seabed. */
const SHADOW_TOP = 320;
const SHADOW_FLOOR = -140;
import { ShipCollisions } from './collisions';

type State = 'loading' | 'menu' | 'port' | 'playing' | 'paused' | 'dead';

const PIRATE_NAMES = [
  'Black Gull', 'Salt Widow', 'Crimson Tide', 'Grim Mariner', 'Sea Wraith', 'Rusty Anchor', 'Dread Marlin', 'Bone Siren',
  'Gilded Shark', 'Howling Jenny', 'Midnight Eel', 'Scarlet Kraken',
];

/** Seconds into the farewell when the camera follows her under. */
const DIVE = 8.6;

const _cineV = new THREE.Vector3();

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));

export class Game {
  private renderer: THREE.WebGLRenderer;
  private quality: QualityProfile;
  private pipeline: Pipeline;
  private scaler = new ResolutionScaler();
  private opaque = new THREE.Scene();
  private water = new THREE.Scene();
  private rig: CameraRig;
  private sun: THREE.DirectionalLight;
  private input: Input;
  private audio = new Audio();
  private ui = new UI();
  private terrain!: Terrain;
  private ocean!: Ocean;
  private wake!: WakeField;
  private particles!: Particles;
  private world!: World;
  private projectiles = new Projectiles();
  private loot = new Loot();
  private debris = new Debris();
  private collisions = new ShipCollisions(() => this.player);
  private pushers: Pusher[] = [];
  private ships: Ship[] = [];
  /**
   * Pirate hulls built ahead of time, a slice per frame, so a ship (or a whole
   * flotilla) can sail in without the frame it appears in having to build it.
   */
  private shipyard: ShipModel[] = [];
  private keel: ShipModel | null = null;
  private ais = new Map<Ship, PirateAI>();
  private lastFoe: Ship | null = null;
  private player: Ship | null = null;
  private veg?: Vegetation;
  private preview: Ship | null = null;
  private state: State = 'loading';
  private discovered = new Set<string>();
  private chartOpen = false;
  private voyageTime = 0;
  /** The voyage's tally for the farewell screen. */
  private log = { shots: 0, hits: 0, dealt: 0, chests: 0, best: -1, metres: 0, events: [] as VoyageEvent[] };
  /** The farewell: real seconds since she was lost (-1 afloat), and its beats. */
  private wreck = { t: -1, hud: true, plunged: false, dived: false, shown: false, skip: false, deep: -1, under: -1, rest: -1, camSet: false, az: 0, elev: 0, dist: 0 };
  /** Where the camera hangs beneath the waves beside the sinking wreck (eased). */
  private underCam = new THREE.Vector3();
  private bubbleT = 0;
  private isUnder = false;
  private report: WreckReport | null = null;
  /** Sim-time scale: the killing blow plays out in slow motion. */
  private timeScale = 1;
  private cinePos = new THREE.Vector3();
  private cineLook = new THREE.Vector3();
  private spawnTimer = 0;
  private nameIdx = Math.floor(Math.random() * PIRATE_NAMES.length);
  private last = performance.now();
  private gunnery!: Gunnery;
  private gunTipShown = false;
  /** Special shot aboard this voyage, in broadsides' worth (round shot never runs out). */
  private ammoStock: AmmoStock = freshStock();
  private smokeT = 0;
  private spawnPoint = new THREE.Vector3(40, 0, 210);
  private dpr = 1;
  private birds!: Birds;
  private windField!: WindField;
  private wisps!: WindWisps;
  private atmos = new Atmosphere();
  private skyEnv: SkyEnvironment;
  private envT = 0;
  private rain!: Rain;
  private lightning!: Lightning;
  private baseWaves: Wave[] = [];
  private cloudOff = new THREE.Vector2();
  private sprayT = 0;
  private crew!: CrewSystem;
  private settings: Settings;
  private softShadows = false;
  // the sun's shadow map: half-size (stepped), ground centre (texel-snapped)
  // and the sun's slant as a shear per metre of height (see render, fitShadow)
  private shadowR = 0;
  private shadowC = new THREE.Vector2();
  private shadowK = new THREE.Vector2();
  /** Toward the shadow-casting light (the slant the shadow map uses). */
  private toSun = new THREE.Vector3(0, 1, 0);
  private fps = 60;
  private prof!: Profiler;
  // the shipwright's harbour
  private look: ShipLook = loadLook();
  private port!: Port;
  private shipwright = new Customizer();
  // the treasure vault: purse, collection and the chest itself
  private vaultStore = new VaultStore();
  private vault = new Vault(this.vaultStore);
  private veil = Object.assign(document.body.appendChild(document.createElement('div')), { id: 'sw-veil' });
  private swFocus: PortFocus = 'overview';
  private swAz = 0;
  private swZoom = 1;
  private swTime = 0;
  private swBusy = false;
  private saveTimer = 0;
  private captain = new Captain();
  /** Photo mode: the voyage frozen, the HUD gone and a free camera; see ui/photo.ts. */
  private photo: PhotoMode;
  private photoSnap: AtmosSnapshot | null = null;
  private photoSky = false;
  private photoSkyT = 0;
  /** Pixel ratio forced for one high-resolution capture (0 in play). */
  private captureDpr = 0;
  private fpv = false;
  private sky = createSkyDome();

  constructor(private canvas: HTMLCanvasElement) {
    installSoftShadows();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: false, alpha: false });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // the final pass encodes sRGB itself
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = true;
    installPassCulling(this.renderer);
    this.quality = detectQuality(this.renderer);
    this.prof = new Profiler(this.renderer, () => ({
      scale: this.scaler.scale,
      width: this.pipeline.width,
      height: this.pipeline.height,
      preset: this.settings.value.preset,
      tier: this.quality.tier,
      msaa: this.pipeline.settings.msaa,
      shadow: this.sun.shadow.mapSize.x,
    }));
    this.settings = new Settings(this.quality.tier);
    this.pipeline = new Pipeline(this.renderer, { msaa: this.quality.msaa, bloomLevels: this.quality.bloomLevels, tiltShift: this.quality.tiltShift });
    this.pipeline.prof = this.prof;
    this.rig = new CameraRig(innerWidth / innerHeight);
    this.input = new Input(canvas);
    this.ui.setTouch(this.input.isTouch);
    this.input.bindJoystick(document.getElementById('joy')!, document.getElementById('joy-knob')!);
    this.input.bindFireButtons(document.getElementById('t-port')!, document.getElementById('t-fire')!, document.getElementById('t-star')!);
    this.input.bindViewButtons(document.getElementById('btn-view')!, document.getElementById('btn-helm')!, document.getElementById('t-spy')!);
    this.captain.onStep = (k) => this.audio.footstep(k);
    this.input.onTouchDetected = () => this.ui.setTouch(true);
    this.photo = new PhotoMode(canvas);
    this.photo.onClick = () => this.ui.onClick();
    this.photo.onClose = () => this.closePhoto();
    this.photo.onCapture = () => void this.capturePhoto();
    this.photo.onScene = (hour, kind) => {
      if (!this.photoSnap) return;
      this.atmos.preview(this.photoSnap, hour, kind);
      this.photoSky = true;
    };
    this.photo.pickAt = (x, y) => this.pickDepth(x, y);

    // the key light: the sun by day, the moon by night (see world/atmosphere.ts)
    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(this.quality.shadowSize, this.quality.shadowSize);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.05;
    this.sun.shadow.radius = 2.5;
    const sc = this.sun.shadow.camera;
    sc.near = 0;
    sc.far = SHADOW_TOP - SHADOW_FLOOR;
    this.sun.shadow.updateMatrices = () => this.fitShadow();
    this.opaque.add(this.sun, this.sun.target);
    this.pipeline.sun = this.sun;
    // shared with every shader, so a moving sun moves the traced shadows too
    this.pipeline.sunDir = globalUniforms.uSunDir.value;
    this.settings.onChange((s) => this.applySettings(s));
    new GraphicsPanel(this.settings, () => this.ui.onClick(), () => ({
      fps: this.fps,
      scale: this.scaler.scale,
      maxShadow: Math.min(4096, this.renderer.capabilities.maxTextureSize),
    }));
    this.applySettings(this.settings.value);
    this.opaque.fog = new THREE.Fog(new THREE.Color(), 380, 1500);
    this.skyEnv = new SkyEnvironment(this.renderer);
    this.applyAtmosphere();
    const modes = ['auto', 'clear', 'fair', 'cloudy', 'mist', 'rain', 'storm'] as const;
    const times = ['auto', 'dawn', 'noon', 'golden', 'dusk', 'night'] as const;
    // the icon picks the weather, the clock picks the hour
    document.getElementById('hud-sky')!.addEventListener('click', (e) => {
      e.stopPropagation();
      if ((e.target as HTMLElement).closest('#hud-clock')) {
        const t = times[(times.indexOf(this.atmos.timeMode) + 1) % times.length];
        this.atmos.setTimeMode(t);
        this.ui.skyTag(t === 'auto' ? 'Time · Auto' : TIMES[t].name);
        return;
      }
      const m = modes[(modes.indexOf(this.atmos.mode) + 1) % modes.length];
      this.atmos.setMode(m);
      this.ui.skyTag(m === 'auto' ? 'Weather · Auto' : WEATHER[m].name);
    });
    this.atmos.onChange = (_k, title, line) => {
      if (this.state === 'playing') this.ui.toast(title, line, 3.4);
    };
    this.opaque.add(this.projectiles.mesh, this.loot.group, this.debris.group, this.sky);

    this.wireUI();
    this.wireShipwright();
    // browsers only let sound start from a gesture (and on phones a touch only
    // counts once it lifts), so any tap or key in the harbour wakes the theme
    const wake = () => {
      if (this.state !== 'menu' && this.state !== 'loading' && this.state !== 'port') return;
      this.audio.start();
      this.audio.setMusic(true);
    };
    for (const ev of ['pointerup', 'touchend', 'keydown'] as const) addEventListener(ev, wake, true);
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') {
        this.setChart(false);
        this.setPaused(true);
      }
    });
  }

  // ------------------------------------------------------------------ setup

  async init() {
    const ui = this.ui;
    const q = this.quality;
    // webfonts load on first use: fetch every weight now so a toast or banner
    // never stalls on a font mid-voyage
    const fonts = Promise.all(
      ['500 1em Cinzel', '700 1em Cinzel', '400 1em Inter', '600 1em Inter', '800 1em Inter'].map((f) => document.fonts?.load(f).catch(() => [])),
    );
    ui.progress(0.05);
    await nextFrame();
    this.terrain = new Terrain(20251019);
    ui.progress(0.3);
    await nextFrame();
    this.terrain.bakeAO(2);
    ui.progress(0.5);
    await nextFrame();
    const site = findPortSite(this.terrain, this.spawnPoint);
    const veg = (this.veg = new Vegetation(this.terrain, q.vegetation, portClearings(site), q.tier === 0));
    ui.progress(0.62);
    await nextFrame();
    this.opaque.add(this.terrain.buildMeshes(q.terrainLod, q.tier === 0));
    this.opaque.add(veg.build());
    this.port = new Port(site, (x, z) => this.terrain.heightAt(x, z));
    await preloadPaint(this.look.flag.paint);
    await this.port.build(this.look);
    this.opaque.add(this.port.root);
    this.birds = new Birds(this.terrain.islands, q.tier === 0 ? 18 : 36, (x, z) => this.terrain.heightAt(x, z));
    this.opaque.add(this.birds.mesh);
    ui.progress(0.75);
    await nextFrame();

    const windAngle = 1.25;
    const waves = buildWaves(windAngle, 1);
    this.baseWaves = waves.map((w) => ({ ...w }));
    this.wake = new WakeField(q.wakeRes, 300);
    const seaFloor = this.terrain.createHeightTexture(512);
    this.wake.setTerrain(seaFloor);
    this.ocean = new Ocean(waves, { segments: q.oceanSegments, half: 760, heightTex: seaFloor, wake: this.wake, quality: q.tier > 0 ? 1 : 0 });
    this.particles = new Particles(q.particles);
    this.loot.buildBeacons(this.particles.uniforms, globalUniforms.uTime);
    this.water.add(this.ocean.mesh, this.particles.group, this.loot.fx);
    // the sea from beneath: hidden until the farewell follows a wreck under (the warm-up still draws it)
    this.opaque.add(this.ocean.underside);
    this.pipeline.onRefl = (z) => this.ocean.setHalfDepth(z);
    this.world = new World(this.terrain, waves, this.particles, this.wake, this.audio, windAngle);
    this.world.debris = this.debris;
    this.world.onShot = (s) => this.projectiles.add(s);
    this.world.onShake = (a) => this.rig.shake(a);
    this.world.onDot = (ship, by, dmg) => this.onBurn(ship as Ship, by as Ship | null, dmg);
    this.world.onStatus = (ship, st, by) => this.onStatus(ship as Ship, st, by as Ship | null);
    globalUniforms.uWind.value.set(this.world.wind.dirX, this.world.wind.dirZ, this.world.wind.strength);
    this.windField = new WindField(this.world.wind.dirX, this.world.wind.dirZ, q.tier === 0 ? 6 : 8);
    this.world.gustAt = (x, z) => this.windField.at(x, z);
    this.wisps = new WindWisps(this.windField, q.tier === 0 ? 12 : 22, (x, z) => this.terrain.heightAt(x, z));
    this.water.add(this.wisps.mesh);
    this.rain = new Rain([2400, 4800, 7200][q.tier]);
    this.lightning = new Lightning();
    this.water.add(this.rain.mesh, this.lightning.mesh);
    this.crew = new CrewSystem(q.tier);
    this.opaque.add(this.crew.mesh);
    this.projectiles.onHit = (e) => this.onHit(e.ship, e.attacker, e.damage, e.pos);

    this.opaque.environment = this.skyEnv.update();
    this.opaque.environmentIntensity = SKY_LIGHT;
    this.ui.buildMap(this.terrain);
    this.ui.setWind(windAngle);
    this.gunnery = new Gunnery();
    this.gunnery.onReady = (side) => this.onGunsReady(side);
    this.water.add(this.gunnery.group);
    ui.progress(0.88);
    await nextFrame();

    this.applySettings(this.settings.value);
    this.resize();
    this.enterMenu();
    // warm up before the first visible frame: compile every shader, upload every
    // ship texture, then draw the whole world once for real (see render/warmup)
    this.rig.update(0.016, this.spawnPoint, new THREE.Vector3(), 0);
    for (const id of Object.keys(SHIP_CLASSES) as ShipClassId[]) {
      // pirate paint only: the player's own ship is in the scene and gets the warm-up draw below
      for (const liv of PIRATE_LIVERIES) {
        for (const t of ShipModel.textures(SHIP_CLASSES[id], liv, this.quality.physicalHull ? 1 : 0)) this.renderer.initTexture(t);
      }
    }
    ui.progress(0.92);
    await this.renderer.compileAsync(this.opaque, this.rig.camera);
    await this.renderer.compileAsync(this.water, this.rig.camera);
    await this.renderer.compileAsync(this.ocean.reflScene, this.rig.camera);
    ui.progress(0.96);
    await nextFrame();
    this.rig.update(0.016, this.spawnPoint, new THREE.Vector3(), 0);
    // twice: the first pass makes the shadow map, which the water then switches on.
    // Plants stay unculled so every one of their batches is drawn too.
    veg.hold = true;
    warmDraw([this.opaque, this.water, this.ocean.reflScene], () => {
      this.render(0);
      this.render(0);
    });
    veg.hold = false;
    await fonts;
    ui.progress(1);
    await nextFrame();
    ui.hideLoading();
    this.last = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private wireUI() {
    const ui = this.ui;
    ui.onClick = () => {
      this.audio.start();
      this.audio.click();
    };
    ui.onSelect = (id) => this.setPreview(id);
    ui.onSail = () => this.startVoyage();
    ui.onAmmo = (id) => this.selectAmmo(id);
    ui.onResume = () => this.setPaused(false);
    ui.onPause = () => this.setPaused(true);
    ui.onMap = (on) => this.setChart(on);
    ui.onPhoto = () => this.openPhoto();
    ui.onQuit = () => {
      this.ui.showPause(false);
      this.resetWorld();
      this.enterMenu();
    };
    ui.onAgain = () => this.leaveWreck(false);
    ui.onRetry = () => this.leaveWreck(true);
    ui.onTally = (i, best) => this.audio.tally(i, best);
    ui.onSkip = () => {
      // straight to the plunge; once under, straight to the farewell
      const k = this.wreck;
      if (k.t < 0) return;
      if (k.t < DIVE - 0.4) k.t = DIVE - 0.4;
      else k.skip = true;
    };
    ui.onSound = (on) => this.audio.setMuted(!on);
    ui.onSettings = (st) => {
      this.audio.setMusicEnabled(st.music);
      this.audio.setVolumes({ master: st.volMaster, music: st.volMusic, effects: st.volEffects, ambience: st.volAmbience });
      this.rig.shakeScale = SHAKE_SCALE[st.shake];
    };
    this.audio.setMuted(!ui.settings.sound);
    ui.onSettings(ui.settings);
  }

  /** Pushes graphics settings into the renderer; safe to call any time. */
  private applySettings(s: GraphicsSettings) {
    const b = this.settings.budget;
    const maxSamples = this.renderer.capabilities.maxSamples || 0;
    this.pipeline.configure(
      { msaa: s.antialias ? Math.min(4, maxSamples) : 0, bloomLevels: s.bloom ? Math.max(4, this.quality.bloomLevels) : 0, tiltShift: s.tiltShift },
      { ao: s.rtAO, gi: s.rtGI, shadows: s.rtShadows, aoSamples: b.aoSamples, shadowSteps: b.shadowSteps },
    );
    this.ocean?.setReflections(s.rtReflections ? b.ssrSteps : 0);
    const size = Math.min(s.shadowRes, this.renderer.capabilities.maxTextureSize);
    const sh = this.sun.shadow;
    if (sh.mapSize.x !== size) {
      sh.mapSize.set(size, size);
      // three rebuilds the map at the new size on the next shadow pass
      sh.map?.dispose();
      sh.map = null;
    }
    this.softShadows = s.softShadows;
    this.scaler.fixed = s.resolution;
    if (s.resolution && this.scaler.scale !== s.resolution) {
      this.scaler.scale = s.resolution;
      this.resize();
    }
  }

  // ------------------------------------------------------------------ shipwright

  private wireShipwright() {
    const sw = this.shipwright;
    // entries sit under Set Sail in the menu dock: the Shipwright and the Vault side by side
    const row = document.createElement('div');
    row.className = 'dock-row';
    const btn = document.createElement('button');
    btn.className = 'btn menu-custom';
    btn.id = 'btn-shipwright';
    btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 21V4" /><path d="M5 4h12l-2.5 4L17 12H5" /></svg><span>Shipwright</span>';
    const vbtn = document.createElement('button');
    vbtn.className = 'btn menu-custom menu-vault';
    vbtn.id = 'btn-vault';
    vbtn.innerHTML = '<span class="mv-chest"></span><span>Vault</span><i class="mv-dot"></i>';
    row.append(btn, vbtn);
    document.getElementById('btn-sail')!.after(row);
    btn.addEventListener('click', () => {
      this.audio.start();
      this.audio.click();
      this.openShipwright();
    });
    vbtn.addEventListener('click', () => {
      this.audio.start();
      this.audio.click();
      this.openVault();
    });
    const syncDot = () => vbtn.classList.toggle('ready', this.vaultStore.freeReady || this.vaultStore.unseen.length > 0);
    this.vaultStore.subscribe(syncDot);
    syncDot();
    this.wireVault();
    sw.setVault(this.vaultStore);
    sw.onEquip = () => this.applyCosmetics();
    sw.onVault = () => this.openVault();
    sw.onTestFire = () => this.testFire();
    sw.onClick = () => {
      this.audio.start();
      this.audio.click();
    };
    sw.onDone = () => this.closeShipwright();
    sw.onTab = (tab: SwTab) => {
      this.swFocus = ({ flag: 'flag', sails: 'sails', hull: 'hull', skins: 'overview', cannons: 'overview', presets: 'overview' } as const)[tab];
      this.swAz = 0;
    };
    sw.onChange = (look, what) => this.applyLook(look, what);
    // a saved hand-painted flag decodes in the background; redraw once it lands
    onPaintReady(() => {
      this.port.setLook(this.look);
      const s = this.preview;
      if (s) s.model.restyle(lookToLivery(this.look));
    });

    // drag to swing round the ship, wheel / pinch to zoom
    const pts = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      if (this.state !== 'port') return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      c.setPointerCapture(e.pointerId);
      pinch = 0;
    });
    c.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p || this.state !== 'port') return;
      if (pts.size === 1) {
        this.swAz = clamp(this.swAz - ((e.clientX - p.x) / Math.max(innerWidth, 1)) * 2.6, -1.25, 1);
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d0 = Math.hypot(a.x - b.x, a.y - b.y);
        p.x = e.clientX;
        p.y = e.clientY;
        const d1 = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch && d0 > 1) this.swZoom = clamp(this.swZoom * (d0 / d1), 0.6, 1.5);
        pinch = 1;
        return;
      }
      p.x = e.clientX;
      p.y = e.clientY;
    });
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      pinch = 0;
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener(
      'wheel',
      (e) => {
        if (this.state !== 'port') return;
        e.preventDefault();
        this.swZoom = clamp(this.swZoom * Math.exp(e.deltaY * 0.0012), 0.6, 1.5);
      },
      { passive: false },
    );
  }

  private wireVault() {
    const v = this.vault;
    const a = this.audio;
    v.sounds = {
      click: () => a.click(),
      rumble: (l) => a.vaultRumble(l),
      burst: (t) => a.vaultBurst(t),
      flip: (t) => a.cardFlip(t),
      coin: () => a.coin(),
    };
    v.onEquip = () => this.applyCosmetics();
    v.onClose = () => this.closeVault();
  }

  /** The vault opens over the home screen or over the Shipwright's harbour. */
  private openVault() {
    if (this.vault.isOpen || this.swBusy || (this.state !== 'menu' && this.state !== 'port')) return;
    this.audio.start();
    if (this.state === 'menu') this.ui.showMenu(false);
    else this.shipwright.root.classList.add('sw-away');
    this.vault.open();
  }

  private closeVault() {
    this.vault.close();
    if (this.state === 'menu') {
      this.ui.showMenu(true);
      this.frameMenu();
    } else if (this.state === 'port') {
      this.shipwright.root.classList.remove('sw-away');
      this.shipwright.refresh();
    }
  }

  /** Dresses your ship (at the berth, in the menu or at sea) in what the vault says is equipped. */
  private applyCosmetics(s: Ship | null = this.player ?? this.preview) {
    if (!s || s.team !== 'player') return;
    const eq = this.vaultStore.equipped;
    s.model.setSkin(skinItem(eq.skin));
    s.cannonFx.blast = fxItem(eq.blast)?.style ?? 'powder';
    s.cannonFx.trail = fxItem(eq.trail)?.style ?? 'powder';
  }

  /** Shipwright: run out the guns on the seaward side and fire a broadside to see the blast and trail. */
  private testFire() {
    const p = this.preview;
    if (this.state !== 'port' || !p) return;
    const left = p.portDir(new THREE.Vector3());
    const reach = 45;
    const hl = this.terrain.heightAt(p.pos.x + left.x * reach, p.pos.z + left.z * reach);
    const hr = this.terrain.heightAt(p.pos.x - left.x * reach, p.pos.z - left.z * reach);
    const side = hl <= hr ? 'port' : 'starboard';
    const k = side === 'port' ? 1 : -1;
    p.reload[side] = 0;
    const at = new THREE.Vector3(p.pos.x + left.x * k * 70 + Math.sin(p.heading) * 6, 0, p.pos.z + left.z * k * 70 + Math.cos(p.heading) * 6);
    this.audio.start();
    if (p.fire(side, this.world, null, at)) this.swAz = k > 0 ? 0.5 : -0.5;
  }

  /** Streams a change from the panel onto the moored ship and the harbour. */
  private applyLook(look: ShipLook, what: 'flag' | 'paint' | 'sail' | 'hull' | 'name' | 'all') {
    const hullWas = hullKey(this.look);
    this.look = structuredClone(look);
    const s = this.preview;
    if (s) {
      const liv = lookToLivery(this.look);
      if (what === 'all' || what === 'name') s.name = this.look.name.trim() || s.cls.title;
      if (what === 'name') {
        // nothing to repaint
      } else if (what === 'paint') s.model.restyleFlag(liv);
      else if (what === 'flag' || what === 'sail' || hullKey(this.look) === hullWas) s.model.restyle(liv);
      else {
        // the hull is baked into the model: build a fresh one at the berth
        this.setPreview(s.cls.id);
        this.port.setShip(this.preview);
        this.port.pin(this.preview!);
      }
    }
    if (what !== 'name') this.port.setLook(this.look);
    clearTimeout(this.saveTimer);
    if (this.look.flag.paint !== 'live') this.saveTimer = window.setTimeout(() => saveLook(this.look), 300);
  }

  private async fade(mid: () => void) {
    this.swBusy = true;
    this.veil.classList.add('on');
    await new Promise((r) => setTimeout(r, 430));
    mid();
    await nextFrame();
    await nextFrame();
    this.veil.classList.remove('on');
    this.swBusy = false;
  }

  private openShipwright() {
    if (this.state !== 'menu' || this.swBusy) return;
    this.veil.innerHTML = `<span>Rowing to ${this.port.name}…</span>`;
    void this.fade(() => {
      this.state = 'port';
      this.ui.showMenu(false);
      for (const s of this.ships) s.root.visible = false;
      this.setPreview(this.ui.selected);
      const p = this.preview!;
      this.port.visible = true;
      this.port.setLook(this.look);
      this.port.setShip(p);
      this.port.pin(p);
      p.sailLevel = 1;
      // settle the model at the berth so the first shot finds its flag
      p.update(0.016, this.world);
      this.port.pin(p);
      p.root.updateMatrixWorld(true);
      this.swFocus = 'flag';
      this.swAz = 0;
      this.swZoom = 1;
      this.shipwright.open(this.look, this.port.name);
      this.rig.mode = 'port';
      this.rig.menuShift = { x: 0, y: 0, w: 1, h: 1 };
      this.framePort(0);
      this.rig.snapShot();
    });
  }

  private closeShipwright() {
    if (this.state !== 'port' || this.swBusy) return;
    clearTimeout(this.saveTimer);
    saveLook(this.look);
    this.veil.innerHTML = '<span>Back to the open sea…</span>';
    void this.fade(() => {
      this.shipwright.close();
      this.port.visible = false;
      this.port.setShip(null);
      this.rig.camera.clearViewOffset();
      for (const s of this.ships) s.root.visible = true;
      this.enterMenu();
    });
  }

  /** Points the harbour camera at whatever the open tab is about. */
  private framePort(dt: number) {
    const p = this.preview;
    if (!p) return;
    this.swTime += dt;
    const sway = Math.sin(this.swTime * 0.16) * 0.07;
    // keep the ship in the part of the screen the panel leaves free
    const W = innerWidth;
    const H = innerHeight;
    const r = this.shipwright.panelRect();
    const vs = this.rig.viewShift;
    let fw = W;
    let fh = H;
    if (!r.width) vs.x = vs.y = 0;
    else if (r.left > W * 0.35) {
      vs.x = (W - r.left) / 2;
      vs.y = 0;
      fw = r.left;
    } else {
      vs.x = 0;
      vs.y = Math.max(0, H - r.top) / 2;
      fh = Math.max(r.top, H * 0.2);
    }
    // the shots are framed for a wide free area; back off when it is narrow or short
    const fit = clamp(Math.max(1.17 / (fw / H), fh > 0 ? H / fh : 1) ** 0.85, 1, 2.6);
    const shot = this.port.shot(this.swFocus, p, this.swAz + sway, this.swZoom * fit);
    this.rig.shotPos.copy(shot.pos);
    this.rig.shotLook.copy(shot.look);
  }

  private resize() {
    const w = innerWidth;
    const h = innerHeight;
    this.dpr = this.captureDpr || Math.min(devicePixelRatio || 1, this.quality.maxDpr) * this.scaler.scale;
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h, false);
    this.pipeline.setSize(w * this.dpr, h * this.dpr);
    this.rig.camera.aspect = w / h;
    this.rig.camera.updateProjectionMatrix();
    // tighter framing on portrait phones
    this.rig.zoom = clamp(this.rig.zoom, 0, 1);
    this.frameMenu();
  }

  private frameMenu() {
    this.rig.menuShift = this.state === 'menu' || this.state === 'loading' ? this.ui.menuFraming() : { x: 0, y: 0, w: 1, h: 1 };
  }

  // ------------------------------------------------------------------ ships

  private pirateLivery() {
    return PIRATE_LIVERIES[Math.floor(Math.random() * PIRATE_LIVERIES.length)];
  }

  private makeShip(id: ShipClassId, team: 'player' | 'pirate', livery = team === 'player' ? lookToLivery(this.look) : this.pirateLivery(), model?: ShipModel): Ship {
    const s = new Ship(SHIP_CLASSES[id], livery, team, this.quality.physicalHull ? 1 : 0, model);
    if (team === 'player') {
      s.name = this.look.name.trim() || s.cls.title;
      this.applyCosmetics(s);
    }
    else {
      s.name = PIRATE_NAMES[this.nameIdx++ % PIRATE_NAMES.length];
      s.gold = 0;
    }
    this.ships.push(s);
    this.opaque.add(s.root);
    return s;
  }

  private removeShip(s: Ship) {
    this.opaque.remove(s.root);
    this.ships.splice(this.ships.indexOf(s), 1);
    this.ais.delete(s);
    s.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    s.model.dispose();
    s.dispose();
  }

  private setPreview(id: ShipClassId) {
    const old = this.preview;
    const s = this.makeShip(id, 'player');
    s.place(this.spawnPoint.x, this.spawnPoint.z, Math.PI * 0.82);
    s.anchored = true;
    s.sailTarget = 1;
    s.sailLevel = old ? old.sailLevel : 1;
    if (old) this.removeShip(old);
    this.preview = s;
    this.rig.orbitCenter.set(s.pos.x, 0, s.pos.z);
    // the real bounds of hull + rig (bowsprit to transom, keel to the tallest truck), in the ship's own frame
    const pos = s.root.position.clone();
    const rot = s.root.quaternion.clone();
    s.root.position.set(0, 0, 0);
    s.root.quaternion.identity();
    s.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(s.root);
    box.min.y = Math.max(box.min.y, -1.5);
    s.root.position.copy(pos);
    s.root.quaternion.copy(rot);
    s.root.updateMatrixWorld(true);
    this.rig.orbitBox = box;
    this.rig.orbitQuat = rot;
  }

  private findOpenWater(cx: number, cz: number, rMin: number, rMax: number): THREE.Vector3 {
    for (let i = 0; i < 80; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = rMin + Math.random() * (rMax - rMin);
      const x = clamp(cx + Math.cos(a) * r, -900, 900);
      const z = clamp(cz + Math.sin(a) * r, -900, 900);
      if (this.terrain.heightAt(x, z) > -9) continue;
      if (this.ships.some((s) => Math.hypot(s.pos.x - x, s.pos.z - z) < 80)) continue;
      return new THREE.Vector3(x, 0, z);
    }
    return new THREE.Vector3(cx + rMax, 0, cz);
  }

  private spawnPirate(near: THREE.Vector3, rMin: number, rMax: number, forceId?: ShipClassId) {
    const kills = this.player?.kills ?? 0;
    const roll = Math.random();
    let id: ShipClassId = forceId ?? (roll < 0.48 ? 'sloop' : roll < 0.82 ? 'brig' : 'galleon');
    if (!forceId && kills < 2 && id === 'galleon') id = 'brig';
    const p = this.findOpenWater(near.x, near.z, rMin, rMax);
    return this.launchPirate(id, p.x, p.z, Math.random() * Math.PI * 2);
  }

  /** How many ready hulls of each class the shipyard keeps on the slipway. */
  private static readonly STOCK: Record<ShipClassId, number> = { sloop: 3, brig: 3, galleon: 1 };

  private runShipyard() {
    if (!this.keel) {
      const ids = Object.keys(Game.STOCK) as ShipClassId[];
      const id = ids.find((k) => this.shipyard.filter((m) => m.cls.id === k).length < Game.STOCK[k]);
      if (!id) return;
      this.keel = new ShipModel(SHIP_CLASSES[id], this.pirateLivery(), this.quality.physicalHull ? 1 : 0, true);
    }
    const t0 = performance.now();
    while (performance.now() - t0 < 2.5) {
      if (this.keel.step()) {
        this.shipyard.push(this.keel);
        this.keel = null;
        return;
      }
    }
  }

  private launchPirate(id: ShipClassId, x: number, z: number, heading: number) {
    const kills = this.player?.kills ?? 0;
    const i = this.shipyard.findIndex((m) => m.cls.id === id);
    const model = i >= 0 ? this.shipyard.splice(i, 1)[0] : undefined;
    const s = this.makeShip(id, 'pirate', model?.livery, model);
    s.place(x, z, heading);
    s.sailTarget = 0.5;
    s.sailLevel = 0.5;
    s.speed = s.cls.maxSpeed * 0.4;
    const ai = new PirateAI(s, kills / 4);
    this.ais.set(s, ai);
    return ai;
  }

  /** A flotilla: a flagship with two or three escorts in a loose vee. */
  private spawnFlotilla(near: THREE.Vector3, rMin: number, rMax: number, size: number) {
    const kills = this.player?.kills ?? 0;
    const flagId: ShipClassId = kills >= 4 && Math.random() < 0.6 ? 'galleon' : 'brig';
    const flag = this.spawnPirate(near, rMin, rMax, flagId);
    const pack = new Pack();
    pack.leader = flag;
    flag.pack = pack;
    const fs = flag.ship;
    const h = fs.heading;
    const sh = Math.sin(h);
    const ch = Math.cos(h);
    for (let i = 0; i < size - 1; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const rank = 1 + Math.floor(i / 2);
      const slot = { x: side * 34 * rank, z: 30 * rank };
      let x = fs.pos.x + ch * slot.x - sh * slot.z;
      let z = fs.pos.z - sh * slot.x - ch * slot.z;
      if (this.terrain.heightAt(x, z) > -9) {
        const o = this.findOpenWater(fs.pos.x, fs.pos.z, 50, 110);
        x = o.x;
        z = o.z;
      }
      const ai = this.launchPirate(Math.random() < 0.65 ? 'sloop' : 'brig', x, z, h);
      ai.pack = pack;
      ai.slot = slot;
    }
  }

  private enterMenu() {
    this.state = 'menu';
    this.player = null;
    this.input.enabled = false;
    this.ui.showHud(false);
    this.ui.showMenu(true);
    this.audio.setMusic(true, true);
    this.rig.mode = 'orbit';
    this.setPreview(this.ui.selected);
    this.rig.snapTo(this.spawnPoint);
    this.frameMenu();
    // a couple of pirates on the horizon for life
    if (!this.ships.some((s) => s.team === 'pirate')) {
      this.spawnPirate(this.spawnPoint, 180, 300);
      this.spawnFlotilla(this.spawnPoint, 300, 420, 2);
    }
  }

  private startVoyage() {
    if (!this.preview) return;
    this.audio.start();
    this.audio.setMusic(false);
    const p = this.preview;
    this.preview = null;
    p.anchored = false;
    p.sailTarget = 2 / 3;
    this.player = p;
    this.state = 'playing';
    this.voyageTime = 0;
    this.log = { shots: 0, hits: 0, dealt: 0, chests: 0, best: -1, metres: 0, events: [] };
    this.discovered.clear();
    this.ammoStock = freshStock();
    p.ammo = 'round';
    this.ui.setFan(false);
    this.input.enabled = true;
    this.ui.showMenu(false);
    this.ui.showHud(true);
    this.rig.mode = 'follow';
    this.rig.menuShift = { x: 0, y: 0, w: 1, h: 1 };
    this.rig.zoom = innerWidth < innerHeight ? 0.5 : 0.42;
    this.spawnTimer = 4;
    this.ui.toast('Weigh anchor', `The ${p.name} sets sail`, 3);
  }

  private resetWorld() {
    this.setView(false);
    this.rig.resetEye();
    for (const s of this.ships.slice()) this.removeShip(s);
    this.projectiles.clear();
    this.particles.streaks.begin();
    this.particles.streaks.end();
    this.particles.ribbons.clear();
    this.loot.clear();
    this.debris.clear();
    this.crew.clear();
    this.player = null;
    this.preview = null;
  }

  /** Bird's-eye or the captain's own eyes on deck. */
  private setView(on: boolean) {
    const p = this.player;
    if (on && (!p || !p.alive || this.state !== 'playing')) return;
    if (on === this.fpv) return;
    this.fpv = on;
    this.rig.firstPerson = on;
    this.input.fpv = on;
    this.input.helmMode = false;
    if (on && p) {
      this.captain.board(p, this.crew.deckView(p), this.crew.captainAt(p));
      this.crew.setPilot(p, this.captain.pilot);
    } else {
      this.captain.leave();
      this.input.releaseLook();
    }
    this.ui.setFpv(on);
  }

  private setPaused(on: boolean) {
    if (on && this.state === 'playing') {
      this.input.releaseLook();
      this.state = 'paused';
      const p = this.player;
      this.ui.showPause(true, p ? { gold: p.gold, kills: p.kills, isles: this.discovered.size, time: this.voyageTime, ship: p.name, cls: p.cls.id } : undefined);
    } else if (!on && this.state === 'paused') {
      this.state = 'playing';
      this.ui.showPause(false);
      this.last = performance.now();
    }
  }

  // ------------------------------------------------------------------ photo mode

  /** Freezes the voyage, clears the HUD away and hands the camera to photo mode. */
  private openPhoto() {
    const p = this.player;
    if (this.photo.active || !p || this.wreck.t >= 0) return;
    let fromPause: boolean;
    if (this.state === 'playing') {
      this.setChart(false);
      this.input.releaseLook();
      this.state = 'paused';
      fromPause = false;
    } else if (this.state === 'paused') {
      this.ui.showPause(false);
      fromPause = true;
    } else return;
    this.input.enabled = false;
    this.photoSnap = this.atmos.snapshot();
    document.body.classList.add('photo');
    this.photo.open(this.rig.camera, p.pos, this.atmos.hour, fromPause);
  }

  /** Puts the sky back as it was and returns to the pause menu or the helm. */
  private closePhoto() {
    if (!this.photo.active) return;
    this.photo.close();
    if (this.photoSnap) this.atmos.restore(this.photoSnap);
    this.photoSnap = null;
    this.envT = 0;
    this.rig.photoDist = 0;
    this.pipeline.photo = null;
    document.body.classList.remove('photo');
    this.input.enabled = true;
    if (this.photo.fromPause) {
      const p = this.player;
      this.ui.showPause(true, p ? { gold: p.gold, kills: p.kills, isles: this.discovered.size, time: this.voyageTime, ship: p.name, cls: p.cls.id } : undefined);
    } else {
      this.state = 'playing';
      this.last = performance.now();
    }
  }

  /** View depth (m) of the first thing under a screen point: a hull, an island or the sea. */
  private pickDepth(x: number, y: number): number | null {
    const cam = this.rig.camera;
    const dir = PhotoMode.ray(cam, x, y, _a);
    const o = cam.position;
    let best = Infinity;
    for (const s of this.ships) {
      if (s.removed) continue;
      // a sphere round the hull and lower rig
      const r = s.cls.length * 0.55;
      const cx = s.pos.x - o.x;
      const cy = s.root.position.y + 6 - o.y;
      const cz = s.pos.z - o.z;
      const t = cx * dir.x + cy * dir.y + cz * dir.z;
      const d2 = cx * cx + cy * cy + cz * cz - t * t;
      if (t > 0 && d2 < r * r) best = Math.min(best, t - Math.sqrt(r * r - d2) * 0.5);
    }
    const w = this.world;
    const ground = (px: number, pz: number) => Math.max(this.terrain.heightAt(px, pz), w.waterHeight(px, pz));
    let prev = 0;
    for (let t = 1; t < Math.min(best, 2400); t += Math.max(0.6, t * 0.025)) {
      const px = o.x + dir.x * t;
      const py = o.y + dir.y * t;
      const pz = o.z + dir.z * t;
      if (py < ground(px, pz)) {
        // home in on the surface
        let lo = prev;
        let hi = t;
        for (let i = 0; i < 6; i++) {
          const m = (lo + hi) / 2;
          if (o.y + dir.y * m < ground(o.x + dir.x * m, o.z + dir.z * m)) hi = m;
          else lo = m;
        }
        best = Math.min(best, hi);
        break;
      }
      prev = t;
    }
    if (!Number.isFinite(best)) return null;
    // distance along the ray to depth along the view
    return best * dir.dot(cam.getWorldDirection(new THREE.Vector3()));
  }

  /**
   * The shutter: one frame redrawn at the screen's full pixel density (higher
   * than play renders at), cropped to the chosen frame and saved as a PNG, or
   * handed to the share sheet on a phone.
   */
  private async capturePhoto() {
    if (!this.photo.active) return;
    const w = innerWidth;
    const h = innerHeight;
    const maxTex = this.renderer.capabilities.maxTextureSize;
    let dpr = Math.max(this.dpr, Math.min(devicePixelRatio || 1, 2.5));
    // stay within a 4K-class frame and what the GPU can allocate
    dpr = Math.min(dpr, Math.sqrt(8.3e6 / (w * h)), maxTex / Math.max(w, h));
    const crop = this.photo.crop();
    const out = document.createElement('canvas');
    try {
      if (Math.abs(dpr - this.dpr) > 0.01) {
        this.captureDpr = dpr;
        this.resize();
      }
      this.render(0);
      const cw = this.canvas.width;
      const ch = this.canvas.height;
      out.width = Math.round(cw * crop.w);
      out.height = Math.round(ch * crop.h);
      out.getContext('2d')!.drawImage(this.canvas, Math.round(cw * crop.x), Math.round(ch * crop.y), out.width, out.height, 0, 0, out.width, out.height);
    } finally {
      if (this.captureDpr) {
        this.captureDpr = 0;
        this.resize();
        this.render(0);
      }
    }
    this.photo.flash();
    this.audio.shutter();
    const blob = await new Promise<Blob | null>((r) => out.toBlob(r, 'image/png'));
    if (!blob) return;
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
    const name = `shores-of-fortune-${stamp}.png`;
    const size = `${out.width} × ${out.height}`;
    if (this.input.isTouch && navigator.canShare) {
      const file = new File([blob], name, { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'Shores of Fortune' });
          this.photo.saved(blob, 'Photo shared', size);
          return;
        } catch (e) {
          if ((e as Error).name === 'AbortError') {
            this.photo.saved(blob, 'Photo taken', 'Sharing cancelled');
            return;
          }
          // no share sheet after all: fall through to a download
        }
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    this.photo.saved(blob, 'Photo saved', `${size} · Downloads`);
  }

  /** The sea chart overlays live play: the world keeps sailing underneath. */
  private setChart(on: boolean) {
    if (on && !this.chartOpen && this.state === 'playing' && this.player) {
      this.input.releaseLook();
      this.chartOpen = true;
      this.ui.showChart(true, this.player);
    } else if (!on && this.chartOpen) {
      this.chartOpen = false;
      this.ui.showChart(false);
    }
  }

  /** The pirate the player is duelling, so the camera can frame the two of them:
   *  the nearest ship hunting her (or that she has just traded shot with) inside gun range. */
  private battleFoe(): THREE.Vector3 | null {
    const p = this.player;
    if (!p || !p.alive) return null;
    const t = this.world.time;
    let best: Ship | null = null;
    let bd = Infinity;
    for (const [s, ai] of this.ais) {
      if (!s.alive || s.removed) continue;
      const d = Math.hypot(s.pos.x - p.pos.x, s.pos.z - p.pos.z);
      const fighting = ai.mode === 'engage' || (s.lastAttacker === p && t - s.lastHit < 12) || (p.lastAttacker === s && t - p.lastHit < 12);
      // a little hysteresis so the frame doesn't flicker at the edge of range
      if (fighting && d < (s === this.lastFoe ? 320 : 270) && d < bd) {
        bd = d;
        best = s;
      }
    }
    this.lastFoe = best;
    return best ? best.pos : null;
  }

  // ------------------------------------------------------------------ combat events

  private screenOf(p: THREE.Vector3): [number, number, boolean] {
    const v = p.clone().project(this.rig.camera);
    return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight, v.z < 1];
  }

  private onHit(ship: Ship, attacker: Ship, dmg: number, pos: THREE.Vector3) {
    const [x, y, ok] = this.screenOf(pos);
    if (attacker === this.player && ship !== this.player && this.state === 'playing') {
      this.log.hits++;
      this.log.dealt += dmg;
    }
    if (attacker === this.player && ok) this.ui.floater(`${Math.round(dmg)}`, x, y);
    if (ship === this.player) {
      if (ok) this.ui.floater(`-${Math.round(dmg)}`, x, y, 'bad');
      this.rig.shake(0.28);
      this.pipeline.flash(0.06);
    }
    if (!ship.alive && ship !== this.player) this.onSunk(ship, attacker);
    if (!ship.alive && ship === this.player) this.onPlayerSunk('shot');
  }

  /** A ship burning (fire shot): the damage ticks up off her deck, in embers rather than a blow. */
  private onBurn(ship: Ship, attacker: Ship | null, dmg: number) {
    if (dmg <= 0) return;
    const at = new THREE.Vector3(ship.pos.x, ship.root.position.y + ship.cls.freeboard + 2, ship.pos.z);
    const [x, y, ok] = this.screenOf(at);
    const p = this.player;
    if (attacker === p && ship !== p && this.state === 'playing') this.log.dealt += dmg;
    if (ok && (attacker === p || ship === p)) this.ui.floater(ship === p ? `-${Math.round(dmg)}` : `${Math.round(dmg)}`, x, y, 'burn');
    if (!ship.alive && ship !== p && attacker) this.onSunk(ship, attacker);
    if (!ship.alive && ship === p) this.onPlayerSunk('shot');
  }

  /** A special shot left its mark: say so over the ship, once per fresh effect. */
  private onStatus(ship: Ship, st: 'ablaze' | 'shredded' | 'crew', attacker: Ship | null) {
    const p = this.player;
    if (!p || (attacker !== p && ship !== p)) return;
    const at = new THREE.Vector3(ship.pos.x, ship.root.position.y + ship.cls.masts[0].height * 0.45 + 3, ship.pos.z);
    const [x, y, ok] = this.screenOf(at);
    const mine = ship === p;
    const text = { ablaze: mine ? 'We\'re ablaze!' : 'Ablaze!', shredded: mine ? 'Sails shredded!' : 'Sails shredded', crew: mine ? 'Gun crews cut down!' : 'Crews cut down' }[st];
    if (ok) this.ui.floater(text, x, y - 18, st);
  }

  private onSunk(ship: Ship, attacker: Ship) {
    // the replacement waits until the wreck has settled
    this.spawnTimer = Math.max(this.spawnTimer, 10);
    const bounty = { sloop: 60, brig: 110, galleon: 220 }[ship.cls.id];
    const luck = { sloop: 0, brig: 0.3, galleon: 0.6 }[ship.cls.id];
    this.loot.drop(ship.pos.x, ship.pos.z, 3 + Math.floor(ship.cls.length / 8), luck, ship.cls.id === 'galleon');
    if (attacker === this.player) {
      this.note('kill', `Sank the ${ship.name}`, `${ship.cls.name} · +${bounty} gold`);
      this.player.gold += bounty;
      this.vaultStore.earn(bounty);
      this.ui.toast(`+${bounty} gold bounty`, `${ship.name} sunk`, 3.2);
      this.audio.coin();
    }
  }

  /** A line in the ship's log, for the farewell. */
  private note(kind: VoyageEvent['kind'], text: string, detail = '') {
    if (this.state !== 'playing') return;
    const ev = this.log.events;
    ev.push({ t: this.voyageTime, kind, text, detail });
    if (ev.length > 40) ev.splice(0, 1);
  }

  /** She's going down: slow the blow, rise out of the captain's eyes and start the farewell. */
  private onPlayerSunk(how: 'shot' | 'hull') {
    const p = this.player;
    if (!p || this.wreck.t >= 0 || (this.state !== 'playing' && this.state !== 'paused')) return;
    this.input.enabled = false;
    this.input.releaseLook();
    this.setChart(false);
    this.setView(false);
    this.state = 'dead';
    // your own ship founders in moments rather than lingering as a hulk
    p.wreckLife = 3;
    const w = this.world;
    // who did it: a broadside, a ram, or the reef
    const foe = p.lastAttacker && p.lastAttacker !== p && w.time - p.lastHit < 20 ? p.lastAttacker : null;
    const aground = this.terrain.heightAt(p.pos.x, p.pos.z) > -p.cls.draft * 1.6;
    const cause: WreckReport['cause'] = how === 'shot' ? (foe ? 'shot' : 'aground') : aground || !foe ? 'aground' : 'rammed';
    let near: { name: string; d: number } | null = null;
    for (const isl of this.terrain.islands) {
      const d = Math.hypot(isl.x - p.pos.x, isl.z - p.pos.z) - isl.r;
      if (d < 520 && (!near || d < near.d)) near = { name: isl.name, d };
    }
    this.report = {
      ship: p.name,
      cls: p.cls.id,
      time: this.voyageTime,
      gold: p.gold,
      kills: p.kills,
      isles: this.discovered.size,
      islesTotal: this.terrain.islands.length,
      shots: this.log.shots,
      hits: this.log.hits,
      dealt: Math.round(this.log.dealt),
      chests: this.log.chests,
      best: this.log.best,
      miles: this.log.metres / 1852,
      cause,
      killer: cause === 'aground' ? undefined : foe?.name,
      killerCls: cause === 'aground' ? undefined : foe?.cls.id,
      where: near ? (near.d < 60 ? `on the shoals of ${near.name}` : `off ${near.name}`) : null,
      events: this.log.events.slice(),
    };
    // remember where the camera was, so the farewell can glide out of it
    const cam = this.rig.camera.position;
    const dx = cam.x - p.pos.x;
    const dz = cam.z - p.pos.z;
    const dist = Math.hypot(dx, cam.y, dz);
    this.wreck = {
      t: 0, hud: true, plunged: false, dived: false, shown: false, skip: false, deep: -1, under: -1, rest: -1, camSet: false,
      az: Math.atan2(dx, dz), elev: Math.asin(clamp(cam.y / Math.max(dist, 1), 0.1, 0.99)), dist: clamp(dist, 40, 320),
    };
    this.timeScale = 0.22;
    this.rig.shake(0.95);
    this.pipeline.flash(0.5);
    this.audio.founder();
    this.ui.beginWreck(this.report);
  }

  /** Runs the farewell: slow motion, the camera's long look, the plunge and the dive under. */
  private updateWreck(realDt: number) {
    const k = this.wreck;
    const p = this.player;
    if (k.t < 0 || !p) return;
    k.t += realDt;
    const T = k.t;
    this.timeScale = lerp(0.22, 1, smoothstep(0.4, 2.8, T));
    if (k.hud && T > 0.9) {
      k.hud = false;
      this.ui.showHud(false);
    }
    const w = this.world;
    const c = p.pos;
    const L = p.cls.length;
    const bed = this.terrain.heightAt(c.x, c.z);
    // deep enough to follow her down? on a reef the camera stays above and the water closes in instead
    if (k.deep < 0) k.deep = w.waterHeight(c.x, c.z) - bed > 7 ? 1 : 0;
    // the final plunge: her timbers groan and she goes by the stern
    if (!k.plunged && p.sinkT > p.wreckLife) {
      k.plunged = true;
      this.audio.groan();
      this.rig.shake(0.3);
    }
    if (!k.dived && T > DIVE) {
      // her last breath of air bursts up as she slips under
      k.dived = true;
      const y = w.waterHeight(c.x, c.z);
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * p.cls.beam;
        w.particles.splash(new THREE.Vector3(c.x + Math.cos(a) * r, y, c.z + Math.sin(a) * r), 1.1 + Math.random() * 0.6);
      }
      w.wake.stamp(c.x, c.z, L * 0.5, 1, true);
      w.wake.push(c.x, c.z, L * 0.4, -1);
      if (!k.deep) this.audio.submerge(true);
    }
    // she comes to rest on the seabed in a cloud of sand
    const rested = p.dmg.restT >= 0;
    if (rested && k.rest < 0) {
      k.rest = T;
      this.wreckLanding(p, bed);
    }
    if (k.deep && T > DIVE - 1) this.wreckBubbles(p, realDt * this.timeScale, rested ? T - k.rest : -1);

    // the post-grade: grey for the blow; underwater, a light swim and the sun shafts (heavy gloom on a reef)
    const shallowDepth = k.deep ? 0 : smoothstep(DIVE + 0.4, DIVE + 2.1, T);
    let post = shallowDepth;
    if (k.under >= 0) {
      // the instant the camera breaks the surface the picture swims and blurs, then clears
      const since = T - k.under;
      post = 0.24 + 0.7 * Math.exp(-since * since * 9);
    }
    this.pipeline.depth = post;
    this.pipeline.desat = 0.55 * smoothstep(0, 0.6, T) * (1 - Math.max(shallowDepth, k.under >= 0 ? 1 : 0));
    const showAt = k.deep ? Math.min(DIVE + 11, Math.max(DIVE + 5.5, k.rest >= 0 ? k.rest + 2.6 : Infinity)) : DIVE + 2;
    if (!k.shown && (T > showAt || (k.skip && T > DIVE))) {
      k.shown = true;
      this.ui.showDead(true, this.report!);
    }

    // the camera: a slow, lowering orbit around the wreck, then a dive to the water where she went down
    const settle = smoothstep(0, 7.5, T);
    const dive = smoothstep(DIVE - 0.4, DIVE + 2.2, T);
    let dist = lerp(k.dist, L * 1.25 + 30, settle);
    dist = lerp(dist, L * 0.7 + 14, dive);
    let elev = lerp(k.elev, 0.3, settle);
    elev = lerp(elev, 0.07, dive);
    const az = k.az + T * 0.07 * smoothstep(0, 2.5, T);
    const cp = this.cinePos.set(c.x + Math.sin(az) * Math.cos(elev) * dist, Math.sin(elev) * dist + 1.5, c.z + Math.cos(az) * Math.cos(elev) * dist);
    cp.y = Math.max(cp.y, w.waterHeight(cp.x, cp.z) + 1.6);
    this.cineLook.set(c.x, lerp(lerp(4, L * 0.3, settle), -6, dive), c.z);
    let fov = lerp(lerp(34, 29, settle), 44, dive);
    if (k.deep) {
      // ...and on down through the surface: alongside and a little below her as
      // she sinks, her hull dark against the bright window of the sky, then up
      // and back once she lies on the sand
      const sink = smoothstep(DIVE, DIVE + 2.4, T);
      const sy = p.root.position.y;
      const after = k.rest >= 0 ? smoothstep(k.rest, k.rest + 5, T) : 0;
      const ud = L * 0.55 + 12 + after * (L * 0.4 + 6);
      // swing round to her keel side as she heels, so her hull, not her sails, is what looms over you
      const up = _cineV.set(0, 1, 0).applyQuaternion(p.root.quaternion);
      const lean = Math.hypot(up.x, up.z);
      let ua = az + Math.sin(T * 0.11) * 0.05;
      if (lean > 0.05) {
        const keel = Math.atan2(-up.x, -up.z);
        ua += Math.atan2(Math.sin(keel - ua), Math.cos(keel - ua)) * smoothstep(0.1, 0.5, lean) * 0.8;
      }
      // low enough to look up past her keel into Snell's window
      const uy = lerp(clamp(sy - 9, bed + 2, -4), bed + L * 0.2 + 5, after);
      const tx = c.x + Math.sin(ua) * ud;
      const tz = c.z + Math.cos(ua) * ud;
      const ty = Math.min(Math.max(uy, this.terrain.heightAt(tx, tz) + 1.6), w.waterHeight(tx, tz) - 2.5);
      const u = this.underCam;
      if (sink <= 0 || !k.camSet) {
        u.set(tx, ty, tz);
        k.camSet = true;
      }
      else u.lerp(_cineV.set(tx, ty, tz), 1 - Math.exp(-realDt * 2.4));
      cp.lerp(u, sink);
      this.cineLook.lerp(_cineV.set(c.x, sy + lerp(5, 0.5, after), c.z), sink);
      fov = lerp(fov, 48, sink);
    }
    this.rig.cine = { pos: cp, look: this.cineLook, fov, w: smoothstep(0, 2.6, T) };
  }

  /** Air streaming out of her as she goes down, and splinters drifting after her. */
  private wreckBubbles(p: Ship, dt: number, sinceRest: number) {
    const w = this.world;
    const L = p.cls.length;
    const rate = sinceRest < 0 ? 46 : 30 * Math.exp(-sinceRest * 0.25);
    this.bubbleT += dt * rate;
    const hx = Math.sin(p.heading);
    const hz = Math.cos(p.heading);
    const top = w.waterHeight(p.pos.x, p.pos.z);
    while (this.bubbleT > 1) {
      this.bubbleT -= 1;
      const a = (Math.random() - 0.5) * L * 0.85;
      const x = p.pos.x + hx * a + (Math.random() - 0.5) * p.cls.beam;
      const z = p.pos.z + hz * a + (Math.random() - 0.5) * p.cls.beam;
      const y = p.root.position.y + Math.random() * 2.5;
      if (y > top - 0.5) continue;
      const big = Math.random() < 0.12;
      const vy = 1 + Math.random() * 1.6;
      w.particles.emit({
        x, y, z, vx: (Math.random() - 0.5) * 0.5, vy, vz: (Math.random() - 0.5) * 0.5,
        life: Math.min(7, (top - y) / (vy + 1.2) + 0.4), size: big ? 0.5 + Math.random() * 0.5 : 0.1 + Math.random() * 0.25,
        color: [1.5, 1.75, 1.85], alpha: 0.75, grav: -1.4, drag: 0.35, kind: 4, fadeIn: 0.08,
      });
      if (sinceRest < 0 && Math.random() < 0.12) {
        // a splinter of her timbers, tumbling slowly down after her
        w.particles.emit({
          x, y: y + 1.5, z, vx: (Math.random() - 0.5) * 0.4, vy: 0.4, vz: (Math.random() - 0.5) * 0.4,
          life: 5 + Math.random() * 3, size: 0.18 + Math.random() * 0.25, color: [0.32, 0.22, 0.14], alpha: 1, grav: 0.35, drag: 1.4, spin: (Math.random() - 0.5) * 3, kind: 3, fadeIn: 0.2,
        });
      }
    }
  }

  /** She settles onto the sand: a slow billow of it, a muffled thud through the hull. */
  private wreckLanding(p: Ship, bed: number) {
    const w = this.world;
    const L = p.cls.length;
    const hx = Math.sin(p.heading);
    const hz = Math.cos(p.heading);
    for (let i = 0; i < 16; i++) {
      const a = (Math.random() - 0.5) * L;
      const side = (Math.random() - 0.5) * p.cls.beam * 1.6;
      const x = p.pos.x + hx * a + hz * side;
      const z = p.pos.z + hz * a - hx * side;
      const out = 0.6 + Math.random() * 1.2;
      w.particles.emit({
        x, y: bed + 0.6, z, vx: hz * side * 0.2 * out, vy: 0.25 + Math.random() * 0.4, vz: -hx * side * 0.2 * out,
        life: 6 + Math.random() * 4, size: 2.5, sizeEnd: 9 + Math.random() * 6, color: [0.62, 0.58, 0.46], colorEnd: [0.5, 0.52, 0.46],
        alpha: 0.42, drag: 0.9, grav: -0.03, spin: (Math.random() - 0.5) * 0.4, kind: 1, fadeIn: 0.6,
      });
    }
    this.audio.thud(0.9, 0, 0);
    this.rig.shake(0.25);
  }

  /** Beneath the waves: the sea from below, the water's own glow and gloom in place of the air. */
  private setUnder(on: boolean) {
    this.ocean.setUnder(on);
    const u = globalUniforms.uUnder.value;
    u.x = on ? 1 : 0;
    if (on) {
      // the water glows with the light of the day above it, and the further she is from the light, the less you see
      const l = globalUniforms.uLight.value;
      const k = this.wreck;
      const deep = k.rest >= 0 ? smoothstep(k.rest + 2, k.rest + 16, k.t) : 0;
      globalUniforms.uUnderColor.value.set(0.03 * l.x, 0.19 * l.y, 0.23 * l.z).multiplyScalar(1 - deep * 0.35);
      u.z = lerp(60, 34, deep) * (1 - this.atmos.storm * 0.35);
      const uc = globalUniforms.uUnderColor.value;
      this.pipeline.clearColor.setRGB(uc.x, uc.y, uc.z, THREE.LinearSRGBColorSpace);
    } else {
      this.pipeline.clearColor.set(0x0b2a3a);
    }
  }

  /** Back to the surface: sail the same ship again, or pick another in the harbour. */
  private leaveWreck(again: boolean) {
    if (this.wreck.t < 0 || this.swBusy) return;
    const cls = this.player?.cls.id ?? this.ui.selected;
    this.veil.innerHTML = '<span>Back to the surface…</span>';
    void this.fade(() => {
      this.wreck.t = -1;
      this.timeScale = 1;
      this.rig.cine = null;
      this.pipeline.depth = 0;
      this.pipeline.desat = 0;
      this.audio.submerge(false);
      this.isUnder = false;
      this.setUnder(false);
      this.ui.showDead(false);
      this.ui.endWreck();
      this.resetWorld();
      this.enterMenu();
      if (again && this.preview) {
        if (this.preview.cls.id !== cls) this.setPreview(cls);
        this.startVoyage();
      }
    });
  }

  // ------------------------------------------------------------------ player

  private tryFire(side: Side) {
    const p = this.player!;
    // a special the magazine has run out of: load round shot rather than leave the guns cold
    if (this.ammoStock[p.ammo] <= 0) this.selectAmmo('round', true);
    const a = this.gunnery.aim(p, side);
    const shot = p.ammo;
    if (p.fire(side, this.world, a.target, a.point)) {
      const sd = side === 'port' ? 1 : -1;
      this.log.shots += p.model.muzzles.filter((m) => m.side === sd).length;
      if (shot !== 'round') {
        this.ammoStock[shot] = Math.max(0, this.ammoStock[shot] - 1);
        if (this.ammoStock[shot] <= 0) {
          this.ui.toast(`Last of the ${AMMO[shot].name.toLowerCase()}`, 'Round shot loaded', 2.6);
          this.selectAmmo('round', true);
        }
      }
    } else this.ui.flashBroadside(side);
  }

  /** Load a kind of shot for the next broadsides. Specials need some aboard. */
  private selectAmmo(id: AmmoId, quiet = false) {
    const p = this.player;
    if (!p || !p.alive || (this.state !== 'playing' && this.state !== 'paused')) return;
    if (this.ammoStock[id] <= 0) {
      this.ui.ammoDenied(id);
      if (!quiet) this.ui.toast(`No ${AMMO[id].name.toLowerCase()} left`, 'Salvage, chests and new isles restock the magazine', 2.8);
      return;
    }
    if (p.ammo === id) {
      if (!quiet) this.ui.showTag(id);
      return;
    }
    p.ammo = id;
    if (!quiet) {
      this.audio.ammoSwap(AMMO_ORDER.indexOf(id));
      this.ui.showTag(id);
    }
  }

  /** R: the next kind of shot that's aboard. */
  private cycleAmmo() {
    const p = this.player;
    if (!p) return;
    const i = AMMO_ORDER.indexOf(p.ammo);
    for (let k = 1; k <= AMMO_ORDER.length; k++) {
      const id = AMMO_ORDER[(i + k) % AMMO_ORDER.length];
      if (this.ammoStock[id] > 0) return this.selectAmmo(id);
    }
  }

  /** Shot found in salvage or given by islanders. */
  private stockAmmo(add: Partial<AmmoStock>, at: THREE.Vector3 | null) {
    let line = '';
    for (const id of SPECIALS) {
      const n = add[id] ?? 0;
      if (n <= 0) continue;
      const before = this.ammoStock[id];
      this.ammoStock[id] = Math.min(AMMO[id].max, before + n);
      const got = this.ammoStock[id] - before;
      if (got <= 0) continue;
      this.ui.ammoGain(id, got);
      line += `${line ? ' · ' : ''}+${got} ${AMMO[id].short}`;
    }
    if (line && at) {
      const [x, y, ok] = this.screenOf(at);
      if (ok) this.ui.floater(line, x, y - 22, 'ammo');
    }
    return line;
  }

  /** One-button fire: the loaded side with a foe in its arc, else the side facing the nearest foe. */
  private fireAuto() {
    const p = this.player!;
    const side = this.gunnery.autoSide(p) ?? (p.canFire('port') || !p.canFire('starboard') ? 'port' : 'starboard');
    this.tryFire(side);
  }

  /** A side's guns are run out again mid-fight: a knock from the gun deck and a glint on its button. */
  private onGunsReady(side: Side) {
    const p = this.player;
    if (!p) return;
    const a = p.heading + (side === 'port' ? 1 : -1) * (Math.PI / 2);
    this.audio.gunsReady(Math.sin(a) * 0.6);
    this.ui.gunsReady(side);
  }

  /** The first fight of a voyage on this device: explain the guns once. */
  private gunTip() {
    if (this.gunTipShown || !this.gunnery.combat) return;
    this.gunTipShown = true;
    try {
      if (localStorage.getItem('aquati.gunTip') === '1') return;
      localStorage.setItem('aquati.gunTip', '1');
    } catch {
      /* private mode: show it anyway */
    }
    const how = this.input.isTouch ? 'then tap Fire' : 'then click, or press Q / E';
    this.ui.toast('Guns fire to the sides', `Turn until a foe is off your beam and warm light gathers around her, ${how}`, 5.5);
    // and a little later, the shot rack
    const pick = this.input.isTouch ? 'Tap the shot button above Fire' : 'Press 1 to 5, or click the rack';
    setTimeout(() => {
      if (this.state === 'playing') this.ui.toast('Choose your shot', `${pick}: shells burst, fire burns, chain shreds sails, grape cuts down crews`, 6);
    }, 7000);
  }

  private controlPlayer() {
    const p = this.player;
    const st = this.input.state;
    if (!p || !p.alive) return;
    if (st.view) this.setView(!this.fpv);
    if (this.fpv) {
      if (st.helm) this.captain.toggleHelm();
      this.input.helmMode = this.captain.atHelm;
      this.captain.spyWanted = st.spy;
    }
    if (st.sailDelta) p.sailTarget = clamp(Math.round(p.sailTarget * 3 + st.sailDelta) / 3, 0, 1);
    if (st.steerHeading !== null && !this.fpv) {
      p.rudder = clamp(angleDelta(p.heading, st.steerHeading) * 2.4, -1, 1);
      p.sailTarget = st.steerThrottle < 0.2 ? p.sailTarget : Math.ceil(st.steerThrottle * 3 - 0.05) / 3;
    } else p.rudder = st.rudder;
    if (st.ammoPick >= 0) this.selectAmmo(AMMO_ORDER[st.ammoPick]);
    if (st.ammoNext) this.cycleAmmo();
    if (st.firePort) this.tryFire('port');
    if (st.fireStarboard) this.tryFire('starboard');
    if (st.fireAuto) {
      // from the deck you fire the beam you're facing
      const ls = this.fpv ? this.captain.lookSide() : 0;
      if (ls) this.tryFire(ls > 0 ? 'port' : 'starboard');
      else this.fireAuto();
    }
    if (st.fireAim) {
      // a click fires the side you point into, at what you point at
      const hs = this.gunnery.hoverSide();
      if (hs) this.tryFire(hs);
      else this.fireAuto();
    }
    if (st.zoom && !this.fpv) this.rig.zoom = clamp(this.rig.zoom + st.zoom * 0.06, 0, 1);
    if (st.pause) {
      if (this.chartOpen) this.setChart(false);
      else this.setPaused(true);
    } else if (st.map) this.setChart(!this.chartOpen);
    else if (st.photo) this.openPhoto();
  }

  // ------------------------------------------------------------------ frame

  private frame() {
    const now = performance.now();
    let dt = (now - this.last) / 1000;
    this.last = now;
    const P = this.prof;
    P.tick(now);
    this.fps = P.fps;
    dt = Math.min(dt, 0.05);
    if (this.scaler.sample(dt)) this.resize();
    // Auto's last resort: still slow at the lowest resolution, so shed effects
    if (this.scaler.pressure >= 2) {
      this.scaler.pressure = 0;
      this.settings.stepDown();
    }
    P.begin('Sinking & wrecks', 'sim');
    this.updateWreck(dt);
    P.end();
    const simDt = this.state === 'paused' || this.state === 'loading' ? 0 : dt * this.timeScale;
    this.update(simDt, dt);
    this.render(simDt);
    this.input.consume();
    P.frameEnd();
  }

  private update(dt: number, realDt: number) {
    const w = this.world;
    const P = this.prof;
    w.time += dt;
    globalUniforms.uTime.value = w.time;
    P.begin('Weather & sea state', 'sim');
    this.updateWeather(dt);
    P.end();

    P.begin('Input & helm', 'sim');
    this.input.poll();
    if (this.state === 'playing') {
      this.controlPlayer();
      this.voyageTime += dt;
      const pl = this.player;
      if (pl) this.log.metres += Math.abs(pl.speed) * dt;
    } else if (this.state === 'paused' && !this.photo.active) {
      if (this.input.state.pause) this.setPaused(false);
      else if (this.input.state.photo) this.openPhoto();
    }

    // the shipwright's ship stays tied up at the quay
    const inPort = this.state === 'port' && this.preview;
    if (inPort) this.port.pin(this.preview!);
    P.end();

    // AI & ships
    P.begin('Pirate AI', 'ships');
    for (const ai of this.ais.values()) ai.update(dt, w, this.player && this.player.alive ? this.player : null, this.ships);
    P.end();
    P.begin('Ship physics & rigging', 'ships');
    if (dt > 0) for (const s of this.ships) s.update(dt, w);
    P.end();
    P.begin('Collisions', 'ships');
    this.collisions.resolve(this.ships, w);
    for (const s of this.ships.slice()) if (s.removed && s !== this.player) this.removeShip(s);
    P.end();
    P.begin('Cannonballs', 'ships');
    this.projectiles.update(dt, w, this.ships);
    P.end();
    P.begin('Debris & flotsam', 'fx');
    this.pushers.length = 0;
    for (const s of this.ships) if (s.alive || s.sinkT < 20) this.pushers.push({ pos: s.pos, heading: s.heading, length: s.cls.length, beam: s.cls.beam, speed: s.speed });
    this.debris.update(dt, w, this.pushers);
    P.end();
    P.begin('Shipyard (prebuilds)', 'ships');
    if (dt > 0) this.runShipyard();
    P.end();
    if (inPort) {
      P.begin('Harbour', 'sim');
      this.port.update(dt, w);
      this.shipwright.tick(realDt);
      this.framePort(realDt);
      P.end();
    }

    // player-centric systems
    P.begin('Loot, spawns & discovery', 'sim');
    const p = this.player;
    if (p && this.state === 'playing') {
      if (p.alive && w.time - p.lastHit > 9) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.01 * dt);
      const got = this.loot.update(dt, w, p.alive ? p.pos : null, (p.cls.beam * 0.5 + 5) * 2);
      for (const it of got) {
        p.gold += it.value;
        this.vaultStore.earn(it.value);
        p.hp = Math.min(p.maxHp, p.hp + it.heal * p.maxHp);
        this.stockAmmo(ammoLoot(it.tier), new THREE.Vector3(it.x, 2, it.z));
        const [x, y] = this.screenOf(new THREE.Vector3(it.x, 2, it.z));
        if (it.tier === 0) {
          this.ui.floater(`+${it.value} gold`, x, y, 'loot');
          this.audio.coin();
          continue;
        }
        const R = RARITY[it.tier];
        this.log.chests++;
        this.log.best = Math.max(this.log.best, it.tier);
        if (it.tier >= 2) this.note('chest', `${R.name} chest`, `+${it.value} gold`);
        this.ui.floater(`${R.name} chest +${it.value}`, x, y, (['loot', 'loot', 'rare', 'epic', 'legendary'] as const)[it.tier]);
        w.particles.treasure(new THREE.Vector3(it.x, w.waterHeight(it.x, it.z), it.z), R.glow, it.tier);
        this.audio.treasure(it.tier);
        if (it.tier >= 3) {
          this.ui.toast(`${R.name} treasure`, `+${it.value} gold`, it.tier === 4 ? 3.6 : 2.8);
          this.rig.shake(it.tier === 4 ? 0.22 : 0.1);
        }
      }
      this.checkDiscoveries(p);
      this.directSpawns(dt);
      // rammed or holed on a reef: no cannonball to report it
      if (!p.alive) this.onPlayerSunk('hull');
      this.audio.setSailing(clamp(p.speed / 14, 0, 1));
    } else {
      this.loot.update(dt, w, null, 0);
    }

    P.end();

    // volcano plume
    this.smokeT += dt;
    if (this.smokeT > 0.32) {
      this.smokeT = 0;
      const v = this.terrain.islands[0];
      const top = this.terrain.heightAt(v.x, v.z);
      this.particles.emit({
        x: v.x + (Math.random() - 0.5) * 8, y: top + 4, z: v.z + (Math.random() - 0.5) * 8,
        vx: w.wind.dirX * 0.6, vy: 3 + Math.random() * 2, vz: w.wind.dirZ * 0.6,
        life: 16 + Math.random() * 6, size: 8, sizeEnd: 34, color: [1.05, 1.03, 1.0], colorEnd: [0.95, 0.95, 0.97], alpha: 0.3, drag: 0.08, kind: 1, spin: (Math.random() - 0.5) * 0.1, fadeIn: 2,
      });
    }

    // camera
    P.begin('Camera & captain', 'sim');
    const focusShip = p ?? this.preview;
    const fpos = focusShip ? focusShip.pos : this.spawnPoint;
    const fvel = focusShip && this.rig.mode === 'follow' ? focusShip.vel : new THREE.Vector3();
    if (this.preview) this.rig.orbitCenter.set(this.preview.pos.x, this.preview.root.position.y, this.preview.pos.z);
    this.updateCaptain(dt);
    if (this.photo.active) {
      const ph = this.photo;
      ph.cam.ground = (x, z) => Math.max(this.terrain.heightAt(x, z) + 1.4, w.waterHeight(x, z) + 0.9);
      ph.update(realDt, this.rig.camera);
      // shadows, the sea and the crews gather round what the lens looks at
      const fp = ph.cam.focusPoint;
      this.rig.target.set(fp.x, 0, fp.z);
      this.rig.photoDist = Math.min(ph.cam.shownDist, 320);
      // auto-focus settles on whatever sits mid-frame
      const af = this.pickDepth(0, 0) ?? ph.cam.shownDist;
      ph.autoFocus += (af - ph.autoFocus) * Math.min(1, realDt * 8);
      // the captain stands at the helm in the shot, even seen from their own eyes
      if (this.captain.ship) this.captain.pilot.hidden = false;
    } else this.rig.update(realDt, fpos, fvel, w.time, this.state === 'playing' || this.state === 'paused' ? this.battleFoe() : null);
    const eb = this.rig.eyeBlend;
    if (eb > 0) {
      // hear the sea from where you stand, panned to where you face
      w.listener.lerpVectors(this.rig.target, this.rig.camera.position, eb);
      const e = this.rig.camera.matrixWorld.elements;
      const rl = Math.hypot(e[0], e[2]) || 1;
      w.listenerRight.set(1 + (e[0] / rl - 1) * eb, (e[2] / rl) * eb).normalize();
    } else {
      w.listener.copy(this.rig.target);
      w.listenerRight.set(1, 0);
    }
    w.listenerZoom = this.rig.distance;
    P.end();
    // the spyglass can pick out a crew at the far side of a battle
    P.begin('Crew', 'ships');
    this.crew.setView(this.rig.camera, this.toSun);
    this.crew.update(dt, w, this.ships, this.rig.target, this.rig.groundRadius() * 1.5 + eb * 260, this.rig.camera.position);
    P.end();

    // gusts roll across whatever the camera is looking at
    P.begin('Wind & gusts', 'fx');
    const reach = clamp(this.rig.distance * 0.9, 70, 260);
    const tgt = this.rig.target;
    this.windField.update(dt, tgt.x, tgt.z, reach);
    this.wisps.update(dt, tgt.x, tgt.z, reach, this.rig.camera, w.wind.dirX, w.wind.dirZ);
    const gustHere = this.windField.at(fpos.x, fpos.z);
    this.audio.setGust(gustHere);
    this.ui.setGust(gustHere);
    P.end();

    P.begin('Rain, lightning & sky FX', 'fx');
    this.updateSkyFx(dt);
    P.end();
    P.begin('Particles', 'fx');
    this.particles.update(dt);
    P.end();
    P.begin('Birds', 'fx');
    this.birds.update(dt, w, this.ships);
    P.end();
    this.pipeline.decayFlash(realDt);
    P.begin('Gunnery & aiming', 'ships');
    this.gunnery.setPointer(this.fpv ? null : this.input.state.pointer, this.rig.camera);
    // the lock-on glow fades out of a photo even though the world is frozen
    this.gunnery.update(this.photo.active ? realDt : dt, p, this.ships, w, this.state === 'playing');
    if (this.state === 'playing') this.gunTip();
    P.end();

    // HUD
    P.begin('HUD, minimap & chart', 'ui');
    if (p && (this.state === 'playing' || this.state === 'paused') && !this.photo.active) {
      this.ui.updateHud(p, this.discovered.size, this.terrain.islands.length);
      this.ui.updateGunnery(this.gunnery.sides, p.alive ? this.gunnery.autoSide(p) : null);
      this.ui.updateAmmo(p.ammo, this.ammoStock);
      this.ui.updateBars(this.ships, p, this.rig.camera, innerWidth, innerHeight);
      this.ui.drawMap(p, this.ships, this.loot.all(), this.terrain.islands, this.discovered);
    }
    if (p && this.chartOpen) {
      this.ui.drawChart({
        player: p, ships: this.ships, loot: this.loot.all(), islands: this.terrain.islands, discovered: this.discovered,
        windX: w.wind.dirX, windZ: w.wind.dirZ, time: performance.now() / 1000,
      });
    }
    this.ui.tickFloaters(realDt);
    P.end();
  }

  /** Walks the captain, aims their eyes, and keeps the deck chrome in step. */
  private updateCaptain(dt: number) {
    const cap = this.captain;
    const p = this.player;
    if (this.fpv && p && cap.ship === p) {
      const st = this.input.state;
      cap.update(dt, { x: st.walkX, y: st.walkY, run: st.run, lookX: st.lookX, lookY: st.lookY });
      const near = cap.atHelm ? 'leave' : cap.canTakeHelm ? 'take' : 'none';
      this.ui.setHelmPrompt(near);
      const side = cap.lookSide();
      this.ui.setLook(this.input.mouseLocked || this.input.isTouch, side, side !== 0 && p.canFire(side > 0 ? 'port' : 'starboard'));
      this.ui.setSpy(cap.spy);
    }
    cap.pilot.hidden = cap.ship === p && this.rig.eyeBlend > 0.5;
    if (cap.ship && this.rig.eyeBlend > 0 && !cap.ship.removed) {
      cap.eye(this.rig.eyePos, this.rig.eyeQuat, this.world.time);
      // a broad, natural field of view, narrowing to a sliver through the glass
      const a = this.rig.camera.aspect;
      const base = clamp((2 * Math.atan(Math.tan((42 * Math.PI) / 180) / a) * 180) / Math.PI, 55, 84);
      this.rig.eyeFov = base / (1 + cap.spy * 4.5);
    }
  }

  // ------------------------------------------------------------------ sky & weather

  /** Day cycle, weather and sea state: everything the world simulation reads. */
  private updateWeather(dt: number) {
    const a = this.atmos;
    a.update(dt);
    const w = this.world;
    if (!w) return;
    // the weather sets the breeze: ships, plants, gusts and cloud drift all follow
    w.wind.strength = a.wind;
    globalUniforms.uWind.value.z = a.wind;
    this.windField.intensity = 0.55 + a.wind * 0.6;
    this.cloudOff.x += dt * w.wind.dirX * (0.002 + a.wind * 0.002 + a.storm * 0.004);
    this.cloudOff.y += dt * w.wind.dirZ * (0.002 + a.wind * 0.002 + a.storm * 0.004);
    globalUniforms.uCloudOffset.value.copy(this.cloudOff);
    // bigger seas: CPU buoyancy and the GPU swell share the very same waves
    setSeaState(w.waves, this.baseWaves, a.sea);
    this.ocean.setWaves(w.waves);
    this.applyAtmosphere();
  }

  /** Pushes the atmosphere into lights, fog and the grade. */
  private applyAtmosphere() {
    const a = this.atmos;
    this.sun.color.setRGB(a.keyColor.x, a.keyColor.y, a.keyColor.z);
    this.sun.intensity = 1;
    const fog = this.opaque.fog as THREE.Fog;
    fog.color.setRGB(a.fogColor.x, a.fogColor.y, a.fogColor.z);
    fog.near = a.fogRange.x;
    fog.far = a.fogRange.y;
    this.pipeline.exposure = a.exposure;
  }

  /** Rain, lightning, thunder, spindrift and the clock badge. */
  private updateSkyFx(dt: number) {
    const a = this.atmos;
    const w = this.world;
    const tgt = this.rig.target;
    const cam = this.rig.camera;
    this.rain.update(a.rain, tgt.x, tgt.z, this.rig.distance, w.wind.dirX, w.wind.dirZ, a.wind);
    const strike = this.lightning.update(dt, a.storm, tgt.x, tgt.z, cam);
    if (strike) {
      const p = new THREE.Vector3(strike.x, 0, strike.z);
      const [vol, pan, dist] = w.soundAt(p);
      this.audio.thunder(Math.min(1, (strike.bolt ? 0.95 : 0.55) * strike.power * Math.max(vol, 0.35)), pan * 0.6, dist);
      if (strike.bolt) {
        // the strike point boils with light and steam
        p.y = w.waterHeight(p.x, p.z) + 1;
        w.particles.emit({ x: p.x, y: p.y + 2, z: p.z, life: 0.5, size: 40, sizeEnd: 70, color: [6, 7, 10], colorEnd: [0.5, 0.6, 1], fadeIn: 0.001 }, true);
        for (let i = 0; i < 6; i++) {
          w.particles.emit({
            x: p.x + (Math.random() - 0.5) * 8, y: p.y, z: p.z + (Math.random() - 0.5) * 8, vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 3, vz: (Math.random() - 0.5) * 3,
            life: 3 + Math.random() * 2, size: 6, sizeEnd: 22, color: [0.9, 0.92, 0.95], alpha: 0.35, drag: 0.6, kind: 1, fadeIn: 0.2,
          });
        }
      }
    }
    const flash = this.lightning.flash;
    globalUniforms.uFlash.value = flash;
    this.pipeline.lightning = Math.min(flash, 1.5) * 0.55;
    this.opaque.environmentIntensity = SKY_LIGHT * (1 + flash * 5);

    // spindrift: gusts tear spray off the crests in a blow
    if (a.storm > 0.35 && dt > 0) {
      this.sprayT += dt * a.storm * 14;
      const reach = this.rig.distance * 0.7;
      while (this.sprayT > 1) {
        this.sprayT -= 1;
        const x = tgt.x + (Math.random() - 0.5) * reach * 2;
        const z = tgt.z + (Math.random() - 0.5) * reach * 1.4;
        if (this.terrain.heightAt(x, z) > -2) continue;
        const sp = 7 + a.wind * 6;
        w.particles.emit({
          x, y: w.waterHeight(x, z) + 0.4, z,
          vx: w.wind.dirX * sp, vy: 1 + Math.random() * 1.5, vz: w.wind.dirZ * sp,
          life: 1.4 + Math.random() * 1.2, size: 1.2, sizeEnd: 5 + Math.random() * 3, color: [1.2, 1.26, 1.3], alpha: 0.32, drag: 0.9, grav: 1.2, kind: 1, fadeIn: 0.15,
        });
      }
    }

    this.audio.setWeather(a.rain, a.storm, a.wind);
    this.birds.mesh.visible = a.night < 0.75 && a.storm < 0.6;
    const k = a.kind;
    const dark = a.sunDir.y < -0.03;
    const icon = k === 'storm' ? 'storm' : k === 'rain' ? 'rain' : k === 'mist' ? 'mist' : k === 'cloudy' ? 'cloud'
      : k === 'fair' ? (dark ? 'partly-moon' : 'partly-sun') : dark ? 'moon' : 'sun';
    this.ui.setSky(a.hour, icon, WEATHER[k].name);
  }

  private checkDiscoveries(p: Ship) {
    for (const isl of this.terrain.islands) {
      if (this.discovered.has(isl.name)) continue;
      if (Math.hypot(isl.x - p.pos.x, isl.z - p.pos.z) < isl.r + 70) {
        this.discovered.add(isl.name);
        const reward = 40 + Math.round(isl.r * 0.4);
        this.note('isle', `Charted ${isl.name}`, `+${reward} gold`);
        p.gold += reward;
        this.vaultStore.earn(reward);
        // the islanders top up the magazine
        const shot = this.stockAmmo({ shell: 1, fire: 1, chain: 1, grape: 1 }, null);
        this.ui.toast(`Island discovered · +${reward} gold${shot ? ' · fresh shot' : ''}`, isl.name, 3.6);
        this.audio.chime();
      }
    }
  }

  private directSpawns(dt: number) {
    const p = this.player!;
    // pirates left far astern while cruising are recycled so the seas around you stay busy
    for (const s of this.ships.slice()) {
      if (s.team !== 'pirate' || !s.alive) continue;
      const ai = this.ais.get(s);
      if (ai && ai.mode === 'patrol' && Math.hypot(s.pos.x - p.pos.x, s.pos.z - p.pos.z) > 820) this.removeShip(s);
    }
    const alivePirates = this.ships.filter((s) => s.team === 'pirate' && s.alive).length;
    const want = Math.min(4, 2 + Math.floor(p.kills / 4));
    this.spawnTimer -= dt;
    if (alivePirates < want && this.spawnTimer <= 0) {
      const room = want - alivePirates;
      if (room >= 2 && this.voyageTime > 60 && Math.random() < 0.25) this.spawnFlotilla(p.pos, 360, 520, Math.min(room, 3));
      else this.spawnPirate(p.pos, 280, 480);
      this.spawnTimer = 12 + Math.random() * 8;
    }
  }

  /**
   * The sun's shadow camera, built by hand in place of three's: it looks
   * straight down over the snapped centre, and the sun's slant is a shear, so
   * a point h metres up lands k*h along the ground from its foot, exactly where
   * its shadow falls. Depth is height, which only grows toward the sun along
   * every ray, so the shadow test still holds.
   */
  private fitShadow() {
    const sh = this.sun.shadow;
    const cam = sh.camera;
    cam.position.set(this.shadowC.x, SHADOW_TOP, this.shadowC.y);
    cam.rotation.set(-Math.PI / 2, 0, 0); // looking down, x east, y north
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    // view space: x = east, y = -z, z = height - SHADOW_TOP
    const kx = this.shadowK.x;
    const kz = this.shadowK.y;
    _shear.set(1, 0, -kx, -kx * SHADOW_TOP, 0, 1, kz, kz * SHADOW_TOP, 0, 0, 1, 0, 0, 0, 0, 1);
    cam.projectionMatrix.multiply(_shear);
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    (sh as unknown as { _updateMatrix(c: THREE.Camera, m: THREE.Matrix4, f: THREE.Frustum): void })._updateMatrix(cam, sh.matrix, sh.getFrustum());
  }

  private render(dt: number) {
    if (!this.ocean) return;
    const P = this.prof;
    P.begin('Shadow & scene setup', 'render');
    const cam = this.rig.camera;
    const target = this.rig.target;
    // Fit the sun's shadow map around the view. It only stays steady while its
    // texel grid stays put in the world: any sub-texel slide re-rasterises every
    // shadow edge, and zoomed out (texels several times larger) that reads as
    // the whole island shimmering. So the map looks straight down with its grid
    // fixed to the ground, the centre snaps to whole texels and the size moves
    // in steps. The sun's angle is a shear of that projection (see fitShadow),
    // so shadows glide smoothly round with the day while the grid never moves.
    const want = this.rig.groundRadius();
    if (want > this.shadowR || want < this.shadowR - 36 || this.rig.mode === 'port') this.shadowR = Math.min(260, Math.ceil(want / 16) * 16);
    const R = this.shadowR;
    const sc = this.sun.shadow.camera;
    sc.left = -R;
    sc.right = R;
    sc.top = R;
    sc.bottom = -R;
    const texel = (2 * R) / this.sun.shadow.mapSize.x;
    // wide texels need a wider normal offset or slopes speckle with self-shadow
    this.sun.shadow.normalBias = Math.max(0.05, texel * 0.8);
    // low sun / moon: keep the shadow caster a little higher so shadows stay crisp, not smeared
    const kd = this.atmos.keyDir;
    const ky = Math.max(kd.y, 0.22);
    const kh = Math.hypot(kd.x, kd.z) || 1;
    const kk = Math.sqrt(1 - ky * ky) / kh;
    const sd = _a.set(kd.x * kk, ky, kd.z * kk);
    this.shadowK.set(sd.x / sd.y, sd.z / sd.y);
    this.toSun.copy(sd);
    this.shadowC.set(Math.round(target.x / texel) * texel, Math.round(target.z / texel) * texel);
    this.sun.target.position.set(this.shadowC.x, 0, this.shadowC.y);
    this.sun.position.copy(this.sun.target.position).addScaledVector(sd, 400);
    this.sun.target.updateMatrixWorld();
    updateSoftShadows(this.sun, this.softShadows, 1 / sd.y);
    P.end();
    // photo mode's sky sliders relight the frozen scene, a few times a second at most
    if (this.photoSky && performance.now() - this.photoSkyT > 120) {
      this.photoSky = false;
      this.photoSkyT = performance.now();
      this.envT = 0;
    }
    // the sky's light changes slowly: refresh the image-based lighting a few times a second
    this.envT -= dt > 0 ? dt : 0;
    if (this.envT <= 0) {
      this.envT = 0.35;
      P.begin('Sky lighting (IBL)', 'render', true);
      this.skyEnv.update();
      P.end(true);
    }

    P.begin('Vegetation culling', 'sim');
    this.veg?.update(cam, this.toSun);
    P.end();
    P.begin('Wake simulation', 'ocean', true);
    this.wake.update(this.renderer, target.x, target.z, dt);
    P.end(true);
    P.begin('Ocean & scene binding', 'ocean');
    this.ocean.follow(target.x, target.z);
    this.ocean.setSceneTextures(this.pipeline.rtOpaque.texture, this.pipeline.rtOpaque.depthTexture!, this.pipeline.width, this.pipeline.height, cam);
    this.particles.setScene(this.pipeline.rtOpaque.depthTexture!, this.pipeline.width, this.pipeline.height, cam);
    this.wisps.setScene(this.pipeline.rtOpaque.depthTexture!, this.pipeline.width, this.pipeline.height, cam);
    this.gunnery.setScene(this.pipeline.rtOpaque.depthTexture!, this.pipeline.width, this.pipeline.height, cam);
    const eb = this.rig.eyeBlend;
    const port = this.rig.mode === 'port';
    this.pipeline.tilt = port ? 0.25 : (this.rig.mode === 'orbit' ? 0.55 : 0.35) * (1 - eb);
    // the horizon only exists from the deck (and in the shipwright's harbour)
    const cine = this.rig.cine ? this.rig.cine.w : 0;
    if (cine > 0) this.pipeline.tilt *= 1 - cine * 0.7;
    // only the farewell ever takes the camera below the waves
    const k = this.wreck;
    const under = k.t >= 0 && cam.position.y < this.world.waterHeight(cam.position.x, cam.position.z) - 0.2;
    if (under && k.under < 0) {
      k.under = k.t;
      this.audio.submerge(true);
    }
    if (under || this.isUnder) this.setUnder(under);
    this.isUnder = under;
    // no rain or wind wisps down here
    if (under) this.rain.mesh.visible = false;
    this.wisps.mesh.visible = !under;
    this.sky.visible = !under && (eb > 0.001 || port || cine > 0);
    this.sky.position.copy(cam.position);
    this.ocean.apron.visible = !under && (eb > 0.001 || port || cine > 0);
    const rr = this.pipeline.rtRefl;
    this.ocean.setReflectionTarget(rr.texture, rr.width, rr.height);
    this.pipeline.refl = this.ocean.reflecting ? this.ocean.reflScene : null;
    this.pipeline.sharpen = 0.12 + (1 - this.scaler.scale) * 0.4;
    if (this.photo.active) {
      // a free camera can look out to the horizon: the sky and the far sea come in,
      // the diorama blur gives way to the lens's own depth of field
      this.pipeline.tilt = 0;
      this.sky.visible = true;
      this.ocean.apron.visible = true;
      this.pipeline.photo = this.photo.look(0);
      this.pipeline.exposure = this.atmos.exposure * Math.pow(2, this.photo.exposure);
    }
    P.end();
    this.pipeline.render(this.opaque, this.water, cam, this.world.time);
    this.ocean.enableShadows(this.sun);
  }
}
