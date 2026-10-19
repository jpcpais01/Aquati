import * as THREE from 'three';
import { angleDelta, clamp } from '../core/noise';
import { Input } from '../core/input';
import { Audio } from '../core/audio';
import { detectQuality, QualityProfile, ResolutionScaler } from '../core/quality';
import { globalUniforms, SkyEnvironment } from '../render/environment';
import { Pipeline } from '../render/pipeline';
import { Particles } from '../fx/particles';
import { Birds } from '../fx/birds';
import { Debris, Pusher } from '../fx/debris';
import { WindField, WindWisps } from '../fx/wind';
import { Rain } from '../fx/rain';
import { Lightning } from '../fx/lightning';
import { Terrain } from '../world/terrain';
import { Vegetation } from '../world/vegetation';
import { Ocean } from '../world/ocean';
import { WakeField } from '../world/wakeField';
import { buildWaves, setSeaState, Wave } from '../world/waves';
import { Atmosphere, WEATHER } from '../world/atmosphere';
import { Ship } from '../ships/ship';
import { Pack, PirateAI } from '../ships/ai';
import { CrewSystem } from '../ships/crew';
import { PIRATE_LIVERIES, SHIP_CLASSES, ShipClassId } from '../ships/shipTypes';
import { hullKey, loadLook, lookToLivery, saveLook, ShipLook } from '../ships/look';
import { onPaintReady, preloadPaint } from '../ships/heraldry';
import { UI } from '../ui/ui';
import { Customizer, SwTab } from '../ui/customizer';
import { Port, PortFocus } from '../port/port';
import { findPortSite, portClearings } from '../port/site';
import { CameraRig } from './cameraRig';
import { Gunnery, Side } from './gunnery';
import { Captain } from './captain';
import { createSkyDome } from '../render/sky';
import { Projectiles } from './projectiles';
import { Loot, RARITY } from './loot';
import { World } from './world';
import { ShipCollisions } from './collisions';

type State = 'loading' | 'menu' | 'port' | 'playing' | 'paused' | 'dead';

const PIRATE_NAMES = [
  'Black Gull', 'Salt Widow', 'Crimson Tide', 'Grim Mariner', 'Sea Wraith', 'Rusty Anchor', 'Dread Marlin', 'Bone Siren',
  'Gilded Shark', 'Howling Jenny', 'Midnight Eel', 'Scarlet Kraken',
];

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
  private ais = new Map<Ship, PirateAI>();
  private lastFoe: Ship | null = null;
  private player: Ship | null = null;
  private preview: Ship | null = null;
  private state: State = 'loading';
  private discovered = new Set<string>();
  private chartOpen = false;
  private voyageTime = 0;
  private spawnTimer = 0;
  private nameIdx = Math.floor(Math.random() * PIRATE_NAMES.length);
  private last = performance.now();
  private gunnery!: Gunnery;
  private gunTipShown = false;
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
  // the shipwright's harbour
  private look: ShipLook = loadLook();
  private port!: Port;
  private shipwright = new Customizer();
  private veil = Object.assign(document.body.appendChild(document.createElement('div')), { id: 'sw-veil' });
  private swFocus: PortFocus = 'overview';
  private swAz = 0;
  private swZoom = 1;
  private swTime = 0;
  private swBusy = false;
  private saveTimer = 0;
  private captain = new Captain();
  private fpv = false;
  private sky = createSkyDome();

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: false, alpha: false });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // the final pass encodes sRGB itself
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = true;
    this.quality = detectQuality(this.renderer);
    this.pipeline = new Pipeline(this.renderer, { msaa: this.quality.msaa, bloomLevels: this.quality.bloomLevels, tiltShift: this.quality.tiltShift });
    this.rig = new CameraRig(innerWidth / innerHeight);
    this.input = new Input(canvas);
    this.ui.setTouch(this.input.isTouch);
    this.input.bindJoystick(document.getElementById('joy')!, document.getElementById('joy-knob')!);
    this.input.bindFireButtons(document.getElementById('t-port')!, document.getElementById('t-fire')!, document.getElementById('t-star')!);
    this.input.bindViewButtons(document.getElementById('btn-view')!, document.getElementById('btn-helm')!, document.getElementById('t-spy')!);
    this.captain.onStep = (k) => this.audio.footstep(k);
    this.input.onTouchDetected = () => this.ui.setTouch(true);

    // the key light: the sun by day, the moon by night (see world/atmosphere.ts)
    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(this.quality.shadowSize, this.quality.shadowSize);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.05;
    this.sun.shadow.radius = 2.5;
    const sc = this.sun.shadow.camera;
    sc.near = 1;
    sc.far = 900;
    this.opaque.add(this.sun, this.sun.target);
    this.opaque.fog = new THREE.Fog(new THREE.Color(), 380, 1500);
    this.skyEnv = new SkyEnvironment(this.renderer);
    this.applyAtmosphere();
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
    ui.progress(0.05);
    await nextFrame();
    this.terrain = new Terrain(20251019);
    ui.progress(0.3);
    await nextFrame();
    this.terrain.bakeAO(2);
    ui.progress(0.5);
    await nextFrame();
    const site = findPortSite(this.terrain, this.spawnPoint);
    const veg = new Vegetation(this.terrain, q.vegetation, portClearings(site));
    ui.progress(0.62);
    await nextFrame();
    this.opaque.add(this.terrain.buildMeshes(q.terrainLod, q.tier === 0));
    this.opaque.add(veg.build());
    this.port = new Port(site, (x, z) => this.terrain.heightAt(x, z));
    await preloadPaint(this.look.flag.paint);
    await this.port.build(this.look);
    this.opaque.add(this.port.root);
    this.birds = new Birds(this.terrain.islands, q.tier === 0 ? 18 : 36);
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
    this.world = new World(this.terrain, waves, this.particles, this.wake, this.audio, windAngle);
    this.world.debris = this.debris;
    this.world.onShot = (s) => this.projectiles.add(s);
    this.world.onShake = (a) => this.rig.shake(a);
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
    this.opaque.environmentIntensity = 0.8;
    this.ui.buildMap(this.terrain);
    this.ui.setWind(windAngle);
    this.gunnery = new Gunnery(this.ocean.material.uniforms);
    this.gunnery.onReady = (side) => this.onGunsReady(side);
    this.water.add(this.gunnery.group);
    ui.progress(0.88);
    await nextFrame();

    this.resize();
    this.enterMenu();
    // warm up every shader before the first visible frame
    this.rig.update(0.016, this.spawnPoint, new THREE.Vector3(), 0);
    this.renderer.compile(this.opaque, this.rig.camera);
    this.renderer.compile(this.water, this.rig.camera);
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
    ui.onResume = () => this.setPaused(false);
    ui.onPause = () => this.setPaused(true);
    ui.onMap = (on) => this.setChart(on);
    ui.onQuit = () => {
      this.ui.showPause(false);
      this.resetWorld();
      this.enterMenu();
    };
    ui.onAgain = () => {
      this.ui.showDead(false);
      this.resetWorld();
      this.enterMenu();
    };
    ui.onSound = (on) => this.audio.setMuted(!on);
  }

  // ------------------------------------------------------------------ shipwright

  private wireShipwright() {
    const sw = this.shipwright;
    // entry sits under Set Sail in the menu dock
    const btn = document.createElement('button');
    btn.className = 'btn menu-custom';
    btn.id = 'btn-shipwright';
    btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 21V4" /><path d="M5 4h12l-2.5 4L17 12H5" /></svg><span>Shipwright</span>';
    document.getElementById('btn-sail')!.after(btn);
    btn.addEventListener('click', () => {
      this.audio.start();
      this.audio.click();
      this.openShipwright();
    });
    sw.onClick = () => {
      this.audio.start();
      this.audio.click();
    };
    sw.onDone = () => this.closeShipwright();
    sw.onTab = (tab: SwTab) => {
      this.swFocus = ({ flag: 'flag', sails: 'sails', hull: 'hull', presets: 'overview' } as const)[tab];
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
    this.dpr = Math.min(devicePixelRatio || 1, this.quality.maxDpr) * this.scaler.scale;
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

  private makeShip(id: ShipClassId, team: 'player' | 'pirate'): Ship {
    const livery = team === 'player' ? lookToLivery(this.look) : PIRATE_LIVERIES[Math.floor(Math.random() * PIRATE_LIVERIES.length)];
    const s = new Ship(SHIP_CLASSES[id], livery, team, this.quality.physicalHull ? 1 : 0);
    if (team === 'player') s.name = this.look.name.trim() || s.cls.title;
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

  private launchPirate(id: ShipClassId, x: number, z: number, heading: number) {
    const kills = this.player?.kills ?? 0;
    const s = this.makeShip(id, 'pirate');
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
      this.spawnPirate(this.spawnPoint, 160, 260);
      this.spawnPirate(this.spawnPoint, 220, 340);
      this.spawnFlotilla(this.spawnPoint, 300, 420, 3);
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
    this.discovered.clear();
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
      this.ui.showPause(true, p ? { gold: p.gold, kills: p.kills, isles: this.discovered.size, time: this.voyageTime } : undefined);
    } else if (!on && this.state === 'paused') {
      this.state = 'playing';
      this.ui.showPause(false);
      this.last = performance.now();
    }
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
    if (attacker === this.player && ok) this.ui.floater(`${Math.round(dmg)}`, x, y);
    if (ship === this.player) {
      if (ok) this.ui.floater(`-${Math.round(dmg)}`, x, y, 'bad');
      this.rig.shake(0.28);
      this.pipeline.flash(0.06);
    }
    if (!ship.alive && ship !== this.player) this.onSunk(ship, attacker);
    if (!ship.alive && ship === this.player) this.onPlayerSunk();
  }

  private onSunk(ship: Ship, attacker: Ship) {
    const bounty = { sloop: 60, brig: 110, galleon: 220 }[ship.cls.id];
    const luck = { sloop: 0, brig: 0.3, galleon: 0.6 }[ship.cls.id];
    this.loot.drop(ship.pos.x, ship.pos.z, 3 + Math.floor(ship.cls.length / 8), luck, ship.cls.id === 'galleon');
    if (attacker === this.player) {
      this.player.gold += bounty;
      this.ui.toast(`+${bounty} gold bounty`, `${ship.name} sunk`, 3.2);
      this.audio.coin();
    }
  }

  private onPlayerSunk() {
    this.input.enabled = false;
    // rise out of the captain's eyes to watch her go down
    this.setView(false);
    setTimeout(() => {
      if (!this.player) return;
      this.setChart(false);
      this.state = 'dead';
      this.ui.showHud(false);
      this.ui.showDead(true, {
        gold: this.player.gold,
        kills: this.player.kills,
        isles: this.discovered.size,
        time: this.voyageTime,
        ship: this.player.name,
        cls: this.player.cls.id,
      });
    }, 3800);
  }

  // ------------------------------------------------------------------ player

  private tryFire(side: Side) {
    const p = this.player!;
    const a = this.gunnery.aim(p, side);
    if (p.fire(side, this.world, a.target, a.point)) this.gunnery.fired(side, this.world.time);
    else this.ui.flashBroadside(side);
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

  /** The first fight of a voyage on this device: explain the arcs once. */
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
    this.ui.toast('Guns fire to the sides', `Turn until a foe sits in a gold arc, ${how}`, 5.5);
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
  }

  // ------------------------------------------------------------------ frame

  private fpsEl = Object.assign(document.body.appendChild(document.createElement('div')), { id: 'fps' });
  private fpsFrames = 0;
  private fpsT = performance.now();

  private frame() {
    const now = performance.now();
    let dt = (now - this.last) / 1000;
    this.last = now;
    this.fpsFrames++;
    if (now - this.fpsT >= 500) {
      this.fpsEl.textContent = `${Math.round((this.fpsFrames * 1000) / (now - this.fpsT))} FPS`;
      this.fpsFrames = 0;
      this.fpsT = now;
    }
    dt = Math.min(dt, 0.05);
    if (this.scaler.sample(dt)) this.resize();
    const simDt = this.state === 'paused' || this.state === 'loading' ? 0 : dt;
    this.update(simDt, dt);
    this.render(simDt);
    this.input.consume();
  }

  private update(dt: number, realDt: number) {
    const w = this.world;
    w.time += dt;
    globalUniforms.uTime.value = w.time;
    this.updateWeather(dt);

    this.input.poll();
    if (this.state === 'playing') {
      this.controlPlayer();
      this.voyageTime += dt;
    } else if (this.state === 'paused') {
      if (this.input.state.pause) this.setPaused(false);
    }

    // the shipwright's ship stays tied up at the quay
    const inPort = this.state === 'port' && this.preview;
    if (inPort) this.port.pin(this.preview!);

    // AI & ships
    for (const ai of this.ais.values()) ai.update(dt, w, this.player && this.player.alive ? this.player : null, this.ships);
    if (dt > 0) for (const s of this.ships) s.update(dt, w);
    this.collisions.resolve(this.ships, w);
    for (const s of this.ships.slice()) if (s.removed && s !== this.player) this.removeShip(s);
    this.projectiles.update(dt, w, this.ships);
    this.pushers.length = 0;
    for (const s of this.ships) if (s.alive || s.sinkT < 20) this.pushers.push({ pos: s.pos, heading: s.heading, length: s.cls.length, beam: s.cls.beam, speed: s.speed });
    this.debris.update(dt, w, this.pushers);
    if (inPort) {
      this.port.update(dt, w);
      this.shipwright.tick(realDt);
      this.framePort(realDt);
    }

    // player-centric systems
    const p = this.player;
    if (p && this.state === 'playing') {
      if (p.alive && w.time - p.lastHit > 9) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.01 * dt);
      const got = this.loot.update(dt, w, p.alive ? p.pos : null, (p.cls.beam * 0.5 + 5) * 2);
      for (const it of got) {
        p.gold += it.value;
        p.hp = Math.min(p.maxHp, p.hp + it.heal * p.maxHp);
        const [x, y] = this.screenOf(new THREE.Vector3(it.x, 2, it.z));
        if (it.tier === 0) {
          this.ui.floater(`+${it.value} gold`, x, y, 'loot');
          this.audio.coin();
          continue;
        }
        const R = RARITY[it.tier];
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
      this.audio.setSailing(clamp(p.speed / 14, 0, 1));
    } else {
      this.loot.update(dt, w, null, 0);
    }

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
    const focusShip = p ?? this.preview;
    const fpos = focusShip ? focusShip.pos : this.spawnPoint;
    const fvel = focusShip && this.rig.mode === 'follow' ? focusShip.vel : new THREE.Vector3();
    if (this.preview) this.rig.orbitCenter.set(this.preview.pos.x, this.preview.root.position.y, this.preview.pos.z);
    this.updateCaptain(dt);
    this.rig.update(realDt, fpos, fvel, w.time, this.state === 'playing' || this.state === 'paused' ? this.battleFoe() : null);
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
    // the spyglass can pick out a crew at the far side of a battle
    this.crew.update(dt, w, this.ships, this.rig.target, this.rig.groundRadius() * 1.5 + eb * 260);

    // gusts roll across whatever the camera is looking at
    const reach = clamp(this.rig.distance * 0.9, 70, 260);
    const tgt = this.rig.target;
    this.windField.update(dt, tgt.x, tgt.z, reach);
    this.wisps.update(dt, tgt.x, tgt.z, reach, this.rig.camera, w.wind.dirX, w.wind.dirZ);
    const gustHere = this.windField.at(fpos.x, fpos.z);
    this.audio.setGust(gustHere);
    this.ui.setGust(gustHere);

    this.updateSkyFx(dt);
    this.particles.update(dt);
    this.birds.update(dt, w.time);
    this.pipeline.decayFlash(realDt);
    this.gunnery.setPointer(this.fpv ? null : this.input.state.pointer, this.rig.camera);
    this.gunnery.update(dt, p, this.ships, w, this.state === 'playing');
    if (this.state === 'playing') this.gunTip();

    // HUD
    if (p && (this.state === 'playing' || this.state === 'paused')) {
      this.ui.updateHud(p, this.discovered.size, this.terrain.islands.length);
      this.ui.updateGunnery(this.gunnery.sides, p.alive ? this.gunnery.autoSide(p) : null);
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
    this.opaque.environmentIntensity = 0.8 * (1 + flash * 5);

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
        p.gold += reward;
        this.ui.toast(`Island discovered · +${reward} gold`, isl.name, 3.6);
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
    const want = Math.min(11, 6 + Math.floor(p.kills / 2));
    this.spawnTimer -= dt;
    if (alivePirates < want && this.spawnTimer <= 0) {
      const room = want - alivePirates;
      if (room >= 3 && this.voyageTime > 40 && Math.random() < 0.4) this.spawnFlotilla(p.pos, 360, 520, Math.min(room, p.kills >= 6 ? 4 : 3));
      else this.spawnPirate(p.pos, 280, 480);
      this.spawnTimer = 5 + Math.random() * 5;
    }
  }

  private render(dt: number) {
    if (!this.ocean) return;
    const cam = this.rig.camera;
    const target = this.rig.target;
    // fit & snap the sun's shadow frustum around the view
    const R = this.rig.groundRadius();
    const sc = this.sun.shadow.camera;
    if (sc.right !== R) {
      sc.left = -R;
      sc.right = R;
      sc.top = R;
      sc.bottom = -R;
      sc.updateProjectionMatrix();
    }
    const texel = (2 * R) / this.sun.shadow.mapSize.x;
    const cx = Math.round(target.x / texel) * texel;
    const cz = Math.round(target.z / texel) * texel;
    this.sun.target.position.set(cx, 0, cz);
    // low sun / moon: keep the shadow caster a little higher so shadows stay crisp, not smeared
    const kd = this.atmos.keyDir;
    const ky = Math.max(kd.y, 0.22);
    const kh = Math.hypot(kd.x, kd.z) || 1;
    const kk = Math.sqrt(1 - ky * ky) / kh;
    this.sun.position.set(cx + kd.x * kk * 400, ky * 400, cz + kd.z * kk * 400);
    this.sun.target.updateMatrixWorld();
    // the sky's light changes slowly: refresh the image-based lighting a few times a second
    this.envT -= dt > 0 ? dt : 0;
    if (this.envT <= 0) {
      this.envT = 0.35;
      this.skyEnv.update();
    }

    this.wake.update(this.renderer, target.x, target.z, dt);
    this.ocean.follow(target.x, target.z);
    this.ocean.setSceneTextures(this.pipeline.rtOpaque.texture, this.pipeline.rtOpaque.depthTexture!, this.pipeline.width, this.pipeline.height, cam);
    this.particles.setScene(this.pipeline.rtOpaque.depthTexture!, this.pipeline.width, this.pipeline.height, cam);
    this.wisps.setScene(this.pipeline.rtOpaque.depthTexture!, this.pipeline.width, this.pipeline.height, cam);
    this.gunnery.setScene(this.pipeline.rtOpaque.depthTexture!, this.pipeline.width, this.pipeline.height, cam);
    const eb = this.rig.eyeBlend;
    const port = this.rig.mode === 'port';
    this.pipeline.tilt = port ? 0.25 : (this.rig.mode === 'orbit' ? 0.55 : 0.35) * (1 - eb);
    // the horizon only exists from the deck (and in the shipwright's harbour)
    this.sky.visible = eb > 0.001 || port;
    this.sky.position.copy(cam.position);
    this.ocean.apron.visible = eb > 0.001 || port;
    this.pipeline.sharpen = 0.12 + (1 - this.scaler.scale) * 0.4;
    this.pipeline.render(this.opaque, this.water, cam, this.world.time);
    this.ocean.enableShadows(this.sun);
  }
}
