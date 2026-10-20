import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clamp } from '../core/noise';
import type { DeckPlan } from '../ships/crew';
import type { Ship } from '../ships/ship';
import type { ShoreMats } from './kit';
import type { Walker } from './walker';

// Boarding: the deck of a lashed prize as somewhere to fight on foot, and the
// grappling lines that hold her alongside.
//
// Walkers keep world x/z as they do ashore. A deck converts them into the
// ship's own frame (position and heading only) to keep them between her
// rails and round her masts and guns, and once they are posed it carries
// their matrices onto her planks, so they heave, pitch and roll with her and
// stand up against the roll as her own crew do.

/** What a walker stands on: the island's ground, or a ship's deck. */
export interface Floor {
  /** World height of whatever is underfoot. */
  height(x: number, z: number): number;
  /** Walks (x, z) by (dx, dz), kept clear of everything solid; writes where you end up. */
  step(x: number, z: number, dx: number, dz: number, r: number, out: { x: number; z: number }): void;
}

const _m = new THREE.Matrix4();
const _f = new THREE.Matrix4();
const _t = new THREE.Matrix4();
const _u = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _l = { x: 0, z: 0 };

export class DeckFloor implements Floor {
  readonly kind = 'deck';
  /** Fore and aft ends of the open deck (ship-local z), inside the bulkheads. */
  private z0: number;
  private z1: number;

  constructor(
    readonly ship: Ship,
    readonly plan: DeckPlan,
  ) {
    const m = plan.main;
    this.z0 = plan.zAt(m.t0) + 0.25;
    this.z1 = plan.zAt(m.t1) - 0.25;
  }

  /** World to ship-local (her heading and position only). */
  toLocal(x: number, z: number, out: { x: number; z: number }) {
    const s = this.ship;
    const dx = x - s.pos.x;
    const dz = z - s.pos.z;
    const sh = Math.sin(s.heading);
    const ch = Math.cos(s.heading);
    out.x = dx * ch - dz * sh;
    out.z = dx * sh + dz * ch;
    return out;
  }

  toWorld(lx: number, lz: number, out: { x: number; z: number }) {
    const s = this.ship;
    const sh = Math.sin(s.heading);
    const ch = Math.cos(s.heading);
    out.x = s.pos.x + lx * ch + lz * sh;
    out.z = s.pos.z - lx * sh + lz * ch;
    return out;
  }

  /** Plank height in her own frame. */
  localY(lx: number, lz: number) {
    return this.plan.deckY(this.plan.main, lx, lz);
  }

  height(x: number, z: number) {
    const l = this.toLocal(x, z, _l);
    this.ship.root.updateMatrixWorld();
    return _p.set(l.x, this.localY(l.x, l.z), l.z).applyMatrix4(this.ship.root.matrixWorld).y;
  }

  /** Half the deck's width at a local z, less a body's girth. */
  private room(lz: number, r: number) {
    const P = this.plan;
    const t = clamp(P.tOf(lz), P.main.t0, P.main.t1);
    return Math.max(0.2, P.halfWidth(P.main, t) - r - 0.08);
  }

  /** Clamps a local point onto the open deck, clear of masts, guns and hatches. */
  keep(l: { x: number; z: number }, r: number) {
    for (let k = 0; k < 2; k++) {
      for (const o of this.plan.obstacles) {
        const dx = l.x - o.x;
        const dz = l.z - o.z;
        const d = Math.hypot(dx, dz);
        const min = o.r + r;
        if (d >= min) continue;
        if (d < 1e-4) {
          l.x += min;
          continue;
        }
        l.x = o.x + (dx / d) * min;
        l.z = o.z + (dz / d) * min;
      }
      l.z = clamp(l.z, this.z0 + r, this.z1 - r);
      const w = this.room(l.z, r);
      l.x = clamp(l.x, -w, w);
    }
    return l;
  }

  step(x: number, z: number, dx: number, dz: number, r: number, out: { x: number; z: number }) {
    const l = this.toLocal(x + dx, z + dz, _l);
    this.keep(l, r);
    this.toWorld(l.x, l.z, out);
  }

  /** Is a world point on this deck's planks (with some slack)? */
  holds(x: number, z: number, slack = 0) {
    const l = this.toLocal(x, z, _l);
    return l.z > this.z0 - slack && l.z < this.z1 + slack && Math.abs(l.x) < this.room(l.z, 0) + slack;
  }

  /**
   * Carries a walker posed flat (at its local plank height) onto the rolling
   * deck: into the ship's frame, stood upright about its feet, then out
   * through her world matrix. Also sets its world height, for blood and dust.
   */
  ride(w: Walker) {
    const s = this.ship;
    const l = this.toLocal(w.x, w.z, _l);
    const ly = this.localY(l.x, l.z);
    // the flat pose's frame: her heading about her position
    _f.makeRotationY(-s.heading).multiply(_t.makeTranslation(-s.pos.x, 0, -s.pos.z));
    // stood against the roll, about the feet
    _u.makeTranslation(l.x, ly, l.z).multiply(_m.makeRotationFromQuaternion(this.plan.upright)).multiply(_t.makeTranslation(-l.x, -ly, -l.z));
    _m.multiplyMatrices(s.root.matrixWorld, _u).multiply(_f).multiply(w.matrix);
    w.matrix.copy(_m);
    w.y = _p.set(l.x, ly, l.z).applyMatrix4(s.root.matrixWorld).y;
  }

  /** A ship-local point on her rail top (side +1 port), in world space. */
  railPoint(t: number, side: number, out: THREE.Vector3, inboard = 0) {
    const sh = this.ship.model.shape;
    const y = sh.top(t);
    out.set(side * (sh.halfWidthAtY(t, y) - inboard), y, sh.z(t));
    return out.applyMatrix4(this.ship.root.matrixWorld);
  }
}

/** The rail point of any ship, without a crew plan (the boarders' own ship). */
export function railPoint(ship: Ship, t: number, side: number, out: THREE.Vector3, inboard = 0) {
  const sh = ship.model.shape;
  const y = sh.top(t);
  out.set(side * (sh.halfWidthAtY(t, y) - inboard), y, sh.z(t));
  return out.applyMatrix4(ship.root.matrixWorld);
}

// ------------------------------------------------------------------ grappling lines

const ROPES = 140;
const HOOKS = 8;
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _y = new THREE.Vector3(0, 1, 0);

function painted(g: THREE.BufferGeometry, hex: string) {
  const c = new THREE.Color(hex);
  const n = g.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.deleteAttribute('uv');
  return g;
}

/** A three-pronged iron grappling hook, shank up the +y axis, eye at the top. */
function hookGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const shank = new THREE.CylinderGeometry(0.03, 0.035, 0.42, 6);
  shank.translate(0, 0.21, 0);
  parts.push(shank);
  const eye = new THREE.TorusGeometry(0.05, 0.014, 4, 8);
  eye.translate(0, 0.46, 0);
  parts.push(eye);
  for (let i = 0; i < 3; i++) {
    // each prong curls up from the crown into a barbed point
    const prong = new THREE.TorusGeometry(0.13, 0.022, 4, 7, Math.PI * 0.72);
    prong.rotateZ(Math.PI * 1.05);
    prong.translate(0.13, 0.02, 0);
    prong.rotateY((i / 3) * Math.PI * 2);
    parts.push(prong);
  }
  const g = mergeGeometries(parts.map((p) => painted(p.toNonIndexed(), '#3a3836')))!;
  g.computeVertexNormals();
  return g;
}

/**
 * The lines thrown across to a prize: thick tarred rope drawn as short
 * instanced segments (so they sag, whip and come taut) and the iron hooks
 * biting into her rail. Built at load with the shore's own materials, so the
 * warm-up draws them before any fight needs them.
 */
export class Lines {
  readonly ropes: THREE.InstancedMesh;
  readonly hooks: THREE.InstancedMesh;
  private n = 0;
  private h = 0;

  constructor(mats: ShoreMats) {
    const seg = painted(new THREE.CylinderGeometry(1, 1, 1, 5, 1, true).translate(0, 0.5, 0), '#6d5636');
    this.ropes = new THREE.InstancedMesh(seg, mats.wood, ROPES);
    this.ropes.count = 0;
    this.ropes.frustumCulled = false;
    this.ropes.castShadow = false;
    this.ropes.receiveShadow = true;
    this.ropes.name = 'boarding-ropes';
    this.hooks = new THREE.InstancedMesh(hookGeometry(), mats.iron, HOOKS);
    this.hooks.count = 0;
    this.hooks.frustumCulled = false;
    this.hooks.castShadow = false;
    this.hooks.name = 'boarding-hooks';
  }

  begin() {
    this.n = 0;
    this.h = 0;
  }

  /** A straight length of rope from a to b. */
  seg(a: THREE.Vector3, b: THREE.Vector3, r: number) {
    if (this.n >= ROPES) return;
    _d.subVectors(b, a);
    const len = _d.length();
    if (len < 1e-3) return;
    _q.setFromUnitVectors(_y, _d.multiplyScalar(1 / len));
    _m.compose(a, _q, _s.set(r, len, r));
    this.ropes.setMatrixAt(this.n++, _m);
  }

  /**
   * A rope hung from a to b with `sag` metres of droop at its middle (0 taut),
   * and a sideways whip `wob` for a line still snaking through the air.
   */
  line(a: THREE.Vector3, b: THREE.Vector3, sag: number, r = 0.028, wob = 0, phase = 0, n = 9) {
    _a.copy(a);
    for (let i = 1; i <= n; i++) {
      const f = i / n;
      _b.lerpVectors(a, b, f);
      const bow = 4 * f * (1 - f);
      _b.y -= sag * bow;
      if (wob) {
        const w = Math.sin(f * 7 + phase) * wob * bow;
        _b.x += w * 0.7;
        _b.z -= w * 0.7;
        _b.y += Math.cos(f * 5 + phase) * wob * 0.5 * bow;
      }
      this.seg(_a, _b, r);
      _a.copy(_b);
    }
  }

  /** A hook at `at`, shank pointing along `up` (toward the line it hangs from). */
  hook(at: THREE.Vector3, up: THREE.Vector3, spin: number) {
    if (this.h >= HOOKS) return;
    _q.setFromUnitVectors(_y, _d.copy(up).normalize());
    _m.makeRotationY(spin);
    _t.compose(at, _q, _s.set(1.25, 1.25, 1.25)).multiply(_m);
    this.hooks.setMatrixAt(this.h++, _t);
  }

  end() {
    this.ropes.count = this.n;
    this.hooks.count = this.h;
    this.ropes.instanceMatrix.needsUpdate = true;
    this.hooks.instanceMatrix.needsUpdate = true;
  }
}
