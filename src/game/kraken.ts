import * as THREE from 'three';
import { angleDelta, clamp, damp, lerp, smoothstep } from '../core/noise';
import { globalUniforms } from '../render/environment';
import { ArmSpec, EYE, KrakenView, SPINE, armProfile } from '../fx/krakenModel';
import type { Ship } from '../ships/ship';
import type { AmmoId } from './ammo';
import type { World } from './world';

// The Kraken: a rare terror that rises in a storm.
//
// It comes in stages. First the omen: the sea goes dark and boils around your
// ship as something vast passes beneath her. Then the arms burst up all
// around, each one planted in the sea and reaching for you. An arm rears back
// (a crimson shimmer marks where it will fall), then whips down across the
// water; sail out of the line or take the blow. Now and then one coils round
// your hull and holds her fast until you shoot it loose. Beaten arms recoil,
// spurting ink, and grow back; beat enough and the head itself surfaces for a
// while, its great eyes the place to aim. Wound it deep and it rages: more
// arms, faster blows, a maelstrom that drags you in. Kill it and the deep
// gives up its hoard.

export type KrakenPhase = 'off' | 'omen' | 'fight' | 'dying' | 'leave';
type ArmState = 'down' | 'rise' | 'idle' | 'rear' | 'strike' | 'lie' | 'lift' | 'reach' | 'grab' | 'recoil' | 'sink';
type Part = 'arm' | 'head' | 'eye';

/** A ball's flight this substep, as the projectiles see it. */
export interface StrikeBall {
  pos: THREE.Vector3;
  prev: THREE.Vector3;
  vel: THREE.Vector3;
  damage: number;
  owner: Ship;
  ammo: AmmoId;
}

/** Something on the water the guns can be laid on. */
export interface KrakenMark {
  x: number;
  z: number;
  r: number;
}

interface Arm {
  i: number;
  L: number;
  R0: number;
  crown: boolean;
  state: ArmState;
  t: number;
  dur: number;
  out: number;
  ax: number;
  az: number;
  phi: number;
  // pose, eased toward each state's shape
  lean0: number;
  lean: number;
  curl: number;
  flat: number;
  sway: number;
  hp: number;
  maxHp: number;
  flash: number;
  flinch: number;
  flinchV: number;
  arousal: number;
  aimX: number;
  aimZ: number;
  locked: boolean;
  seed: number;
  wrap: number;
  grabDealt: number;
  burn: number;
  burnT: number;
  /** Seconds to the next crushing tick while it holds her. */
  tick: number;
  /** It has broken the surface on this rising. */
  burst: boolean;
  regrow: number;
  used: number;
  pts: Float32Array;
  nrm: Float32Array;
  girth: Float32Array;
  wrapPts: Float32Array;
  wrapNrm: Float32Array;
  /** Height of the lying pose's flat run above its root, for placing it on the sea. */
  lieRise: number;
}

const TAU = Math.PI * 2;
const SPECS: ArmSpec[] = [
  { L: 33, R0: 2.05 },
  { L: 31, R0: 1.95 },
  { L: 34, R0: 2.1 },
  { L: 30, R0: 1.9 },
  { L: 32, R0: 2.0 },
  { L: 33.5, R0: 2.05 },
  { L: 17, R0: 1.35 },
  { L: 18, R0: 1.4 },
];
/** Arms fighting at once in each stage (the head's crown arms come on top). */
const ACTIVE = [4, 5, 6];
const ATTACK_GAP = [5.0, 3.8, 2.8];
const REAR_TIME = [1.65, 1.4, 1.2];
const GRAB_ODDS = [0.15, 0.24, 0.32];
const SLAM_HIT = [0.15, 0.18, 0.21];
const CRUSH_RATE = [0.032, 0.042, 0.052];
const STRIKE_TIME = 0.4;
/** Body hit points before the class factor, and an arm's. */
const BODY_HP = 3000;
const ARM_HP = 165;
/** Ammo against arm / head. Chain cleaves flesh, shells blast the head. */
const VS: Record<AmmoId, [number, number]> = {
  round: [1, 1],
  shell: [0.95, 1.6],
  fire: [0.8, 0.8],
  chain: [1.9, 0.6],
  grape: [1.25, 0.65],
  wraith: [1.1, 1.1],
};
/** How far the head lurks from its prey while submerged. */
const LURK = 48;
const DEEP = -17;
const SURFACED = 2.4;

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _inv = new THREE.Matrix4();
const _m = new THREE.Matrix4();
const _loc = new THREE.Vector3();

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const ease = (t: number) => t * t * (3 - 2 * t);

/** Closest distance between segments p0-p1 and q0-q1, and where along the second (0..1). */
function segSeg(p0: THREE.Vector3, p1: THREE.Vector3, q0: THREE.Vector3, q1: THREE.Vector3): [number, number] {
  const d1x = p1.x - p0.x, d1y = p1.y - p0.y, d1z = p1.z - p0.z;
  const d2x = q1.x - q0.x, d2y = q1.y - q0.y, d2z = q1.z - q0.z;
  const rx = p0.x - q0.x, ry = p0.y - q0.y, rz = p0.z - q0.z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  let s = 0;
  let t = 0;
  if (a < 1e-8 && e < 1e-8) return [Math.hypot(rx, ry, rz), 0];
  if (a < 1e-8) t = clamp(f / e, 0, 1);
  else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e < 1e-8) s = clamp(-c / a, 0, 1);
    else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z;
      const den = a * e - b * b;
      s = den > 1e-8 ? clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = clamp((b - c) / a, 0, 1);
      }
    }
  }
  const x = rx + d1x * s - d2x * t;
  const y = ry + d1y * s - d2y * t;
  const z = rz + d1z * s - d2z * t;
  return [Math.hypot(x, y, z), t];
}

/** Damage gathered per part for a moment, so a grape volley reads as one blow. */
interface Tally {
  dmg: number;
  crit: boolean;
  at: THREE.Vector3;
  t: number;
  mine: boolean;
}

export class Kraken {
  readonly view: KrakenView;
  phase: KrakenPhase = 'off';
  /** Seconds into the current phase. */
  t = 0;
  hp = BODY_HP;
  maxHp = BODY_HP;
  /** 0, 1 or 2: wounded past two thirds, then past one third. */
  stage = 0;
  /** Its name for the banner. */
  readonly name = 'The Kraken';
  private arms: Arm[] = [];
  private prey: Ship | null = null;
  // the body and head
  readonly body = new THREE.Vector3(0, DEEP, 0);
  private bodyAz = 0;
  private headY = DEEP - 30;
  private headYaw = 0;
  private headPitch = 0;
  private headRoll = 0;
  private headFlash = 0;
  /** 'down' lurking beneath, 'up' surfacing or surfaced, 'dive' going back down. */
  private head: 'down' | 'up' | 'dive' = 'down';
  private headT = 0;
  private headTimer = 26;
  private beaten = 0;
  private roarT = -1;
  private rage = 0;
  private pallor = 0;
  private lid = 1;
  private blinkT = 3;
  private ink = 0;
  private swirl = 0;
  private swirlR = 40;
  private attackT = 4;
  private grabCool = 12;
  private fxT = 0;
  private bubbleT = 0;
  private tallies = new Map<string, Tally>();
  private dropped = false;
  private gaze = new THREE.Vector2();
  /** Seconds the player has been out of its reach (it gives up eventually). */
  private lostT = 0;

  // reported to the game
  onHurt: (dmg: number, at: THREE.Vector3, crit: boolean, part: Part, byPlayer: boolean) => void = () => {};
  onPlayerHit: (dmg: number, at: THREE.Vector3, kind: 'slam' | 'crush') => void = () => {};
  onRise: () => void = () => {};
  onStage: (stage: number) => void = () => {};
  onHead: (up: boolean) => void = () => {};
  onGrab: (on: boolean, freed: boolean) => void = () => {};
  onArmBeaten: (at: THREE.Vector3) => void = () => {};
  onDefeated: (at: THREE.Vector3) => void = () => {};
  onGone: (slain: boolean) => void = () => {};

  constructor() {
    this.view = new KrakenView(SPECS);
    SPECS.forEach((sp, i) => {
      const a: Arm = {
        i, L: sp.L, R0: sp.R0, crown: i >= 6, state: 'down', t: 0, dur: 0, out: 0, ax: 0, az: 0, phi: 0,
        lean0: 0, lean: 0, curl: 0, flat: 0, sway: 0, hp: ARM_HP, maxHp: ARM_HP, flash: 0, flinch: 0, flinchV: 0, arousal: 0,
        aimX: 0, aimZ: 0, locked: false, seed: Math.random() * 100, wrap: 0, grabDealt: 0, burn: 0, burnT: 0, tick: 0, burst: false, regrow: 0, used: 0,
        pts: new Float32Array(SPINE * 3), nrm: new Float32Array(SPINE * 3), girth: new Float32Array(SPINE).fill(1),
        wrapPts: new Float32Array(SPINE * 3), wrapNrm: new Float32Array(SPINE * 3), lieRise: 0,
      };
      // the lying pose's flat run sits this far above its root
      this.turtle(a, 0, 0, 0, 0, 1, 0);
      a.lieRise = a.pts[Math.round(SPINE * 0.4) * 3 + 1];
      this.arms.push(a);
    });
  }

  get active() {
    return this.phase !== 'off';
  }

  /** Arms up and fighting (or the death throes), not the omen or its leaving. */
  get fighting() {
    return this.phase === 'fight';
  }

  get headUp() {
    return this.head === 'up' && this.headY > SURFACED - 4;
  }

  /** The arm holding your ship, and how close she is to breaking free (0..1). */
  get grip(): number | null {
    const a = this.arms.find((x) => x.state === 'grab');
    return a ? clamp(a.grabDealt / (a.maxHp * 0.38), 0, 1) : null;
  }

  /** Arms rearing to strike, for the HUD's warnings: world points above them. */
  warnings(out: THREE.Vector3[]) {
    let n = 0;
    for (const a of this.arms) {
      if (a.state !== 'rear' && a.state !== 'reach') continue;
      const k = Math.round(SPINE * 0.85) * 3;
      if (!out[n]) out[n] = new THREE.Vector3();
      out[n++].set(a.pts[k], a.pts[k + 1] + 4, a.pts[k + 2]);
    }
    return n;
  }

  /** Begins the omen near the prey; the arms come `omen` seconds later. */
  summon(prey: Ship, omen = 9) {
    this.reset();
    this.prey = prey;
    this.phase = 'omen';
    this.t = 0;
    const f = { sloop: 0.72, brig: 1, galleon: 1.32 }[prey.cls.id] ?? 1;
    this.maxHp = this.hp = BODY_HP * f;
    for (const a of this.arms) a.maxHp = a.hp = ARM_HP * f;
    // it comes from ahead and passes right under her keel
    const h = prey.heading;
    this.bodyAz = h + Math.PI + rand(-0.6, 0.6);
    this.body.set(prey.pos.x + Math.sin(h) * 90, DEEP + 3, prey.pos.z + Math.cos(h) * 90);
    this.headY = DEEP + 3;
    this.omenLen = omen;
    this.view.group.visible = true;
  }

  private omenLen = 9;

  reset() {
    this.phase = 'off';
    this.t = 0;
    this.stage = 0;
    this.rage = 0;
    this.pallor = 0;
    this.ink = 0;
    this.swirl = 0;
    this.head = 'down';
    this.headT = 0;
    this.headY = DEEP - 30;
    this.headTimer = 26;
    this.beaten = 0;
    this.attackT = 4;
    this.grabCool = 12;
    this.dropped = false;
    this.lostT = 0;
    this.tallies.clear();
    if (this.prey) this.prey.held = 0;
    this.prey = null;
    for (const a of this.arms) {
      a.state = 'down';
      a.out = 0;
      a.wrap = 0;
      a.burn = 0;
      a.flat = 0;
      a.flash = 0;
      this.view.writeRest(a.i, 0, -400, 0);
    }
    this.view.commit();
    this.view.group.visible = false;
    this.view.beginMarks();
    this.view.endMarks();
    globalUniforms.uKraken.value.set(0, 0, 1, 0);
    globalUniforms.uKrakenInk.value = 0;
  }

  /** It slips back down: arms sink, the head dives, the sea clears. */
  leave() {
    if (this.phase === 'off' || this.phase === 'leave' || this.phase === 'dying') return;
    this.phase = 'leave';
    this.t = 0;
    if (this.prey) this.prey.held = 0;
    for (const a of this.arms) if (a.state !== 'down') this.setState(a, 'sink');
    if (this.head === 'up') this.diveHead();
  }

  // ---------------------------------------------------------------- update

  update(dt: number, world: World, prey: Ship | null) {
    if (this.phase === 'off') return;
    this.t += dt;
    if (prey && prey.alive) this.prey = prey;
    const p = this.prey && this.prey.alive ? this.prey : null;

    if (this.phase === 'omen') this.updateOmen(dt, world, p);
    else if (this.phase === 'fight') this.updateFight(dt, world, p);
    else if (this.phase === 'dying') this.updateDying(dt, world);
    else if (this.phase === 'leave') {
      this.swirl = Math.max(0, this.swirl - dt * 0.25);
      if (this.t > 5 && this.arms.every((a) => a.state === 'down')) {
        this.phase = 'off';
        this.reset();
        this.onGone(false);
        return;
      }
    }
    this.updateHead(dt, world, p);
    for (const a of this.arms) this.updateArm(a, dt, world, p);
    this.flushTallies(dt);
    this.drawMarks(world, p);
    this.view.commit();
    this.ink = Math.max(0, this.ink - dt * 0.06);
    const u = globalUniforms.uKraken.value;
    u.set(this.body.x, this.body.z, this.swirlR, this.swirl);
    globalUniforms.uKrakenInk.value = Math.min(1, this.ink);
  }

  private updateOmen(dt: number, world: World, p: Ship | null) {
    const k = this.t / this.omenLen;
    this.swirl = smoothstep(0, 0.8, k) * 0.55;
    this.swirlR = 26 + k * 24;
    // the dark shape glides on under her
    if (p) {
      const h = Math.atan2(p.pos.x - this.body.x, p.pos.z - this.body.z);
      const sp = 9;
      this.body.x += Math.sin(h) * sp * dt + p.vel.x * dt * 0.9;
      this.body.z += Math.cos(h) * sp * dt + p.vel.z * dt * 0.9;
      this.headYaw += angleDelta(this.headYaw, h) * damp(1.5, dt);
    }
    // bubbles boil up over it, faster as it nears the surface
    this.bubbleT += dt * (4 + k * 26);
    while (this.bubbleT > 1) {
      this.bubbleT -= 1;
      const r = Math.sqrt(Math.random()) * this.swirlR * 0.7;
      const ang = Math.random() * TAU;
      const x = this.body.x + Math.cos(ang) * r;
      const z = this.body.z + Math.sin(ang) * r;
      if (world.terrain.heightAt(x, z) > -4) continue;
      const y = world.waterHeight(x, z);
      world.wake.stamp(x, z, rand(0.6, 1.6), rand(0.12, 0.3));
      world.particles.emit({ x, y: y + 0.1, z, vx: rand(-0.4, 0.4), vy: rand(0.6, 1.8), vz: rand(-0.4, 0.4), life: rand(0.5, 1), size: rand(0.15, 0.35), sizeEnd: 0.05, color: [1.3, 1.4, 1.45], alpha: 0.85, grav: 6, kind: 0, fadeIn: 0.02 });
    }
    if (this.t > this.omenLen && p) {
      this.phase = 'fight';
      this.t = 0;
      this.attackT = 2.6;
      // three arms burst up around her at once: one right alongside
      this.raise(this.arms[0], p, 0.36, 0, world);
      this.raise(this.arms[1], p, 0.55, 0.45, world);
      this.raise(this.arms[2], p, 0.6, 0.9, world);
      this.roar(world, 1);
      world.onShake(1.1, p.pos);
      this.onRise();
    } else if (!p && this.t > 2) this.leave();
  }

  private updateFight(dt: number, world: World, p: Ship | null) {
    if (!p) {
      // she's gone down: it lingers over the wreck a moment, then sinks away
      if (this.t > 3) this.leave();
      return;
    }
    const hpF = this.hp / this.maxHp;
    const stage = hpF < 0.33 ? 2 : hpF < 0.66 ? 1 : 0;
    if (stage > this.stage) {
      this.stage = stage;
      this.roar(world, 1);
      this.ink = Math.min(1.4, this.ink + 0.8);
      this.inkBurst(world, this.body.x, this.body.z, 1.6);
      // the beaten arms come straight back, angrier
      for (const a of this.arms) if (a.state === 'down' && !a.crown) a.regrow = Math.min(a.regrow, rand(0.5, 2));
      this.onStage(stage);
    }
    this.rage += ((this.stage === 2 ? 1 : this.stage * 0.35) - this.rage) * damp(0.8, dt);
    this.swirl += ((0.62 + this.stage * 0.2) - this.swirl) * damp(0.5, dt);
    this.swirlR += ((48 + this.stage * 18) - this.swirlR) * damp(0.4, dt);
    // the maelstrom drags her toward the beast once it rages
    if (this.stage === 2 && this.head !== 'up') {
      const dx = this.body.x - p.pos.x;
      const dz = this.body.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 20 && d < 140) {
        const pull = 1.6 * dt * (1 - d / 140);
        p.drift.x += (dx / d) * pull;
        p.drift.y += (dz / d) * pull;
      }
    }
    // the body lurks off her quarter, keeping pace beneath the sea
    if (this.head === 'down') {
      this.bodyAz += dt * 0.07;
      const tx = p.pos.x + Math.sin(this.bodyAz) * LURK;
      const tz = p.pos.z + Math.cos(this.bodyAz) * LURK;
      const dx = tx - this.body.x;
      const dz = tz - this.body.z;
      const d = Math.hypot(dx, dz);
      const sp = Math.min(d, 13 * dt);
      if (d > 0.01) {
        this.body.x += (dx / d) * sp;
        this.body.z += (dz / d) * sp;
      }
    }
    // left far behind: it gives the chase up
    const far = Math.hypot(p.pos.x - this.body.x, p.pos.z - this.body.z);
    this.lostT = far > 160 ? this.lostT + dt : 0;
    if (this.lostT > 12) {
      this.leave();
      return;
    }
    // keep enough arms in the fight
    const want = ACTIVE[this.stage];
    let up = 0;
    for (const a of this.arms) if (!a.crown && a.state !== 'down') up++;
    for (const a of this.arms) {
      if (a.crown || a.state !== 'down') continue;
      a.regrow -= dt;
      if (up < want && a.regrow <= 0) {
        this.raise(a, p, rand(0.42, 0.72), 0, world);
        up++;
      }
    }
    // the head surfaces after enough arms are beaten, or now and then regardless
    this.headTimer -= dt;
    if (this.head === 'down' && (this.beaten >= 2 || this.headTimer <= 0)) this.surfaceHead(p, world);
    if (this.head === 'up' && this.headT > 13) this.diveHead();
    // attacks
    this.grabCool -= dt;
    this.attackT -= dt;
    if (this.attackT <= 0) {
      const gap = ATTACK_GAP[this.stage] * (this.head === 'up' ? 1.45 : 1);
      this.attackT = gap * rand(0.75, 1.25);
      this.attack(p, world);
    }
  }

  private updateDying(dt: number, world: World) {
    const t = this.t;
    this.pallor = smoothstep(0.5, 4.5, t);
    this.rage = Math.max(0, this.rage - dt * 0.5);
    this.swirl = t < 1.8 ? this.swirl : Math.max(0, this.swirl - dt * 0.4);
    // the arms writhe a while longer, then sink for good
    if (t > 2.6 && t - dt <= 2.6) for (const a of this.arms) if (a.state !== 'down') this.setState(a, 'sink');
    if (t > 1.8 && t - dt <= 1.8) {
      // the maelstrom collapses: a great ring of white water rolls out
      const x = this.body.x, z = this.body.z;
      for (let i = 0; i < 3; i++) world.wake.stamp(x, z, 14 + i * 9, 1.2 - i * 0.3, true);
      world.wake.push(x, z, 18, -1.6);
      this.inkBurst(world, x, z, 2.2);
      world.onShake(0.8, this.body);
    }
    if (t > 3.6 && !this.dropped) {
      this.dropped = true;
      this.onDefeated(new THREE.Vector3(this.body.x, 0, this.body.z));
    }
    if (t > 9.5) {
      this.phase = 'off';
      this.reset();
      this.onGone(true);
    }
  }

  // ---------------------------------------------------------------- head

  private surfaceHead(p: Ship, world: World) {
    this.head = 'up';
    this.headT = 0;
    this.beaten = 0;
    // it rises where it lurks, turned to face her
    const dx = p.pos.x - this.body.x;
    const dz = p.pos.z - this.body.z;
    this.headYaw = Math.atan2(dx, dz);
    // never through an island
    if (world.terrain.heightAt(this.body.x, this.body.z) > -10) {
      this.headTimer = 6;
      this.head = 'down';
      return;
    }
    this.onHead(true);
    // its crown of short arms writhes up on either side
    for (const a of this.arms) {
      if (!a.crown) continue;
      const side = a.i === 6 ? 1 : -1;
      const h = this.headYaw + side * 1.05;
      a.ax = this.body.x + Math.sin(h) * 10;
      a.az = this.body.z + Math.cos(h) * 10;
      a.phi = h;
      a.burst = false;
      this.setState(a, 'rise');
      a.hp = a.maxHp;
    }
  }

  private diveHead() {
    if (this.head !== 'up') return;
    this.head = 'dive';
    this.headT = 0;
    this.headTimer = [28, 24, 19][this.stage];
    this.onHead(false);
    for (const a of this.arms) if (a.crown && a.state !== 'down') this.setState(a, 'sink');
  }

  private updateHead(dt: number, world: World, p: Ship | null) {
    this.headT += dt;
    const dying = this.phase === 'dying';
    let ty = DEEP;
    if (this.phase === 'omen') ty = lerp(DEEP + 3, -12, smoothstep(0.2, 0.75, this.t / this.omenLen));
    if (this.head === 'up') ty = SURFACED;
    if (dying) ty = this.t < 4.5 ? SURFACED + 0.6 : SURFACED - (this.t - 4.5) * 4.2;
    if (this.phase === 'leave' && this.head !== 'up') ty = DEEP - 12;
    const was = this.headY;
    // a great heave up through the surface, a slow sink back
    const rate = ty > this.headY ? (this.head === 'up' ? 1.1 : 0.6) : this.head === 'dive' ? 0.7 : 0.5;
    this.headY += (ty - this.headY) * damp(rate, dt);
    if (this.head === 'dive' && this.headY < DEEP + 1) this.head = 'down';
    const wy = world.waterHeight(this.body.x, this.body.z);
    // breaking the surface: water sheets off it
    if (was < wy - 3 && this.headY >= wy - 3 && ty > was) {
      world.particles.splash(new THREE.Vector3(this.body.x, wy, this.body.z), 3.2);
      for (let i = 0; i < 4; i++) world.wake.stamp(this.body.x, this.body.z, 8 + i * 5, 0.9 - i * 0.15, true);
      world.wake.push(this.body.x, this.body.z, 10, 1.2);
      const [vol, pan, d] = world.soundAt(this.body);
      world.audio.krakenRise(vol, pan, d, 1.3);
      if (!dying) this.roar(world, 0.9, 1.2);
    }
    if (this.headY > wy - 6 && this.headY < wy + 6) {
      this.fxT += dt * (this.headY > wy - 2 ? 26 : 8);
      while (this.fxT > 1) {
        this.fxT -= 1;
        const a = Math.random() * TAU;
        const r = rand(4, 8);
        const x = this.body.x + Math.cos(a) * r;
        const z = this.body.z + Math.sin(a) * r;
        world.particles.emit({
          x, y: this.headY + rand(1, 9), z, vx: Math.cos(a) * rand(0.5, 2), vy: rand(-1, 1), vz: Math.sin(a) * rand(0.5, 2),
          life: rand(0.7, 1.3), size: rand(0.2, 0.5), sizeEnd: 0.12, color: [1.25, 1.35, 1.4], alpha: 0.8, grav: 13, kind: 0, fadeIn: 0.02,
        });
        if (Math.random() < 0.3) world.wake.stamp(x, z, rand(1.5, 3), 0.35);
      }
    }
    // face the prey; tilt back and sway as it breathes
    if (p && !dying) {
      const want = Math.atan2(p.pos.x - this.body.x, p.pos.z - this.body.z);
      this.headYaw += angleDelta(this.headYaw, want) * damp(this.head === 'up' ? 0.9 : 0.4, dt);
    }
    const tt = world.time;
    const roaring = this.roarT >= 0 && this.roarT < 2.4;
    if (this.roarT >= 0) this.roarT += dt;
    const breath = Math.sin(tt * 0.9) * 0.5 + (roaring ? Math.sin(this.roarT * 9) * 0.4 : 0);
    this.headPitch = -0.18 + Math.sin(tt * 0.45) * 0.05 + (roaring ? -0.2 * Math.sin(Math.min(1, this.roarT / 2.4) * Math.PI) : 0) + (dying ? smoothstep(4.5, 9, this.t) * -0.7 : 0);
    this.headRoll = Math.sin(tt * 0.33) * 0.05 + (dying ? smoothstep(3, 9, this.t) * 0.35 : 0);
    this.headFlash = Math.max(0, this.headFlash - dt * 4);
    this.view.setHead(this.body.x, this.headY, this.body.z, this.headYaw, this.headPitch, this.headRoll, breath, this.rage + this.headFlash * 0.5, this.pallor, this.headFlash);
    // eyes: watch her, blink now and then, close as it dies
    this.blinkT -= dt;
    if (this.blinkT < 0) this.blinkT = rand(2.5, 6);
    const blink = this.blinkT < 0.18 ? 1 - Math.sin((this.blinkT / 0.18) * Math.PI) : 1;
    this.lid += ((dying ? 1 - smoothstep(3, 6, this.t) : 1) * blink - this.lid) * damp(18, dt);
    if (p) {
      this.headRoot(_v);
      const lx = p.pos.x - _v.x, lz = p.pos.z - _v.z;
      const rel = angleDelta(this.headYaw, Math.atan2(lx, lz));
      this.gaze.x += (clamp(-rel, -1, 1) - this.gaze.x) * damp(3, dt);
      this.gaze.y += (-0.4 - this.gaze.y) * damp(3, dt);
    }
    this.view.setGaze(this.gaze.x, this.gaze.y, this.lid, clamp(0.25 + this.rage * 0.5 + (roaring ? 0.4 : 0) + this.pallor, 0, 1));
  }

  private headRoot(out: THREE.Vector3) {
    return out.set(this.body.x, this.headY, this.body.z);
  }

  private roar(world: World, big: number, delay = 0) {
    this.roarT = 0;
    const [vol, pan, d] = world.soundAt(this.body);
    world.audio.krakenRoar(Math.max(vol, 0.55) * big, pan * 0.5, d, delay, this.stage);
    world.onShake(0.45 * big, this.body);
  }

  private inkBurst(world: World, x: number, z: number, scale: number) {
    this.ink = Math.min(1.5, this.ink + 0.3 * scale);
    for (let i = 0; i < 10 * scale; i++) {
      const a = Math.random() * TAU;
      const r = Math.random() * 5 * scale;
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      world.particles.emit({
        x: px, y: world.waterHeight(px, pz) + 0.2, z: pz, vx: Math.cos(a) * rand(1, 4) * scale, vy: rand(0, 0.4), vz: Math.sin(a) * rand(1, 4) * scale,
        life: rand(5, 9), size: rand(3, 5) * scale, sizeEnd: rand(9, 15) * scale, color: [0.05, 0.015, 0.07], colorEnd: [0.1, 0.05, 0.12],
        alpha: 0.75, drag: 1.4, grav: 0, spin: rand(-0.2, 0.2), kind: 1, fadeIn: 0.15,
      });
    }
  }

  // ---------------------------------------------------------------- arms

  private setState(a: Arm, s: ArmState, dur = 0) {
    a.state = s;
    a.t = 0;
    a.dur = dur;
  }

  /** Plants an arm in the sea near her (at `reach` of its length) and sends it up, `delay` seconds from now. */
  private raise(a: Arm, p: Ship, reach: number, delay: number, world: World) {
    const spot = this.pickAnchor(a, p, reach, world);
    a.ax = spot[0];
    a.az = spot[1];
    a.phi = Math.atan2(p.pos.x - a.ax, p.pos.z - a.az);
    a.hp = a.maxHp;
    a.burn = 0;
    a.wrap = 0;
    a.flat = 0;
    a.lean0 = 0;
    a.lean = 0;
    a.curl = 0;
    a.burst = false;
    this.setState(a, 'rise');
    a.t = -delay;
  }

  private pickAnchor(a: Arm, p: Ship, reach: number, world: World): [number, number] {
    let best: [number, number] = [p.pos.x + a.L * reach, p.pos.z];
    let bestScore = -Infinity;
    const minD = p.cls.length * 0.5 + a.R0 + 4;
    for (let k = 0; k < 24; k++) {
      // most often ahead of her, where she's sailing into
      const ahead = Math.random() < 0.55;
      const ang = ahead ? p.heading + rand(-1.3, 1.3) : Math.random() * TAU;
      const d = Math.max(minD, a.L * reach * rand(0.85, 1.15));
      const lead = Math.min(p.speed, 12) * 1.6;
      const x = p.pos.x + Math.sin(ang) * d + Math.sin(p.heading) * lead;
      const z = p.pos.z + Math.cos(ang) * d + Math.cos(p.heading) * lead;
      if (world.terrain.heightAt(x, z) > -7) continue;
      let score = Math.random();
      for (const o of this.arms) {
        if (o === a || o.state === 'down' || o.crown) continue;
        const od = Math.hypot(o.ax - x, o.az - z);
        if (od < 14) score -= (14 - od) * 0.4;
      }
      if (score > bestScore) {
        bestScore = score;
        best = [x, z];
      }
    }
    return best;
  }

  private attack(p: Ship, world: World) {
    const busy = this.arms.filter((a) => a.state === 'rear' || a.state === 'strike' || a.state === 'reach').length;
    if (busy >= (this.stage === 0 ? 1 : 2)) return;
    const ready = this.arms.filter((a) => !a.crown && a.state === 'idle' && a.t > 0.8);
    if (!ready.length) return;
    const grabbing = this.arms.some((a) => a.state === 'grab' || a.state === 'reach');
    const dist = (a: Arm) => Math.hypot(p.pos.x - a.ax, p.pos.z - a.az);
    // the least recently used arm that can reach her
    ready.sort((x, y) => x.used - y.used);
    if (!grabbing && this.grabCool <= 0 && Math.random() < GRAB_ODDS[this.stage]) {
      const g = ready.find((a) => dist(a) < a.L * 0.7 && dist(a) > p.cls.beam);
      if (g) {
        this.grabCool = 16 - this.stage * 3;
        g.used = world.time;
        this.setState(g, 'reach', 1.15);
        const [vol, pan, d] = world.soundAt(p.pos);
        world.audio.krakenWhip(vol, pan, d, 0.7);
        return;
      }
    }
    const s = ready.find((a) => dist(a) < a.L * 0.95 && dist(a) > 5);
    if (!s) {
      // nothing in reach: the nearest-to-useless arm sinks to come up beside her
      const far = ready.reduce((m, a) => (dist(a) > dist(m) ? a : m), ready[0]);
      if (dist(far) > far.L * 0.95) this.setState(far, 'sink');
      this.attackT = Math.min(this.attackT, 1.2);
      return;
    }
    s.used = world.time;
    s.locked = false;
    this.setState(s, 'rear', REAR_TIME[this.stage] * rand(0.92, 1.08));
    // raging, it sometimes brings a second arm down right after the first
    if (this.stage === 2 && Math.random() < 0.45) {
      const s2 = ready.find((a) => a !== s && dist(a) < a.L * 0.95 && dist(a) > 5);
      if (s2) {
        s2.used = world.time;
        s2.locked = false;
        this.setState(s2, 'rear', REAR_TIME[this.stage] * 1.35);
      }
    }
  }

  private updateArm(a: Arm, dt: number, world: World, p: Ship | null) {
    a.t += dt;
    if (a.t < 0) return;
    a.flash = Math.max(0, a.flash - dt * 3.5);
    // flinch: a spring knocked by each hit
    a.flinchV += (-a.flinch * 60 - a.flinchV * 9) * dt;
    a.flinch += a.flinchV * dt;
    const tt = world.time;
    const stg = this.stage;
    let tLean0 = 0.12, tLean = 0.38, tCurl = 1.7, tSway = 0.28, rate = 2.2;
    let tOut = 1;
    // turn toward her (the planted root stays put)
    if (p && a.state !== 'strike' && a.state !== 'lie' && !(a.state === 'rear' && a.locked) && a.state !== 'grab' && a.state !== 'recoil') {
      const want = a.crown ? a.phi : Math.atan2(a.aimX - a.ax, a.aimZ - a.az);
      if (!a.crown) {
        const lead = a.state === 'rear' ? Math.max(0, a.dur - a.t) + STRIKE_TIME : 0.6;
        a.aimX = p.pos.x + p.vel.x * lead * 0.85;
        a.aimZ = p.pos.z + p.vel.z * lead * 0.85;
      }
      a.phi += angleDelta(a.phi, want) * damp(a.state === 'rear' ? 5 : 1.6, dt);
    }
    a.arousal += ((a.state === 'rear' || a.state === 'grab' || a.state === 'recoil' ? 1 : this.rage * 0.6) - a.arousal) * damp(3, dt);
    switch (a.state) {
      case 'down':
        tOut = 0;
        break;
      case 'rise': {
        // bursting up: a straight spear first, then the tip hooks over
        if (!a.burst) {
          a.burst = true;
          this.eruption(a, world);
        }
        const k = clamp(a.t / 1.7, 0, 1);
        tOut = 1;
        tCurl = 1.7 * smoothstep(0.4, 1, k);
        tLean = 0.38 * k;
        rate = 1.6;
        a.out += (1 - a.out) * damp(2.4, dt);
        if (a.t > 1.8) this.setState(a, 'idle');
        if (a.out < 0.98 && Math.random() < dt * 30) this.drip(a, world);
        break;
      }
      case 'idle':
        tSway = 0.3 + stg * 0.06;
        // out of reach of her now: sink to come up somewhere nearer
        if (p && !a.crown && a.t > 2 && Math.hypot(p.pos.x - a.ax, p.pos.z - a.az) > a.L * 1.02) this.setState(a, 'sink');
        if (p && !a.crown && Math.hypot(p.pos.x - a.ax, p.pos.z - a.az) < p.cls.beam * 0.5 + a.R0) this.setState(a, 'sink');
        break;
      case 'rear': {
        // rearing back, tip coiled tight, trembling with the effort
        const k = clamp(a.t / a.dur, 0, 1);
        tLean0 = 0.05;
        tLean = lerp(0.38, -0.95, ease(k));
        tCurl = lerp(1.7, 2.9, k);
        tSway = 0.08;
        rate = 4;
        a.flinch += Math.sin(tt * 47 + a.seed) * 0.0035 * k;
        if (!a.locked && a.t > a.dur - 0.32) a.locked = true;
        if (a.t >= a.dur) {
          this.setState(a, 'strike', STRIKE_TIME);
          const [vol, pan, d] = world.soundAt(_v.set(a.ax, 4, a.az));
          world.audio.krakenWhip(vol, pan, d, 1);
        }
        break;
      }
      case 'strike': {
        // the whip: accelerating all the way down
        const k = clamp(a.t / a.dur, 0, 1);
        a.flat = k * k;
        tLean = -0.95;
        tCurl = lerp(2.9, 0.8, k);
        tSway = 0;
        rate = 12;
        if (k >= 1) {
          a.flat = 1;
          this.impact(a, world, p);
          this.setState(a, 'lie', 1.7 - stg * 0.2);
        }
        break;
      }
      case 'lie':
        a.flat = 1;
        tSway = 0.05;
        if (a.t >= a.dur) this.setState(a, 'lift', 1.1);
        break;
      case 'lift': {
        const k = clamp(a.t / a.dur, 0, 1);
        a.flat = 1 - ease(k);
        if (k >= 1) this.setState(a, 'idle');
        break;
      }
      case 'reach': {
        // it coils for her hull; at full speed she can still slip it
        if (!p) {
          this.setState(a, 'lift', 0.8);
          break;
        }
        const k = clamp(a.t / a.dur, 0, 1);
        this.buildWrap(a, p, world);
        a.wrap = ease(k) * 0.92;
        if (k >= 1) {
          if (p.speed > p.cls.maxSpeed * 0.72) {
            // missed: she sailed out of its coils
            a.wrap = 0.6;
            this.setState(a, 'sink');
            world.particles.splash(_v.set(p.pos.x, world.waterHeight(p.pos.x, p.pos.z), p.pos.z), 1.2);
          } else {
            a.grabDealt = 0;
            this.setState(a, 'grab', 9);
            p.held = 1;
            p.kickRoll(this.sideOf(a, p) * 0.12);
            world.onShake(0.6, p.pos);
            const [vol, pan, d] = world.soundAt(p.pos);
            world.audio.crunch(vol, pan, d, 1);
            this.onGrab(true, false);
          }
        }
        break;
      }
      case 'grab': {
        if (!p) {
          this.release(a, false);
          break;
        }
        this.buildWrap(a, p, world);
        a.wrap += (1 - a.wrap) * damp(6, dt);
        p.held = 1;
        // the coils tighten and ease
        const squeeze = 0.94 + 0.06 * Math.sin(tt * 3.2);
        for (let i = 0; i < SPINE; i++) a.girth[i] = i > SPINE * 0.35 ? squeeze : 1;
        p.kickRoll(this.sideOf(a, p) * Math.sin(tt * 2.1) * 0.004);
        // crushing: a steady toll on the hull, in ticks
        a.tick += dt;
        if (a.tick > 0.7) {
          a.tick = 0;
          const dmg = p.maxHp * CRUSH_RATE[stg] * 0.7 * (1 - p.cls.armor * 0.4);
          this.onPlayerHit(dmg, p.pos.clone().setY(p.root.position.y + p.cls.freeboard + 1), 'crush');
          const [vol, pan, d] = world.soundAt(p.pos);
          if (Math.random() < 0.6) world.audio.crunch(vol * 0.7, pan, d, 0.5);
          world.particles.woodHit(_v.set(p.pos.x + rand(-2, 2), p.root.position.y + p.cls.freeboard, p.pos.z + rand(-2, 2)), _w.set(0, 1, 0));
        }
        if (a.grabDealt >= a.maxHp * 0.38) this.release(a, true);
        else if (a.t >= a.dur) {
          // held too long: a last, splintering squeeze before it lets go
          this.onPlayerHit(p.maxHp * 0.08, p.pos.clone().setY(p.root.position.y + 2), 'crush');
          world.onShake(0.9, p.pos);
          this.release(a, false);
        }
        break;
      }
      case 'recoil': {
        // beaten: it thrashes, spurts ink and drops away
        tSway = 1.1;
        tLean = 0.6 * Math.sin(a.t * 9 + a.seed);
        tCurl = 3.2;
        rate = 6;
        a.flat = Math.max(0, a.flat - dt * 2);
        a.wrap = Math.max(0, a.wrap - dt * 2.5);
        a.flash = Math.max(a.flash, 0.4);
        if (a.t > 0.9) {
          this.setState(a, 'sink');
          a.regrow = rand(9, 14) - stg * 2.5;
        }
        break;
      }
      case 'sink':
        tOut = 0;
        tCurl = 0.9;
        a.flat = Math.max(0, a.flat - dt * 2);
        a.wrap = Math.max(0, a.wrap - dt * 2);
        a.out -= dt * (a.crown ? 0.7 : 0.9);
        if (a.out <= 0) {
          a.out = 0;
          this.setState(a, 'down');
          if (a.regrow <= 0) a.regrow = rand(0.3, 1.2);
          // its wake: the sea closes over it
          world.wake.stamp(a.ax, a.az, a.R0 * 3, 0.6, true);
        }
        break;
    }
    if (a.state !== 'grab') a.girth.fill(1);
    if (a.state !== 'sink' && a.state !== 'down' && a.state !== 'rise') a.out += (tOut - a.out) * damp(3, dt);
    a.lean0 += (tLean0 - a.lean0) * damp(rate, dt);
    a.lean += (tLean - a.lean) * damp(rate, dt);
    a.curl += (tCurl - a.curl) * damp(rate, dt);
    a.sway += (tSway - a.sway) * damp(2, dt);

    // fire shot: it burns where it stands above the water
    if (a.burn > 0) {
      a.burn -= dt * (1 + globalUniforms.uRain.value * 1.6);
      a.burnT += dt;
      if (a.burnT > 0.6 && a.state !== 'down') {
        a.burnT = 0;
        this.hurtArm(a, a.maxHp * 0.04, null, world, false, true);
      }
      if (Math.random() < dt * 14) {
        const k = (2 + Math.floor(Math.random() * (SPINE - 4))) * 3;
        if (a.pts[k + 1] > 0.5) world.particles.flame(_v.set(a.pts[k], a.pts[k + 1], a.pts[k + 2]), 0.9);
      }
    }

    if (a.state === 'down') {
      if (a.out <= 0) this.view.writeRest(a.i, a.ax, -400, a.az);
      return;
    }
    this.pose(a, tt, world);
    // where it stands in the sea it churns a collar of foam
    if (a.out > 0.15 && Math.random() < dt * 9) {
      const wx = a.ax + Math.sin(a.phi) * 0.5;
      const wz = a.az + Math.cos(a.phi) * 0.5;
      world.wake.stamp(wx, wz, a.R0 * rand(1.4, 2.2), 0.22);
    }
    this.view.writeArm(a.i, a.pts, a.nrm, a.girth, Math.min(1, a.flash), a.seed, a.arousal, this.pallor);
  }

  /** Port (+1) or starboard (-1) of her the arm stands on. */
  private sideOf(a: Arm, p: Ship) {
    return Math.sign(angleDelta(p.heading, Math.atan2(a.ax - p.pos.x, a.az - p.pos.z))) || 1;
  }

  private release(a: Arm, freed: boolean) {
    if (this.prey) this.prey.held = 0;
    this.onGrab(false, freed);
    if (a.hp <= 0) return;
    // shot loose: it recoils and sinks; let go: it slides back down
    if (freed) this.setState(a, 'recoil');
    else this.setState(a, 'sink');
    a.regrow = rand(4, 7);
  }

  /** The arm bursts from the sea: spray, a crater in the swell and a rush of water. */
  private eruption(a: Arm, world: World) {
    const y = world.waterHeight(a.ax, a.az);
    _v.set(a.ax, y, a.az);
    world.particles.splash(_v, a.crown ? 1.6 : 2.4);
    world.wake.stamp(a.ax, a.az, a.R0 * 4, 1.1);
    world.wake.stamp(a.ax, a.az, a.R0 * 7, 0.7, true);
    world.wake.push(a.ax, a.az, a.R0 * 3, 0.9);
    const [vol, pan, d] = world.soundAt(_v);
    world.audio.krakenRise(vol, pan, d, a.crown ? 0.8 : 1);
  }

  /** Water streaming off a rising arm. */
  private drip(a: Arm, world: World) {
    const k = (Math.floor(Math.random() * (SPINE - 2)) + 1) * 3;
    const y = a.pts[k + 1];
    if (y < 0.5) return;
    world.particles.emit({
      x: a.pts[k] + rand(-1, 1), y, z: a.pts[k + 2] + rand(-1, 1), vx: rand(-1, 1), vy: rand(-1, 0.5), vz: rand(-1, 1),
      life: rand(0.8, 1.5), size: rand(0.25, 0.5), sizeEnd: 0.15, color: [1.2, 1.3, 1.35], alpha: 0.75, grav: 14, kind: 0, fadeIn: 0.02,
    });
  }

  /** The whip lands: across the sea from root to tip, and on her if she's under it. */
  private impact(a: Arm, world: World, p: Ship | null) {
    const n = SPINE;
    for (let i = Math.round(n * 0.3); i < n; i += 4) {
      const x = a.pts[i * 3], z = a.pts[i * 3 + 2];
      if (world.terrain.heightAt(x, z) > 0.5) continue;
      const y = world.waterHeight(x, z);
      world.particles.splash(_v.set(x, y, z), 1.5 + (1 - i / n) * 1.2);
      world.wake.stamp(x, z, a.R0 * 2.4, 1.2);
      world.wake.push(x, z, a.R0 * 1.6, -0.9);
    }
    const tip = (n - 1) * 3;
    world.wake.stamp(a.pts[tip], a.pts[tip + 2], 9, 0.8, true);
    const mid = Math.round(n * 0.6) * 3;
    _a.set(a.pts[mid], 0, a.pts[mid + 2]);
    const [vol, pan, d] = world.soundAt(_a);
    world.audio.krakenSlam(vol, pan, d);
    world.onShake(0.9 * vol + 0.2, _a);
    if (!p || !p.alive) return;
    // her hull as a segment down the keel against the arm's length on the water
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    const hl = p.cls.length * 0.45;
    let best = Infinity;
    let at = 0;
    for (let i = Math.round(n * 0.2); i < n - 1; i++) {
      _a.set(a.pts[i * 3], 0, a.pts[i * 3 + 2]);
      _b.set(a.pts[i * 3 + 3], 0, a.pts[i * 3 + 5]);
      _v.set(p.pos.x - fx * hl, 0, p.pos.z - fz * hl);
      _w.set(p.pos.x + fx * hl, 0, p.pos.z + fz * hl);
      const [dd] = segSeg(_v, _w, _a, _b);
      const r = a.R0 * armProfile(i / (n - 1));
      const gap = dd - r - p.cls.beam * 0.5;
      if (gap < best) {
        best = gap;
        at = i;
      }
    }
    if (best < 0.4) {
      const dmg = p.maxHp * SLAM_HIT[this.stage] * (1 - p.cls.armor * 0.4);
      this.onPlayerHit(dmg, _v.set(a.pts[at * 3], p.root.position.y + p.cls.freeboard, a.pts[at * 3 + 2]).clone(), 'slam');
      p.kickRoll(this.sideOf(a, p) * -0.2);
      // knocked bodily sideways through the water
      const ox = Math.sin(a.phi), oz = Math.cos(a.phi);
      p.drift.x += ox * 3.5;
      p.drift.y += oz * 3.5;
      world.particles.splash(_v.set(p.pos.x, world.waterHeight(p.pos.x, p.pos.z), p.pos.z), 2);
    } else if (best < 5) {
      // a near miss: the wave of it rocks her hard
      p.kickRoll(this.sideOf(a, p) * -0.09);
    }
  }

  /**
   * Poses an arm as a chain of equal links from its root: each link turns a
   * little further toward the prey along the arm (a gentle lean low down, a
   * hooked curl at the tip), plus a slow side-to-side sway and a flinch. The
   * lying pose (after a slam) bends over flat across the water instead, and
   * a grab blends toward a coil round her hull.
   */
  private pose(a: Arm, tt: number, world: World) {
    const flat = a.flat;
    const idleBase = -(4.5 + (1 - a.out) * a.L * 1.06);
    // the flat run lies on the sea with its upper half showing
    const lieBase = -a.lieRise + a.R0 * 0.25;
    const by = lerp(idleBase, lieBase, flat) + world.waterHeight(a.ax, a.az) * 0.6;
    this.turtle(a, a.ax, by, a.az, tt, flat, a.flinch);
    if (a.wrap > 0.001) {
      const w = a.wrap;
      for (let i = 0; i < SPINE * 3; i++) {
        a.pts[i] = lerp(a.pts[i], a.wrapPts[i], w);
        a.nrm[i] = lerp(a.nrm[i], a.wrapNrm[i], w);
      }
    }
  }

  private turtle(a: Arm, x: number, y: number, z: number, tt: number, flat: number, flinch: number) {
    const ds = a.L / (SPINE - 1);
    const hx = Math.sin(a.phi), hz = Math.cos(a.phi);
    const sx = hz, sz = -hx;
    let px = x, py = y, pz = z;
    const pts = a.pts;
    const nrm = a.nrm;
    const ph = a.seed;
    for (let k = 0; k < SPINE; k++) {
      pts[k * 3] = px;
      pts[k * 3 + 1] = py;
      pts[k * 3 + 2] = pz;
      const v = (k + 0.5) / (SPINE - 1);
      // standing: a lean toward her, a hooked tip and a wave travelling up the arm
      const sw = a.sway;
      const th0 = a.lean0 + a.lean * Math.pow(v, 1.2) + a.curl * v * v * v
        + Math.sin(tt * 1.1 + ph - v * 3.2) * sw * 0.6 * v - flinch * v;
      // lying: up out of the water, then flat along the sea to a lifted tip
      const th1 = (Math.PI / 2) * smoothstep(0, 0.24, v) + 0.5 * Math.pow(v, 6) + Math.sin(tt * 2 + ph - v * 6) * 0.04 * v;
      const th = lerp(th0, th1, flat);
      const ps = Math.sin(tt * 0.8 + ph * 1.7 - v * 2.6) * sw * 0.7 * v * (1 - flat * 0.9);
      const st = Math.sin(th), ct = Math.cos(th);
      const cp = Math.cos(ps), sp = Math.sin(ps);
      const dx = hx * st * cp + sx * sp;
      const dy = ct * cp;
      const dz = hz * st * cp + sz * sp;
      // the sucker side: toward the inside of the bend (toward her, or down onto the sea)
      let nx = hx * ct, ny = -st, nz = hz * ct;
      const dn = nx * dx + ny * dy + nz * dz;
      nx -= dx * dn;
      ny -= dy * dn;
      nz -= dz * dn;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nrm[k * 3] = nx / nl;
      nrm[k * 3 + 1] = ny / nl;
      nrm[k * 3 + 2] = nz / nl;
      px += dx * ds;
      py += dy * ds;
      pz += dz * ds;
    }
  }

  /**
   * The coil: up out of the sea beside her, over the rail, and round her hull
   * amidships (between the masts), suckers clamped to the planking. Built in
   * her own frame so it rides every roll and pitch of the hull.
   */
  private buildWrap(a: Arm, p: Ship, world: World) {
    const side = this.sideOf(a, p);
    const shape = p.model.shape;
    // the gap between masts nearest midships
    let tc = 0.5;
    let bestGap = -1;
    for (let t = 0.3; t <= 0.7; t += 0.02) {
      let g = Infinity;
      for (const m of p.cls.masts) g = Math.min(g, Math.abs(m.t - t));
      if (g > bestGap) {
        bestGap = g;
        tc = t;
      }
    }
    const zc = (tc - 0.5) * p.cls.length;
    const top = shape.top(tc);
    const bot = Math.max(shape.bottom(tc), -p.cls.draft);
    const hw = shape.halfWidthAtY(tc, Math.max(0, top - 0.6));
    const r = a.R0 * 0.55;
    const yc = (top + bot) * 0.5;
    const ra = hw + r * 0.9;
    const rb = (top - bot) * 0.5 + r * 0.9;
    // path in her frame: root out in the sea, rising to the rail, then round and round
    const path: THREE.Vector3[] = [];
    p.root.updateMatrixWorld();
    _inv.copy(p.model.root.matrixWorld).invert();
    _loc.set(a.ax, -6, a.az).applyMatrix4(_inv);
    const root = _loc.clone();
    const start = new THREE.Vector3(side * ra, yc, zc);
    const n0 = 10;
    for (let i = 0; i < n0; i++) {
      const k = i / n0;
      // a rising arc from the root to her side
      path.push(new THREE.Vector3(lerp(root.x, start.x, k), lerp(root.y, start.y, k) + Math.sin(k * Math.PI) * 4, lerp(root.z, start.z, k)));
    }
    const turns = 1.25;
    const nc = 40;
    for (let i = 0; i <= nc; i++) {
      const th = (i / nc) * turns * TAU;
      // from her side up over the deck and down the far side, under the keel and round again
      const cx = Math.cos(th) * ra * side;
      const cy = yc + Math.sin(th) * rb;
      path.push(new THREE.Vector3(cx, cy, zc + (i / nc) * 2.2 * side));
    }
    // resample to equal links along the path
    const cum = [0];
    for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + path[i].distanceTo(path[i - 1]));
    const total = cum[cum.length - 1];
    const L = Math.min(a.L, total);
    const mw = p.model.root.matrixWorld;
    let j = 0;
    for (let k = 0; k < SPINE; k++) {
      const s = (k / (SPINE - 1)) * L;
      while (j < cum.length - 2 && cum[j + 1] < s) j++;
      const f = clamp((s - cum[j]) / Math.max(cum[j + 1] - cum[j], 1e-4), 0, 1);
      _v.lerpVectors(path[j], path[j + 1], f);
      // suckers face the hull: toward the coil's axis
      _w.set(-_v.x, -(_v.y - yc), 0).normalize();
      if (k < n0 * 0.6) _w.set(0, 1, 0);
      _a.copy(_v).applyMatrix4(mw);
      a.wrapPts[k * 3] = _a.x;
      a.wrapPts[k * 3 + 1] = _a.y;
      a.wrapPts[k * 3 + 2] = _a.z;
      _w.transformDirection(mw);
      a.wrapNrm[k * 3] = _w.x;
      a.wrapNrm[k * 3 + 1] = _w.y;
      a.wrapNrm[k * 3 + 2] = _w.z;
    }
    void world;
  }

  // ---------------------------------------------------------------- warnings on the sea

  private drawMarks(world: World, p: Ship | null) {
    const v = this.view;
    v.beginMarks();
    for (const a of this.arms) {
      if (a.state === 'rear' || (a.state === 'strike' && a.t < a.dur)) {
        const k = a.state === 'rear' ? clamp(a.t / a.dur, 0, 1) : 1;
        const len = a.L * 0.98;
        v.strip(a.ax, world.waterHeight(a.ax, a.az) + 0.25, a.az, a.phi, len, a.R0 * 2.6, smoothstep(0, 0.35, k), a.locked ? 1 : k * 0.6, a.seed);
      }
      if (a.state === 'reach' && p) v.ring(p.pos.x, world.waterHeight(p.pos.x, p.pos.z) + 0.3, p.pos.z, p.cls.length * 0.75, smoothstep(0, 0.4, a.t / a.dur));
    }
    v.endMarks();
  }

  // ---------------------------------------------------------------- being hit

  /** Tests a ball's flight against every arm above the water and the head. True if it struck. */
  strike(b: StrikeBall, world: World): boolean {
    if (this.phase !== 'fight' && this.phase !== 'dying') return false;
    if (b.owner.team !== 'player' && b.owner !== this.prey) return false;
    for (const a of this.arms) {
      if (a.state === 'down' || a.out < 0.25) continue;
      const dx = b.pos.x - a.ax, dz = b.pos.z - a.az;
      if (dx * dx + dz * dz > (a.L + 6) * (a.L + 6)) continue;
      for (let i = 0; i < SPINE - 1; i++) {
        const y0 = a.pts[i * 3 + 1], y1 = a.pts[i * 3 + 4];
        if (y0 < -1 && y1 < -1) continue;
        _a.set(a.pts[i * 3], y0, a.pts[i * 3 + 2]);
        _b.set(a.pts[i * 3 + 3], y1, a.pts[i * 3 + 5]);
        const [d, t] = segSeg(b.prev, b.pos, _a, _b);
        const r = a.R0 * armProfile((i + t) / (SPINE - 1)) * a.girth[i] + 0.3;
        if (d < r) {
          _v.lerpVectors(_a, _b, t);
          this.hitArm(a, b, _v, world);
          return true;
        }
      }
    }
    if (this.headY > -6) {
      const hr = this.view.headRoot;
      hr.updateMatrixWorld();
      _inv.copy(hr.matrixWorld).invert();
      _loc.copy(b.pos).applyMatrix4(_inv);
      const eyeX = EYE.x + 0.6, eyeY = EYE.y, eyeZ = EYE.z + 0.5;
      const ed = Math.min(Math.hypot(_loc.x - eyeX, _loc.y - eyeY, _loc.z - eyeZ), Math.hypot(_loc.x + eyeX, _loc.y - eyeY, _loc.z - eyeZ));
      const face = Math.hypot(_loc.x / 6.4, (_loc.y + 0.2) / 6.2, (_loc.z - 1.2) / 6.6);
      const mantle = Math.hypot(_loc.x / 5.4, (_loc.y - 6.5) / 5.6, (_loc.z + 3) / 5.4);
      if (ed < EYE.w + 0.7 || face < 1 || mantle < 1) {
        this.hitHead(b, b.pos.clone(), ed < EYE.w + 0.7, world);
        return true;
      }
    }
    return false;
  }

  /** An explosive shell's burst: every arm and the head near it take a share. */
  blast(at: THREE.Vector3, radius: number, damage: number, owner: Ship, world: World) {
    if (this.phase !== 'fight' || owner.team !== 'player') return;
    for (const a of this.arms) {
      if (a.state === 'down' || a.out < 0.25) continue;
      let best = Infinity;
      for (let i = 0; i < SPINE; i += 2) {
        if (a.pts[i * 3 + 1] < -1.5) continue;
        best = Math.min(best, Math.hypot(a.pts[i * 3] - at.x, a.pts[i * 3 + 1] - at.y, a.pts[i * 3 + 2] - at.z) - a.R0);
      }
      if (best < radius) this.hurtArm(a, damage * (0.35 + 0.65 * (1 - Math.max(0, best) / radius)), owner, world, true);
    }
    if (this.headY > -6) {
      const d = Math.hypot(at.x - this.body.x, at.z - this.body.z) - 6.5;
      if (d < radius) this.hurtHead(damage * VS.shell[1] * (0.35 + 0.65 * (1 - Math.max(0, d) / radius)), at.clone(), false, true, world);
    }
  }

  private hitArm(a: Arm, b: StrikeBall, at: THREE.Vector3, world: World) {
    const mul = VS[b.ammo][0] * (a.state === 'lie' ? 1.5 : 1);
    world.particles.fleshHit(at.clone(), b.ammo === 'fire');
    const [vol, pan, d] = world.soundAt(at);
    world.audio.krakenFlesh(vol, pan, d);
    if (b.ammo === 'shell') {
      world.particles.shellBurst(at.clone(), false, 1);
      world.audio.shell(vol, pan, d);
      this.blast(at, 7.5, b.damage * 1.7, b.owner, world);
    }
    if (b.ammo === 'fire') a.burn = Math.min(10, a.burn + 3);
    // knocked back from the blow
    a.flinchV += 0.9 + (b.ammo === 'chain' ? 0.8 : 0);
    this.hurtArm(a, b.damage * mul, b.owner, world, b.owner.team === 'player');
    if (Math.random() < 0.35) this.inkSpurt(world, at);
  }

  private inkSpurt(world: World, at: THREE.Vector3) {
    world.particles.emit({
      x: at.x, y: at.y, z: at.z, vx: rand(-2, 2), vy: rand(1, 3), vz: rand(-2, 2), life: rand(1.2, 2), size: rand(0.6, 1), sizeEnd: rand(2, 3.5),
      color: [0.08, 0.02, 0.1], colorEnd: [0.12, 0.06, 0.14], alpha: 0.7, drag: 1.4, grav: 4, kind: 1, fadeIn: 0.02,
    });
  }

  private hurtArm(a: Arm, dmg: number, by: Ship | null, world: World, mine: boolean, burn = false) {
    if (dmg <= 0 || this.phase !== 'fight') return;
    a.flash = Math.min(1.4, a.flash + (burn ? 0.15 : 0.7));
    if (a.state === 'grab') a.grabDealt += dmg;
    // a fair share of every wound reaches the body
    this.hp -= dmg * (a.crown ? 0.6 : 0.35);
    const pt = Math.round(SPINE * 0.5) * 3;
    this.tally(`a${a.i}`, dmg, _v.set(a.pts[pt], a.pts[pt + 1], a.pts[pt + 2]), false, mine || (by?.team === 'player'));
    if (!a.crown) {
      a.hp -= dmg;
      if (a.hp <= 0 && a.state !== 'recoil' && a.state !== 'sink' && a.state !== 'down') {
        a.hp = 0;
        if (a.state === 'grab') this.release(a, true);
        this.setState(a, 'recoil');
        this.beaten++;
        this.hp -= this.maxHp * 0.05;
        _w.set(a.ax, world.waterHeight(a.ax, a.az), a.az);
        this.inkBurst(world, a.ax, a.az, 1);
        const [vol, pan, d] = world.soundAt(_w);
        world.audio.krakenHurt(vol, pan, d, false);
        this.onArmBeaten(_w.clone());
      }
    }
    this.checkDeath(world);
  }

  private hitHead(b: StrikeBall, at: THREE.Vector3, eye: boolean, world: World) {
    world.particles.fleshHit(at.clone(), b.ammo === 'fire');
    const [vol, pan, d] = world.soundAt(at);
    world.audio.krakenFlesh(vol, pan, d);
    if (b.ammo === 'shell') {
      world.particles.shellBurst(at.clone(), false, 1.2);
      world.audio.shell(vol, pan, d);
    }
    const mul = VS[b.ammo][1] * (eye ? 2.2 : 1);
    this.hurtHead(b.damage * mul, at, eye, b.owner.team === 'player', world);
    if (eye) {
      // struck in the eye: it shrieks and the lid slams shut
      this.lid = 0;
      this.blinkT = 0.5;
      if (Math.random() < 0.5) world.audio.krakenHurt(Math.max(vol, 0.5), pan, d, true);
    }
  }

  private hurtHead(dmg: number, at: THREE.Vector3, crit: boolean, mine: boolean, world: World) {
    if (this.phase !== 'fight') return;
    this.hp -= dmg;
    this.headFlash = Math.min(1.5, this.headFlash + (crit ? 1 : 0.5));
    this.tally(crit ? 'eye' : 'head', dmg, at, crit, mine);
    this.checkDeath(world);
  }

  private checkDeath(world: World) {
    if (this.hp > 0 || this.phase !== 'fight') return;
    this.hp = 0;
    this.phase = 'dying';
    this.t = 0;
    if (this.prey) this.prey.held = 0;
    this.onGrab(false, true);
    // the head comes up for its last
    this.head = 'up';
    this.headT = 0;
    for (const a of this.arms) {
      if (a.state === 'down') continue;
      this.setState(a, 'recoil');
    }
    const [vol, pan, d] = world.soundAt(this.body);
    world.audio.krakenDeath(Math.max(vol, 0.6), pan * 0.5, d);
    world.onShake(1, this.body);
    for (const a of this.arms) a.regrow = 1e9;
  }

  private tally(key: string, dmg: number, at: THREE.Vector3, crit: boolean, mine: boolean) {
    const t = this.tallies.get(key);
    if (t) {
      t.dmg += dmg;
      t.crit ||= crit;
      t.mine ||= mine;
      t.at.copy(at);
    } else this.tallies.set(key, { dmg, crit, at: at.clone(), t: 0, mine });
  }

  private flushTallies(dt: number) {
    for (const [k, t] of this.tallies) {
      t.t += dt;
      if (t.t < 0.16) continue;
      this.tallies.delete(k);
      this.onHurt(t.dmg, t.at, t.crit, k === 'eye' ? 'eye' : k === 'head' ? 'head' : 'arm', t.mine);
    }
  }

  // ---------------------------------------------------------------- the guns' view

  /** Arms standing up out of the sea and the surfaced head, for the gunnery to lay on. */
  marks(out: KrakenMark[]): number {
    if (this.phase !== 'fight') return 0;
    let n = 0;
    for (const a of this.arms) {
      if (a.state === 'down' || a.state === 'sink' || a.state === 'recoil' || a.out < 0.6) continue;
      // a lying arm is marked where it lies; a standing one where it meets the sea
      const k = (a.flat > 0.5 ? Math.round(SPINE * 0.55) : 3) * 3;
      if (!out[n]) out[n] = { x: 0, z: 0, r: 0 };
      const m = out[n++];
      m.x = a.pts[k];
      m.z = a.pts[k + 2];
      m.r = a.R0 * 1.3;
    }
    if (this.headUp) {
      if (!out[n]) out[n] = { x: 0, z: 0, r: 0 };
      const m = out[n++];
      m.x = this.body.x + Math.sin(this.headYaw) * 3;
      m.z = this.body.z + Math.cos(this.headYaw) * 3;
      m.r = 7;
    }
    return n;
  }

  /** What the camera should keep in frame with her. */
  focus(out: THREE.Vector3): THREE.Vector3 | null {
    if (this.phase !== 'fight' && this.phase !== 'dying') return null;
    return out.set(this.body.x, 0, this.body.z);
  }

  /** Silhouette of the head in the head's frame (for tests and the farewell). */
  headWorld(out: THREE.Vector3) {
    _m.copy(this.view.headRoot.matrixWorld);
    return out.set(0, 0, 0).applyMatrix4(_m);
  }
}

