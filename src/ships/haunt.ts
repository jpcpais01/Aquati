import * as THREE from 'three';
import { clamp } from '../core/noise';
import { patchInfo, patchMaterial } from '../render/environment';
import type { World } from '../game/world';
import type { Ship } from './ship';

// The Hollow Jack's power (an event ship's, ShipClass.ability 'phantom'): the
// Phantom Run. Called on, she crosses over into the spirit world: her
// materials take the ghost look (ghostGlsl, the same rot and see-through
// glow as the phantom pirates), her fires go out, no shot, ram or reef can
// touch her, her crew fade from her decks and she runs half as fast again
// whatever the wind. When the run's over she comes back with a Banshee's
// Wail: a ring of dread racing out over the water that hurts every ship it
// reaches, the nearest worst, and cuts down their gun crews. Then the power
// sleeps a while before it can be called on again.

/** Seconds the crossing takes, each way. */
export const CROSS = 0.7;
/** Seconds she's in the spirit world, the crossings included. */
export const SPAN = 7;
/** Seconds before she can call on it again, from her return. */
export const REST = 40;
/** How far the wail reaches (m), the seconds it takes to get there, and what it does to a ship at her side (falling to a little under half at the edge). */
export const WAIL_R = 75;
export const WAIL_T = 0.9;
export const WAIL_DMG = 110;
/** While she's a ghost: her speed (times her best, any wind) and her helm. */
export const SPEED = 1.5;
export const TURN = 1.3;

const GREEN: [number, number, number] = [0.9, 4.2, 2.2];
const GREEN_END: [number, number, number] = [0.05, 0.9, 0.42];
const MIST: [number, number, number] = [0.55, 0.95, 0.78];
const MIST_END: [number, number, number] = [0.7, 1, 0.86];
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const _p = new THREE.Vector3();

type State = 'ready' | 'phantom' | 'resting';

export class Haunt {
  state: State = 'ready';
  /** Seconds into the state. */
  t = 0;
  /** How far over she is (0 solid .. 1 a ghost). */
  phantom = 0;
  /** Her ghost materials, by the material each stands in for, made once and kept (see warm()). */
  private mats = new Map<THREE.Material, THREE.Material>();
  /** [mesh, its own material, whether it cast a shadow] for each she wears a ghost over. */
  private worn: [THREE.Mesh | THREE.LineSegments, THREE.Material, boolean][] = [];
  private ropeMat = new THREE.LineBasicMaterial({ color: 0x7fe0b4, transparent: true, opacity: 0.32 });
  /** The wail's ring (seconds since it went out; -1 none), and the ships it has reached. */
  private wailT = -1;
  private wailed = new Set<Ship>();
  private wispT = 0;

  constructor(readonly ship: Ship) {}

  /** How ready the power is (0 just spent .. 1 ready), for the button's ring. */
  ready01() {
    if (this.state === 'ready') return 1;
    if (this.state === 'phantom') return 0;
    return clamp(this.t / REST, 0, 1);
  }

  /** The share of her run left while she's over (1 .. 0). */
  left01() {
    return this.state === 'phantom' ? clamp(1 - this.t / SPAN, 0, 1) : 0;
  }

  canCall() {
    return this.state === 'ready' && this.ship.alive;
  }

  /** Calls on the Phantom Run. False if it's spent or she's done for. */
  call(world: World): boolean {
    if (!this.canCall()) return false;
    const s = this.ship;
    this.state = 'phantom';
    this.t = 0;
    // the spirit world puts out her fires and knits her canvas
    s.afire = 0;
    s.afireBy = null;
    s.torn = 0;
    s.phantom = true;
    this.wear();
    this.burst(world, 1);
    const [vol, pan, d] = world.soundAt(s.pos);
    world.audio.phantom(vol, pan, d);
    world.onShake(s.team === 'player' ? 0.3 : 0.1 * vol, s.pos);
    world.onStatus(s, 'phantom', s);
    return true;
  }

  update(dt: number, world: World) {
    if (dt <= 0) return;
    this.t += dt;
    const s = this.ship;
    if (this.state === 'phantom') {
      // over in CROSS seconds, back over the last CROSS
      const k = clamp(this.t / CROSS, 0, 1) * clamp((SPAN - this.t) / CROSS, 0, 1);
      this.phantom = k * k * (3 - 2 * k);
      // she wells up out of the mist as a ghost, and thins back into it before she's solid again
      const g = s.dmg.ghost;
      g.x = 0.3 + 0.7 * this.phantom;
      g.y = Math.max(0, 1 - this.t * 2.5) + Math.max(0, 1 - (SPAN - this.t) * 2.5);
      // untouchable till she's half back
      s.phantom = s.alive && this.t < SPAN - CROSS * 0.5;
      this.wisps(dt, world);
      if (this.t >= SPAN) {
        this.unwear();
        this.phantom = 0;
        g.x = 1;
        g.y = 0;
        this.state = 'resting';
        this.t = 0;
        s.phantom = false;
        if (s.alive) this.wailOut(world);
      }
    } else if (this.state === 'resting' && this.t >= REST) {
      this.state = 'ready';
      this.t = 0;
      if (s.team === 'player') world.audio.toll();
      world.onStatus(s, 'spirits', s);
    }
    if (this.wailT >= 0) this.wailStep(dt, world);
  }

  /** Back to ready and solid (a new voyage, or she went down). */
  reset() {
    this.unwear();
    this.state = 'ready';
    this.t = 0;
    this.phantom = 0;
    this.wailT = -1;
    this.ship.phantom = false;
    this.ship.dmg.ghost.x = 1;
    this.ship.dmg.ghost.y = 0;
  }

  // ------------------------------------------------------------------ her look

  /** Her ghost material for one of her own (a clone of it with the ghost look patched in, the same uniforms). */
  private ghostOf(own: THREE.Material): THREE.Material | null {
    const have = this.mats.get(own);
    if (have) return have;
    const info = patchInfo.get(own);
    if (!info || !(own as THREE.MeshStandardMaterial).isMeshStandardMaterial) return null;
    const m = (own as THREE.MeshStandardMaterial).clone();
    patchMaterial(m, { ...info.opts, ghost: true }, info.extra);
    this.mats.set(own, m);
    return m;
  }

  /**
   * Her ghost materials, each on a speck of a mesh: added under her root for
   * a frame or two while she waits in the harbour, so the first Phantom Run
   * at sea finds every shader built (see Game.setPreview).
   */
  warm(): THREE.Object3D {
    const g = new THREE.Group();
    const geo = new THREE.PlaneGeometry(1e-3, 1e-3);
    this.ship.model.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || Array.isArray(m.material) || m.userData.lodProxy) return;
      const gm = this.ghostOf(m.material);
      if (!gm || g.children.some((c) => (c as THREE.Mesh).material === gm)) return;
      const speck = new THREE.Mesh(geo, gm);
      speck.frustumCulled = false;
      g.add(speck);
    });
    return g;
  }

  private wear() {
    this.unwear();
    this.ship.model.root.traverse((o) => {
      const m = o as THREE.Mesh | THREE.LineSegments;
      if (Array.isArray(m.material) || m.userData.lodProxy) return;
      if ((m as THREE.LineSegments).isLineSegments) {
        this.worn.push([m, m.material, m.castShadow]);
        m.material = this.ropeMat;
        return;
      }
      if (!(m as THREE.Mesh).isMesh) return;
      const gm = this.ghostOf(m.material);
      if (!gm) return;
      this.worn.push([m, m.material, m.castShadow]);
      m.material = gm;
      m.castShadow = false;
    });
  }

  private unwear() {
    for (const [m, own, cast] of this.worn) {
      m.material = own;
      m.castShadow = cast;
    }
    this.worn = [];
  }

  // ------------------------------------------------------------------ effects

  /** A gust of ghost-fire and green mist bursting off her. */
  private burst(world: World, k: number) {
    const s = this.ship;
    const L = s.cls.length;
    const y = s.root.position.y + s.cls.freeboard + 1.5;
    const fx = world.particles;
    for (let i = 0; i < 34; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = rand(0.1, 0.55) * L;
      fx.emit({
        x: s.pos.x + Math.cos(a) * r * 0.45, y: y + rand(-1, 5), z: s.pos.z + Math.sin(a) * r,
        vx: Math.cos(a) * rand(2, 6) * k, vy: rand(1, 4) * k, vz: Math.sin(a) * rand(2, 6) * k,
        life: rand(0.6, 1.2), size: rand(0.25, 0.45), sizeEnd: rand(0.9, 1.5), color: GREEN, colorEnd: GREEN_END, grav: -1.2, drag: 1.6, spin: rand(-1.5, 1.5), kind: 0, fadeIn: 0.05,
      }, true);
    }
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      fx.emit({
        x: s.pos.x + Math.cos(a) * L * 0.2, y: y + rand(-1.5, 2), z: s.pos.z + Math.sin(a) * L * 0.35,
        vx: Math.cos(a) * 2.5 + s.vel.x * 0.5, vy: rand(0.2, 1.2), vz: Math.sin(a) * 2.5 + s.vel.z * 0.5,
        life: rand(3, 4.5), size: rand(2, 3), sizeEnd: rand(7, 10), color: MIST, colorEnd: MIST_END, alpha: 0.4, grav: -0.15, drag: 1, kind: 1, fadeIn: 0.12,
      });
    }
  }

  /** While she's a ghost: will-o'-wisps streaming off her pumpkins, lantern and spars, and a green mist trailing on the water. */
  private wisps(dt: number, world: World) {
    const s = this.ship;
    this.wispT += dt * (22 + 20 * this.phantom);
    const pts = s.model.hauntPoints;
    const xf = s.model.root.matrixWorld;
    const fx = world.particles;
    while (this.wispT > 1) {
      this.wispT -= 1;
      if (pts.length && Math.random() < 0.45) _p.copy(pts[(Math.random() * pts.length) | 0]).applyMatrix4(xf);
      else {
        const side = Math.random() < 0.5 ? 1 : -1;
        _p.set(side * s.cls.beam * rand(0, 0.5), rand(0.5, s.cls.freeboard + 9), rand(-0.45, 0.45) * s.cls.length).applyMatrix4(xf);
      }
      fx.emit({
        x: _p.x, y: _p.y, z: _p.z, vx: -s.vel.x * 0.35 + rand(-0.6, 0.6), vy: rand(0.6, 1.8), vz: -s.vel.z * 0.35 + rand(-0.6, 0.6),
        life: rand(0.8, 1.5), size: rand(0.2, 0.36), sizeEnd: 0.05, color: GREEN, colorEnd: GREEN_END, grav: -0.6, drag: 0.6, kind: 2, fadeIn: 0.05,
      }, true);
      if (Math.random() < 0.25) {
        _p.set(rand(-0.5, 0.5) * s.cls.beam, 0, rand(-0.5, 0.2) * s.cls.length).applyMatrix4(xf);
        fx.emit({
          x: _p.x, y: world.waterHeight(_p.x, _p.z) + 0.4, z: _p.z, vx: rand(-0.5, 0.5), vy: 0.15, vz: rand(-0.5, 0.5),
          life: rand(2.5, 3.5), size: rand(1.6, 2.4), sizeEnd: rand(5, 7), color: MIST, colorEnd: MIST_END, alpha: 0.32, grav: -0.05, drag: 0.8, kind: 1, fadeIn: 0.2,
        });
      }
    }
  }

  /** She's back: the Banshee's Wail goes out. */
  private wailOut(world: World) {
    const s = this.ship;
    this.wailT = 0;
    this.wailed.clear();
    this.burst(world, 1.6);
    // the ring itself: ghost-fire racing out flat over the water, a band of
    // green mist rolling out behind it, and sparks thrown up off its crest
    const sea = world.waterHeight(s.pos.x, s.pos.z) + 0.6;
    const fx = world.particles;
    const n = 110;
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * (i + Math.random() * 0.5)) / n;
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      const ox = s.pos.x + dx * 4;
      const oz = s.pos.z + dz * 4;
      const sp = (WAIL_R / WAIL_T) * rand(0.82, 0.92);
      fx.emit({ x: ox, y: sea, z: oz, vx: dx * sp, vy: rand(0, 0.8), vz: dz * sp, life: WAIL_T * rand(1.05, 1.2), size: 2.2, sizeEnd: 4.6, color: GREEN, colorEnd: GREEN_END, drag: 0.25, kind: 0, fadeIn: 0.02 }, true);
      if (i % 3 === 0) {
        fx.emit({ x: ox, y: sea + 0.5, z: oz, vx: dx * sp * 0.6, vy: rand(2, 5), vz: dz * sp * 0.6, life: rand(0.9, 1.4), size: 0.35, sizeEnd: 0.05, color: [1.6, 6, 3.2], colorEnd: GREEN_END, grav: -0.8, drag: 1.4, kind: 2, fadeIn: 0.02 }, true);
      }
      if (i % 2 === 0) {
        fx.emit({ x: ox, y: sea, z: oz, vx: dx * sp * 0.45, vy: 0, vz: dz * sp * 0.45, life: rand(2, 2.8), size: 2.5, sizeEnd: 7, color: MIST, colorEnd: MIST_END, alpha: 0.38, grav: -0.1, drag: 1.1, kind: 1, fadeIn: 0.05 });
      }
    }
    const [vol, pan, d] = world.soundAt(s.pos);
    world.audio.wail(vol, pan, d);
    world.onShake(s.team === 'player' ? 0.55 : 0.4 * vol, s.pos);
    s.kickRoll(0.06);
  }

  /** The ring spreading: each foe it reaches takes its blow, and their gun crews quail. */
  private wailStep(dt: number, world: World) {
    this.wailT += dt;
    const k = clamp(this.wailT / WAIL_T, 0, 1);
    const r = WAIL_R * (1 - (1 - k) * (1 - k));
    const s = this.ship;
    for (const o of Haunt.ships()) {
      // her foes only: never her own side, a prize, a merchant, or a pirate holding his fire in peaceful seas
      if (o === s || !o.alive || this.wailed.has(o) || o.team === s.team || o.prize || o.team === 'merchant' || o.calm) continue;
      const d = Math.hypot(o.pos.x - s.pos.x, o.pos.z - s.pos.z) - o.cls.length * 0.35;
      if (d > r) continue;
      this.wailed.add(o);
      const near = clamp(d / WAIL_R, 0, 1);
      _p.set(o.pos.x, o.root.position.y + o.cls.freeboard + 1, o.pos.z);
      const dealt = o.damage(WAIL_DMG * (1 - 0.55 * near), s, world, null, false);
      Haunt.onWail(o, s, dealt);
      if (o.alive && o.terrify(s)) world.onStatus(o, 'dread', s);
      o.kickRoll(0.1 * (1 - near * 0.5));
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * Math.PI * 2;
        const rr = o.cls.beam * 0.4;
        world.particles.emit({
          x: _p.x + Math.cos(a) * rr, y: _p.y + rand(-1, 2), z: _p.z + Math.sin(a) * rr, vx: Math.cos(a) * 2, vy: rand(1.5, 3.5), vz: Math.sin(a) * 2,
          life: rand(0.7, 1.2), size: rand(0.3, 0.5), sizeEnd: 0.06, color: [1.4, 5.5, 3], colorEnd: GREEN_END, grav: -0.8, drag: 1, kind: 2, fadeIn: 0.02,
        }, true);
      }
    }
    if (k >= 1) this.wailT = -1;
  }

  /** Every ship afloat, for the wail to find (the game hooks this up). */
  static ships: () => Ship[] = () => [];
  /** A ship took the wail's blow (the game shows the number and settles a sinking). */
  static onWail: (ship: Ship, by: Ship, dealt: number) => void = () => {};
}
