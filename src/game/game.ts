import * as THREE from 'three';
import { angleDelta, clamp } from '../core/noise';
import { Input } from '../core/input';
import { Audio } from '../core/audio';
import { detectQuality, QualityProfile, ResolutionScaler } from '../core/quality';
import { globalUniforms, SkyEnvironment } from '../render/environment';
import { Pipeline } from '../render/pipeline';
import { warmDraw } from '../render/warmup';
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
import { PirateAI } from '../ships/ai';
import { CrewSystem } from '../ships/crew';
import { ShipModel } from '../ships/shipModel';
import { Livery, PIRATE_LIVERIES, PLAYER_LIVERY, SHIP_CLASSES, ShipClassId } from '../ships/shipTypes';
import { UI } from '../ui/ui';
import { CameraRig } from './cameraRig';
import { Projectiles } from './projectiles';
import { Loot, RARITY } from './loot';
import { World } from './world';

type State = 'loading' | 'menu' | 'playing' | 'paused' | 'dead';

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
  private pushers: Pusher[] = [];
  private ships: Ship[] = [];
  /** Pirates being built a slice per frame before they sail over the horizon. */
  private shipyard: { id: ShipClassId; livery: Livery; model: ShipModel; near: THREE.Vector3; rMin: number; rMax: number }[] = [];
  private ais = new Map<Ship, PirateAI>();
  private player: Ship | null = null;
  private preview: Ship | null = null;
  private state: State = 'loading';
  private discovered = new Set<string>();
  private chartOpen = false;
  private voyageTime = 0;
  private spawnTimer = 0;
  private nameIdx = Math.floor(Math.random() * PIRATE_NAMES.length);
  private last = performance.now();
  private targetRing!: THREE.Mesh;
  private smokeT = 0;
  private raycaster = new THREE.Raycaster();
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

  constructor(canvas: HTMLCanvasElement) {
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
    this.opaque.add(this.projectiles.mesh, this.loot.group, this.debris.group);

    this.wireUI();
    // browsers only let sound start from a gesture (and on phones a touch only
    // counts once it lifts), so any tap or key in the harbour wakes the theme
    const wake = () => {
      if (this.state !== 'menu' && this.state !== 'loading') return;
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
    const veg = new Vegetation(this.terrain, q.vegetation);
    ui.progress(0.62);
    await nextFrame();
    this.opaque.add(this.terrain.buildMeshes(q.terrainLod, q.tier === 0));
    this.opaque.add(veg.build());
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
    this.buildTargetRing();
    ui.progress(0.88);
    await nextFrame();

    this.resize();
    this.enterMenu();
    // warm up before the first visible frame: compile every shader, upload every
    // ship texture, then draw the whole world once for real (see render/warmup)
    this.rig.update(0.016, this.spawnPoint, new THREE.Vector3(), 0);
    for (const id of Object.keys(SHIP_CLASSES) as ShipClassId[]) {
      for (const liv of [PLAYER_LIVERY, ...PIRATE_LIVERIES]) {
        for (const t of ShipModel.textures(SHIP_CLASSES[id], liv, this.quality.physicalHull ? 1 : 0)) this.renderer.initTexture(t);
      }
    }
    ui.progress(0.92);
    await this.renderer.compileAsync(this.opaque, this.rig.camera);
    await this.renderer.compileAsync(this.water, this.rig.camera);
    ui.progress(0.96);
    await nextFrame();
    this.rig.update(0.016, this.spawnPoint, new THREE.Vector3(), 0);
    // twice: the first pass makes the shadow map, which the water then switches on
    warmDraw([this.opaque, this.water], () => {
      this.render(0);
      this.render(0);
    });
    await fonts;
    ui.progress(1);
    await nextFrame();
    ui.hideLoading();
    this.last = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private buildTargetRing() {
    const g = new THREE.RingGeometry(0.95, 1, 72);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      premultipliedAlpha: true,
      uniforms: { uColor: { value: new THREE.Color(1, 0.8, 0.35) }, uTime: globalUniforms.uTime, uAlpha: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uTime; uniform float uAlpha; varying vec2 vP;
        void main(){
          float a = atan(vP.y, vP.x);
          float dash = smoothstep(0.2, 0.5, sin(a * 12.0 + uTime * 2.0) * 0.5 + 0.5);
          gl_FragColor = vec4(uColor * (0.5 + dash) * uAlpha, 0.0);
        }`,
    });
    this.targetRing = new THREE.Mesh(g, m);
    this.targetRing.visible = false;
    this.targetRing.renderOrder = 5;
    this.water.add(this.targetRing);
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

  private pirateLivery() {
    return PIRATE_LIVERIES[Math.floor(Math.random() * PIRATE_LIVERIES.length)];
  }

  private makeShip(id: ShipClassId, team: 'player' | 'pirate', livery = team === 'player' ? PLAYER_LIVERY : this.pirateLivery(), model?: ShipModel): Ship {
    const s = new Ship(SHIP_CLASSES[id], livery, team, this.quality.physicalHull ? 1 : 0, model);
    if (team === 'pirate') {
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
    s.model.sailMaterial.dispose();
    s.model.sailEmblemMaterial.dispose();
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

  private pirateClass(): ShipClassId {
    const roll = Math.random();
    const id: ShipClassId = roll < 0.48 ? 'sloop' : roll < 0.82 ? 'brig' : 'galleon';
    return (this.player?.kills ?? 0) < 2 && id === 'galleon' ? 'brig' : id;
  }

  /** Lays a pirate down in the shipyard: built a slice per frame, launched when done. */
  private orderPirate(near: THREE.Vector3, rMin: number, rMax: number) {
    const id = this.pirateClass();
    const livery = this.pirateLivery();
    const model = new ShipModel(SHIP_CLASSES[id], livery, this.quality.physicalHull ? 1 : 0, true);
    this.shipyard.push({ id, livery, model, near: near.clone(), rMin, rMax });
  }

  private runShipyard() {
    const job = this.shipyard[0];
    if (!job) return;
    const t0 = performance.now();
    let done = false;
    while (!done && performance.now() - t0 < 3) done = job.model.step();
    if (!done) return;
    this.shipyard.shift();
    this.spawnPirate(this.player?.pos ?? job.near, job.rMin, job.rMax, job.id, job.livery, job.model);
  }

  private spawnPirate(near: THREE.Vector3, rMin: number, rMax: number, id = this.pirateClass(), livery = this.pirateLivery(), model?: ShipModel) {
    const kills = this.player?.kills ?? 0;
    const s = this.makeShip(id, 'pirate', livery, model);
    const p = this.findOpenWater(near.x, near.z, rMin, rMax);
    s.place(p.x, p.z, Math.random() * Math.PI * 2);
    s.sailTarget = 0.5;
    s.sailLevel = 0.5;
    s.speed = s.cls.maxSpeed * 0.4;
    this.ais.set(s, new PirateAI(s, kills / 4));
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
    this.spawnTimer = 6;
    this.ui.toast('Weigh anchor', `The ${p.name} sets sail`, 3);
  }

  private resetWorld() {
    for (const s of this.ships.slice()) this.removeShip(s);
    this.shipyard.length = 0;
    this.projectiles.clear();
    this.loot.clear();
    this.debris.clear();
    this.crew.clear();
    this.player = null;
    this.preview = null;
  }

  private setPaused(on: boolean) {
    if (on && this.state === 'playing') {
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
      this.chartOpen = true;
      this.ui.showChart(true, this.player);
    } else if (!on && this.chartOpen) {
      this.chartOpen = false;
      this.ui.showChart(false);
    }
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
    // the replacement waits until the wreck has settled
    this.spawnTimer = Math.max(this.spawnTimer, 5);
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

  private bestTarget(side: 'port' | 'starboard' | null): { ship: Ship; side: 'port' | 'starboard'; inArc: boolean } | null {
    const p = this.player;
    if (!p) return null;
    const range = ((p.cls.muzzleSpeed * p.cls.muzzleSpeed) / 14) * 0.62;
    let best: { ship: Ship; side: 'port' | 'starboard'; inArc: boolean } | null = null;
    let bestScore = Infinity;
    for (const s of this.ships) {
      if (s === p || !s.alive) continue;
      const dx = s.pos.x - p.pos.x;
      const dz = s.pos.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > range * 1.15) continue;
      const rel = angleDelta(p.heading, Math.atan2(dx, dz));
      const sd: 'port' | 'starboard' = rel > 0 ? 'port' : 'starboard';
      if (side && sd !== side) continue;
      const off = Math.abs(Math.abs(rel) - Math.PI / 2);
      const inArc = off < 0.55 && d < range;
      const score = d + off * 120;
      if (score < bestScore) {
        bestScore = score;
        best = { ship: s, side: sd, inArc };
      }
    }
    return best;
  }

  private pointerSide(): 'port' | 'starboard' | null {
    const p = this.player;
    const ptr = this.input.state.pointer;
    if (!p || !ptr.active) return null;
    const ndc = new THREE.Vector2((ptr.x / innerWidth) * 2 - 1, -(ptr.y / innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.rig.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) return null;
    const rel = angleDelta(p.heading, Math.atan2(hit.x - p.pos.x, hit.z - p.pos.z));
    return rel > 0 ? 'port' : 'starboard';
  }

  private tryFire(side: 'port' | 'starboard') {
    const p = this.player!;
    const t = this.bestTarget(side);
    if (!p.fire(side, this.world, t && t.inArc ? t.ship : null)) this.ui.flashBroadside(side);
  }

  private controlPlayer() {
    const p = this.player;
    const st = this.input.state;
    if (!p || !p.alive) return;
    if (st.sailDelta) p.sailTarget = clamp(Math.round(p.sailTarget * 3 + st.sailDelta) / 3, 0, 1);
    if (st.steerHeading !== null) {
      p.rudder = clamp(angleDelta(p.heading, st.steerHeading) * 2.4, -1, 1);
      p.sailTarget = st.steerThrottle < 0.2 ? p.sailTarget : Math.ceil(st.steerThrottle * 3 - 0.05) / 3;
    } else p.rudder = st.rudder;
    if (st.firePort) this.tryFire('port');
    if (st.fireStarboard) this.tryFire('starboard');
    if (st.fireAuto) {
      const ps = this.input.isTouch ? null : this.pointerSide();
      if (ps) this.tryFire(ps);
      else {
        const t = this.bestTarget(null);
        if (t) this.tryFire(t.side);
        else this.tryFire(p.canFire('port') ? 'port' : 'starboard');
      }
    }
    if (st.zoom) this.rig.zoom = clamp(this.rig.zoom + st.zoom * 0.06, 0, 1);
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

    // AI & ships
    for (const ai of this.ais.values()) ai.update(dt, w, this.player && this.player.alive ? this.player : null, this.ships);
    if (dt > 0) for (const s of this.ships) s.update(dt, w);
    this.resolveShipCollisions();
    for (const s of this.ships.slice()) if (s.removed && s !== this.player) this.removeShip(s);
    this.projectiles.update(dt, w, this.ships);
    this.pushers.length = 0;
    for (const s of this.ships) if (s.alive || s.sinkT < 20) this.pushers.push({ pos: s.pos, heading: s.heading, length: s.cls.length, beam: s.cls.beam, speed: s.speed });
    this.debris.update(dt, w, this.pushers);
    if (dt > 0) this.runShipyard();

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
        vx: w.wind.dirX * 2.2, vy: 3 + Math.random() * 2, vz: w.wind.dirZ * 2.2,
        life: 16 + Math.random() * 6, size: 8, sizeEnd: 34, color: [1.05, 1.03, 1.0], colorEnd: [0.95, 0.95, 0.97], alpha: 0.3, drag: 0.08, kind: 1, spin: (Math.random() - 0.5) * 0.1, fadeIn: 2,
      });
    }

    // camera
    const focusShip = p ?? this.preview;
    const fpos = focusShip ? focusShip.pos : this.spawnPoint;
    const fvel = focusShip && this.rig.mode === 'follow' ? focusShip.vel : new THREE.Vector3();
    if (this.preview) this.rig.orbitCenter.set(this.preview.pos.x, this.preview.root.position.y, this.preview.pos.z);
    this.rig.update(realDt, fpos, fvel, w.time);
    w.listener.copy(this.rig.target);
    w.listenerZoom = this.rig.distance;
    this.crew.update(dt, w, this.ships, this.rig.target, this.rig.groundRadius() * 1.5);

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
    this.updateTargetRing();

    // HUD
    if (p && (this.state === 'playing' || this.state === 'paused')) {
      this.ui.updateHud(p, this.discovered.size, this.terrain.islands.length);
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

  private updateTargetRing() {
    const ring = this.targetRing;
    const p = this.player;
    const mat = ring.material as THREE.ShaderMaterial;
    if (!p || !p.alive || this.state !== 'playing') {
      ring.visible = false;
      return;
    }
    const t = this.bestTarget(null);
    if (!t) {
      mat.uniforms.uAlpha.value = Math.max(0, mat.uniforms.uAlpha.value - 0.05);
      ring.visible = mat.uniforms.uAlpha.value > 0.01;
      return;
    }
    ring.visible = true;
    const ready = p.canFire(t.side);
    mat.uniforms.uAlpha.value = Math.min(1, mat.uniforms.uAlpha.value + 0.08) * (t.inArc ? 1 : 0.55);
    (mat.uniforms.uColor.value as THREE.Color).setRGB(t.inArc && ready ? 2.2 : 1.2, t.inArc && ready ? 1.5 : 1.2, t.inArc && ready ? 0.5 : 1.2);
    ring.position.set(t.ship.pos.x, this.world.waterHeight(t.ship.pos.x, t.ship.pos.z) + 0.25, t.ship.pos.z);
    ring.scale.setScalar(t.ship.cls.length * 0.62);
  }

  private resolveShipCollisions() {
    const ships = this.ships;
    for (let i = 0; i < ships.length; i++) {
      for (let j = i + 1; j < ships.length; j++) {
        const a = ships[i];
        const b = ships[j];
        if (a.removed || b.removed) continue;
        // wrecks settle below the keels of passing ships
        if ((!a.alive && a.sinkT > 3) || (!b.alive && b.sinkT > 3)) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        const minD = (a.cls.beam + b.cls.beam) * 0.5 + Math.min(a.cls.length, b.cls.length) * 0.25;
        if (d < minD && d > 1e-3) {
          const push = (minD - d) * 0.5;
          const nx = dx / d;
          const nz = dz / d;
          const ma = a.cls.mass;
          const mb = b.cls.mass;
          a.pos.x -= nx * push * (mb / (ma + mb)) * 2;
          a.pos.z -= nz * push * (mb / (ma + mb)) * 2;
          b.pos.x += nx * push * (ma / (ma + mb)) * 2;
          b.pos.z += nz * push * (ma / (ma + mb)) * 2;
          a.speed *= 0.97;
          b.speed *= 0.97;
        }
      }
    }
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
    const alivePirates = this.ships.filter((s) => s.team === 'pirate' && s.alive).length + this.shipyard.length;
    const want = Math.min(6, 3 + Math.floor(p.kills / 3));
    this.spawnTimer -= dt;
    if (alivePirates < want && this.spawnTimer <= 0) {
      this.orderPirate(p.pos, 300, 460);
      this.spawnTimer = 9 + Math.random() * 6;
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
    this.pipeline.tilt = this.rig.mode === 'orbit' ? 0.55 : 0.35;
    this.pipeline.sharpen = 0.12 + (1 - this.scaler.scale) * 0.4;
    this.pipeline.render(this.opaque, this.water, cam, this.world.time);
    this.ocean.enableShadows(this.sun);
  }
}
