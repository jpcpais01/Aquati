import * as THREE from 'three';
import { angleDelta, clamp, damp, lerp } from '../core/noise';
import { Ship } from '../ships/ship';
import { DeckView, Pilot } from '../ships/crew';
import { HullShape, Stair } from '../ships/shipModel';

// The captain's own eyes. You walk the deck in ship-local space, so the ship
// carries you along with her heave, pitch and roll; your head stays upright
// against the roll like the crew's do, and the horizon only tilts a little.
// Castles are reached by their companion stairs, the bulwarks, guns, masts,
// barrels and crew all block the way, and at the wheel you take the helm.

const BODY_R = 0.28;
const EYE = 1.64;
const STEP = 0.32; // tallest ledge you can step up or down without stairs
const WALK = 2.2;
const RUN = 3.9;
const HELM_REACH = 1.7;
const TILT = 0.3; // how much of the ship's pitch and roll reaches the horizon

export interface WalkInput {
  /** Desired stride in view space: x right, y forward, each -1..1. */
  x: number;
  y: number;
  run: boolean;
  lookX: number; // radians this frame
  lookY: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _up = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _spots: { x: number; z: number }[] = [];

class Deck {
  readonly shape: HullShape;
  readonly stairs: Stair[];
  readonly L: number;

  constructor(readonly ship: Ship) {
    this.shape = ship.model.shape;
    this.stairs = ship.model.stairs;
    this.L = ship.cls.length;
  }

  t(z: number) {
    return z / this.L + 0.5;
  }

  /** Floor height under a point, with the deck's gentle camber. */
  floor(x: number, z: number) {
    for (const st of this.stairs) {
      if (Math.abs(x - st.x) > st.w / 2) continue;
      // the head of the flight runs on over the bulkhead onto the castle deck
      const p = (z - st.z0) / (st.z1 - st.z0);
      if (p >= 0 && p <= 1 + 0.5 / Math.abs(st.z1 - st.z0)) return lerp(st.y0, st.y1, Math.min(p, 1));
    }
    const c = this.ship.cls;
    const s = this.shape;
    const t = this.t(z);
    let y = s.mainDeckY(t);
    if (c.sternCastle && t < c.sternCastle.t) y = s.sheer(t) + c.sternCastle.h - c.bulwark;
    if (c.foreCastle && t > c.foreCastle.t) y = s.sheer(t) + c.foreCastle.h - c.bulwark;
    const w = Math.max(0.3, s.halfWidthAtY(t, y) - 0.14);
    return y + 0.06 * Math.max(0, 1 - Math.abs(x) / w);
  }

  /** The flight of stairs underfoot, if any. */
  stairAt(x: number, z: number) {
    for (const st of this.stairs) {
      if (Math.abs(x - st.x) > st.w / 2) continue;
      const p = (z - st.z0) / (st.z1 - st.z0);
      if (p > 0.02 && p < 0.98) return st;
    }
    return null;
  }

  /** Inner face of the bulwark less the body, or <0 where the hull is too fine to stand. */
  halfWidth(z: number, y: number) {
    return this.shape.halfWidthAtY(this.t(z), y) - 0.14 - BODY_R;
  }

  inside(z: number) {
    const t = this.t(z);
    return t > 0.035 && t < 0.94;
  }
}

export class Captain {
  ship: Ship | null = null;
  private deck: Deck | null = null;
  view: DeckView | null = null;
  x = 0;
  z = 0;
  /** Ship-local look direction: 0 = toward the bow, +PI/2 = to port. */
  yaw = 0;
  pitch = -0.05;
  private vx = 0;
  private vz = 0;
  private floorY = 0;
  private floorSmooth = 0;
  private phase = 0;
  private stride = 0;
  private lastStep = 0;
  atHelm = false;
  private helmK = 0;
  private settle = 0; // eyes swing forward over the wheel as you take it
  spy = 0; // spyglass 0..1
  spyWanted = false;
  /** Fired at each footfall with how hard it landed (0..1). */
  onStep: (k: number) => void = () => {};
  readonly pilot: Pilot = { active: false, x: 0, z: 0, floor: 0, yaw: 0, speed: 0, phase: 0, atHelm: false, hidden: false };

  /** Steps into the captain's boots wherever they stand on deck. */
  board(ship: Ship, view: DeckView | null, at: { x: number; z: number; yaw: number } | null) {
    this.ship = ship;
    this.deck = new Deck(ship);
    this.view = view;
    const helm = view?.helm ?? { x: 0, z: ship.model.shape.z(0.2) };
    this.x = at ? at.x : helm.x + 0.8;
    this.z = at ? at.z : helm.z + 0.6;
    this.yaw = at ? at.yaw : 0;
    this.pitch = -0.06;
    this.vx = this.vz = 0;
    this.atHelm = false;
    this.helmK = 0;
    this.spy = 0;
    this.floorY = this.floorSmooth = this.deck.floor(this.x, this.z);
    this.pilot.active = true;
  }

  leave() {
    this.pilot.active = false;
    this.pilot.hidden = false;
    this.pilot.atHelm = false;
    this.atHelm = false;
    this.spyWanted = false;
  }

  get helmDistance() {
    const h = this.view?.helm;
    return h ? Math.hypot(this.x - h.x, this.z - h.z) : Infinity;
  }

  get canTakeHelm() {
    return !this.atHelm && this.helmDistance < HELM_REACH;
  }

  toggleHelm() {
    if (this.atHelm) {
      this.atHelm = false;
      // step clear so the helmsman can take the spokes back
      if (this.deck) this.move(-0.85, 0, this.deck);
    } else if (this.canTakeHelm) {
      this.atHelm = true;
      this.settle = 0.7;
    }
  }

  /** Is the captain looking out over the port (+1) or starboard (-1) beam, or neither (0)? */
  lookSide() {
    const s = Math.sin(this.yaw);
    return s > 0.42 ? 1 : s < -0.42 ? -1 : 0;
  }

  update(dt: number, inp: WalkInput) {
    const ship = this.ship;
    const deck = this.deck;
    if (!ship || !deck) return;
    // look (the spyglass steadies and slows your aim)
    const sens = 1 - this.spy * 0.72;
    this.yaw = angleDelta(0, this.yaw - inp.lookX * sens);
    this.pitch = clamp(this.pitch - inp.lookY * sens, -1.35, 1.25);
    if (this.settle > 0) {
      this.settle = Math.abs(inp.lookX) + Math.abs(inp.lookY) > 0.002 ? 0 : this.settle - dt;
      const k = damp(5, dt);
      this.yaw += angleDelta(this.yaw, 0) * k;
      this.pitch += (-0.04 - this.pitch) * k;
    }
    this.spy += ((this.spyWanted ? 1 : 0) - this.spy) * damp(this.spyWanted ? 7 : 9, dt);

    const sideways = this.walkFrame(dt, inp, deck);
    // the deck tilts under you: drift a touch downhill and outward in a hard turn
    const roll = ship.root.rotation.z;
    const pitch = ship.root.rotation.x;
    const loose = 1 - Math.min(1, this.stride / WALK) * 0.6;
    const drift = this.atHelm ? 0 : loose;
    this.move((-Math.sin(roll) * 2.4 - ship.angVel * ship.speed * 0.03) * drift * dt, Math.sin(pitch) * 2.4 * drift * dt, deck);
    this.floorY = deck.floor(this.x, this.z);
    // stairs and ledges ease the eye up and down instead of snapping
    this.floorSmooth += (this.floorY - this.floorSmooth) * damp(16, dt);
    if (Math.abs(this.floorY - this.floorSmooth) > 0.6) this.floorSmooth = this.floorY;

    const p = this.pilot;
    p.x = this.x;
    p.z = this.z;
    p.floor = this.floorY;
    p.yaw = this.atHelm ? 0 : this.stride > 0.2 && sideways ? Math.atan2(this.vx, this.vz) : this.yaw;
    p.speed = this.stride;
    p.phase = this.phase;
    p.atHelm = this.atHelm;
  }

  /** Returns true while walking crab-wise (the body faces the stride, not the eyes). */
  private walkFrame(dt: number, inp: WalkInput, deck: Deck) {
    // at the wheel: ease onto the helm spot and stand fast
    if (this.atHelm && this.view) {
      this.helmK = Math.min(1, this.helmK + dt * 2.5);
      const h = this.view.helm;
      const k = damp(6, dt);
      this.vx = this.vz = 0;
      this.x += (h.x - this.x) * k;
      this.z += (h.z - this.z) * k;
      this.stride *= 1 - damp(8, dt);
      return false;
    }
    this.helmK = 0;
    const len = Math.min(1, Math.hypot(inp.x, inp.y));
    const speed = (inp.run ? RUN : WALK) * len;
    let wx = 0;
    let wz = 0;
    if (len > 0.01) {
      // view-relative: forward along the look yaw, right is to starboard (-x)
      const fx = Math.sin(this.yaw);
      const fz = Math.cos(this.yaw);
      const ix = inp.x / Math.max(1, Math.hypot(inp.x, inp.y));
      const iy = inp.y / Math.max(1, Math.hypot(inp.x, inp.y));
      wx = (fx * iy - fz * ix) * speed;
      wz = (fz * iy + fx * ix) * speed;
    }
    const k = damp(len > 0.01 ? 9 : 12, dt);
    this.vx += (wx - this.vx) * k;
    this.vz += (wz - this.vz) * k;
    const px = this.x;
    const pz = this.z;
    this.move(this.vx * dt, this.vz * dt, deck);
    // stairs are narrow: feet find the middle of the treads
    const st = deck.stairAt(this.x, this.z);
    if (st) this.x += (st.x - this.x) * damp(6, dt);
    const moved = Math.hypot(this.x - px, this.z - pz) / Math.max(dt, 1e-4);
    this.stride += (moved - this.stride) * damp(12, dt);
    if (this.stride < 0.05) {
      this.stride = 0;
      return false;
    }
    // a stride is ~1.4 m walking, longer at a run; footfalls twice per cycle
    const before = this.phase;
    this.phase += ((moved * dt) / (this.stride > 3 ? 2 : 1.4)) * Math.PI * 2;
    const a = Math.floor(before / Math.PI);
    const b = Math.floor(this.phase / Math.PI);
    if (b !== a && performance.now() - this.lastStep > 180) {
      this.lastStep = performance.now();
      this.onStep(clamp(this.stride / RUN, 0.3, 1));
    }
    if (this.phase > 1e4) this.phase -= Math.PI * 2 * 1000;
    return Math.abs(inp.x) > 0.3;
  }

  /** Moves with collision: bulwarks, ledges taller than a step, obstacles and crew. */
  private move(dx: number, dz: number, deck: Deck) {
    if (dx === 0 && dz === 0) return;
    const cur = deck.floor(this.x, this.z);
    const ok = (x: number, z: number) => {
      if (!deck.inside(z)) return false;
      const f = deck.floor(x, z);
      if (Math.abs(f - cur) > STEP) return false;
      // keep a body's depth back from any ledge ahead or behind (castle rails, bulkheads)
      if (Math.abs(deck.floor(x, z + BODY_R) - f) > 0.45 || Math.abs(deck.floor(x, z - BODY_R) - f) > 0.45) return false;
      return Math.abs(x) <= Math.max(0, deck.halfWidth(z, f));
    };
    let nx = this.x + dx;
    let nz = this.z + dz;
    // slide along the bulwark instead of sticking to it
    const fy = deck.floor(nx, nz);
    const hw = deck.halfWidth(nz, fy);
    if (hw > 0.05) nx = clamp(nx, -hw, hw);
    if (ok(nx, nz)) {
      this.x = nx;
      this.z = nz;
    } else if (ok(nx, this.z)) this.x = nx;
    else if (ok(this.x, nz)) this.z = nz;
    else return;
    // push out of solid things, keeping whatever push still stands on walkable deck
    const view = this.view;
    if (!view) return;
    const push = (ox: number, oz: number, r: number) => {
      const ddx = this.x - ox;
      const ddz = this.z - oz;
      const d = Math.hypot(ddx, ddz);
      const min = r + BODY_R;
      if (d >= min || d < 1e-5) return;
      const qx = this.x + (ddx / d) * (min - d);
      const qz = this.z + (ddz / d) * (min - d);
      if (ok(qx, qz)) {
        this.x = qx;
        this.z = qz;
      }
    };
    for (const o of view.obstacles) if (!o.stair) push(o.x, o.z, o.r);
    for (const s of view.others(_spots)) push(s.x, s.z, 0.24);
  }

  /** World-space eye and orientation for this frame. */
  eye(pos: THREE.Vector3, quat: THREE.Quaternion, time: number) {
    const ship = this.ship!;
    const m = ship.root.matrixWorld;
    // feet ride the deck; the body stands against the roll like the crew's do
    _v.set(this.x, this.floorSmooth, this.z).applyMatrix4(m);
    _q.copy(ship.root.quaternion);
    const deckUp = new THREE.Vector3(0, 1, 0).applyQuaternion(_q);
    const up = deckUp.lerp(_up, 0.75).normalize();
    const walkK = Math.min(1, this.stride / WALK);
    const bob = Math.abs(Math.sin(this.phase)) * 0.045 * walkK - 0.02 * walkK;
    pos.copy(_v).addScaledVector(up, EYE + bob);
    // a whisper of breathing when still
    pos.y += Math.sin(time * 1.3) * 0.006 * (1 - walkK);
    // head: ship heading and a share of her pitch and roll, then your own look
    _e.set(ship.root.rotation.x * TILT, ship.heading, ship.root.rotation.z * TILT);
    quat.setFromEuler(_e);
    _e.set(this.pitch, this.yaw + Math.PI, Math.sin(this.phase) * 0.008 * walkK);
    _q2.setFromEuler(_e);
    quat.multiply(_q2);
    // sway the eye side to side with each footfall
    _m.makeRotationFromQuaternion(quat);
    pos.addScaledVector(_v.setFromMatrixColumn(_m, 0), Math.sin(this.phase) * 0.025 * walkK);
  }
}
