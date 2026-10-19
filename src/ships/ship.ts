import * as THREE from 'three';
import { angleDelta, clamp, damp, lerp } from '../core/noise';
import { World } from '../game/world';
import { ShipModel } from './shipModel';
import { Livery, ShipClass } from './shipTypes';

export type Team = 'player' | 'pirate';

interface PendingShot {
  at: number;
  muzzle: number;
  target: Ship | null;
}

const WIND_TABLE = [
  // relative angle (deg, 0 = running downwind) -> speed factor
  [0, 0.8],
  [40, 0.96],
  [90, 1.0],
  [120, 0.9],
  [145, 0.62],
  [165, 0.38],
  [180, 0.3],
];

export function windFactor(relDeg: number) {
  const a = Math.abs(relDeg);
  for (let i = 1; i < WIND_TABLE.length; i++) {
    if (a <= WIND_TABLE[i][0]) {
      const [a0, f0] = WIND_TABLE[i - 1];
      const [a1, f1] = WIND_TABLE[i];
      const t = (a - a0) / (a1 - a0);
      return lerp(f0, f1, t * t * (3 - 2 * t));
    }
  }
  return 0.3;
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _g = new THREE.Vector2();
let SHIP_ID = 0;

export class Ship {
  readonly id = ++SHIP_ID;
  readonly root = new THREE.Group();
  readonly model: ShipModel;
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  heading = 0;
  speed = 0;
  angVel = 0;
  rudder = 0;
  sailTarget = 0.5;
  sailLevel = 0.5;
  hp: number;
  alive = true;
  sinkT = 0;
  removed = false;
  reload = { port: 0, starboard: 0 };
  lastHit = -100;
  lastAttacker: Ship | null = null;
  burning = 0;
  gold = 0;
  kills = 0;
  anchored = false;
  /** World time each gun last fired, by muzzle index (crews time their drill to it). */
  readonly gunFiredAt: number[];
  private pending: PendingShot[] = [];
  private heave = 0;
  private pitch = 0;
  private roll = 0;
  private rollKick = 0;
  private groundCooldown = 0;
  private wakeT = 0;
  // rig springs: yards and booms swing across instead of snapping on a tack/gybe
  private rigBrace = 0;
  private rigBraceV = 0;
  private rigLee = 1;
  private rigLeeV = 0;
  private leeTarget = 1;
  private fireT = 0;
  private sinkSide = Math.random() < 0.5 ? -1 : 1;
  name: string;

  constructor(readonly cls: ShipClass, readonly livery: Livery, readonly team: Team, quality = 1) {
    this.model = new ShipModel(cls, livery, quality);
    this.root.add(this.model.root);
    this.root.rotation.order = 'YXZ';
    this.hp = cls.hp;
    this.name = cls.title;
    this.gunFiredAt = this.model.muzzles.map(() => -100);
  }

  get maxHp() {
    return this.cls.hp;
  }

  get forward(): THREE.Vector3 {
    return _v.set(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  /** World direction of local +x (port). */
  portDir(out = new THREE.Vector3()) {
    return out.set(Math.cos(this.heading), 0, -Math.sin(this.heading));
  }

  place(x: number, z: number, heading: number) {
    this.pos.set(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.root.position.copy(this.pos);
    this.root.rotation.y = heading;
  }

  /** How hard the yards and booms are swinging (crews haul on the braces while they do). */
  rigActivity() {
    return Math.abs(this.rigBraceV) + Math.abs(this.rigLeeV) * 0.5;
  }

  /** The side currently heeled up out of the water: +1 port, -1 starboard. */
  highSide() {
    return this.roll >= 0 ? 1 : -1;
  }

  canFire(side: 'port' | 'starboard') {
    return this.alive && this.reload[side] <= 0;
  }

  /** Begins a rippling broadside. Returns false while reloading. */
  fire(side: 'port' | 'starboard', world: World, target: Ship | null = null): boolean {
    if (!this.canFire(side)) return false;
    const s = side === 'port' ? 1 : -1;
    const ms = this.model.muzzles.map((m, i) => ({ m, i })).filter((e) => e.m.side === s);
    // fire from the middle outward for a rolling thunder
    ms.sort((a, b) => Math.abs(a.m.pos.z) - Math.abs(b.m.pos.z));
    ms.forEach((e, k) => this.pending.push({ at: world.time + k * 0.085 + Math.random() * 0.05, muzzle: e.i, target }));
    this.reload[side] = this.cls.reload;
    this.rollKick += s * 0.05 * (this.cls.cannonsPerSide / 5) / this.cls.mass;
    return true;
  }

  private shoot(p: PendingShot, world: World) {
    const m = this.model.muzzles[p.muzzle];
    this.gunFiredAt[p.muzzle] = world.time;
    this.root.updateMatrixWorld();
    const pos = m.pos.clone().applyMatrix4(this.model.root.matrixWorld);
    const dir = m.dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.heading);
    const v = this.cls.muzzleSpeed * (0.97 + Math.random() * 0.06);
    const g = 14;
    let dist = 60;
    if (p.target && p.target.alive) {
      // lead the target, but stay within the broadside arc
      const tp = p.target.pos;
      const d0 = Math.hypot(tp.x - pos.x, tp.z - pos.z);
      const tof = d0 / (v * 0.95);
      const lead = _v2.set(tp.x + p.target.vel.x * tof - pos.x, 0, tp.z + p.target.vel.z * tof - pos.z);
      dist = lead.length();
      const ang = Math.atan2(lead.x, lead.z);
      const base = Math.atan2(dir.x, dir.z);
      const dev = clamp(angleDelta(base, ang), -0.32, 0.32);
      const fa = base + dev;
      dir.set(Math.sin(fa), 0, Math.cos(fa));
    }
    const elev = clamp(0.5 * Math.asin(clamp((g * dist) / (v * v), 0, 1)), 0.015, 0.36);
    // pirate gun crews are a little less disciplined than yours
    const sloppy = this.team === 'pirate' ? 2.4 : 1;
    const yaw = (Math.random() - 0.5) * 0.035 * sloppy;
    const pitch = elev + (Math.random() - 0.5) * 0.02 * sloppy;
    const fa = Math.atan2(dir.x, dir.z) + yaw;
    const vel = new THREE.Vector3(Math.sin(fa) * Math.cos(pitch), Math.sin(pitch), Math.cos(fa) * Math.cos(pitch)).multiplyScalar(v);
    vel.add(this.vel);
    world.onShot({ pos, vel, owner: this, damage: this.cls.damage });
    world.particles.muzzle(pos, dir, this.vel);
    const [vol, pan] = world.soundAt(pos);
    world.audio.cannon(vol * 0.55, pan);
    world.onShake(this.team === 'player' ? 0.35 : 0.12 * vol, pos);
  }

  damage(amount: number, attacker: Ship | null, world: World) {
    if (!this.alive) return 0;
    const dmg = amount * (1 - this.cls.armor) * (0.85 + Math.random() * 0.3);
    this.hp -= dmg;
    this.lastHit = world.time;
    if (attacker) this.lastAttacker = attacker;
    this.rollKick += (Math.random() - 0.5) * 0.04;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.sinkT = 0;
      if (attacker) attacker.kills++;
      world.particles.explosion(this.pos.clone().setY(this.model.shape.mainDeckY(0.5)), 0.6 + this.cls.length / 40);
      const [vol, pan] = world.soundAt(this.pos);
      world.audio.cannon(vol, pan);
      world.onShake(this.team === 'player' ? 1.2 : 0.5 * vol, this.pos);
    }
    return dmg;
  }

  update(dt: number, world: World) {
    const c = this.cls;
    // ------------------------------------------------ cannons
    if (this.pending.length) {
      for (let i = this.pending.length - 1; i >= 0; i--) {
        if (world.time >= this.pending[i].at) {
          if (this.alive) this.shoot(this.pending[i], world);
          this.pending.splice(i, 1);
        }
      }
    }
    this.reload.port = Math.max(0, this.reload.port - dt);
    this.reload.starboard = Math.max(0, this.reload.starboard - dt);

    // ------------------------------------------------ sailing
    const fwd = this.forward;
    const fx = fwd.x;
    const fz = fwd.z;
    const w = world.wind;
    const rel = angleDelta(Math.atan2(w.dirX, w.dirZ), this.heading); // 0 = downwind
    const relDeg = (rel * 180) / Math.PI;
    const gust = world.gustAt(this.pos.x, this.pos.z);
    if (this.alive) {
      this.sailLevel += clamp(this.sailTarget - this.sailLevel, -dt * 0.6, dt * 0.6);
      const hpF = 0.72 + 0.28 * (this.hp / this.maxHp);
      const target = c.maxSpeed * this.sailLevel * windFactor(relDeg) * (0.75 + 0.25 * w.strength) * hpF * (1 + gust * 0.08);
      const rate = target > this.speed ? c.accel : c.accel * 1.4;
      this.speed += (target - this.speed) * damp(rate, dt);
      const steer = clamp(0.28 + 0.9 * (this.speed / c.maxSpeed), 0.28, 1.1);
      const targetAng = this.rudder * c.turnRate * steer;
      this.angVel += (targetAng - this.angVel) * damp(2.6 / Math.sqrt(c.mass), dt);
      this.speed *= 1 - Math.abs(this.angVel) * 0.08 * dt;
    } else {
      this.speed *= 1 - damp(0.8, dt);
      this.angVel *= 1 - damp(1, dt);
      this.sailLevel = Math.max(0, this.sailLevel - dt * 0.3);
    }
    if (this.anchored) {
      this.speed = 0;
      this.angVel = 0;
    }
    this.heading += this.angVel * dt;

    // leeway: a little sideways slip with the wind
    const port = this.portDir(_v2);
    const cross = w.dirX * port.x + w.dirZ * port.z;
    const slip = cross * 0.35 * this.sailLevel * w.strength;
    this.vel.set(fx * this.speed + port.x * slip, 0, fz * this.speed + port.z * slip);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    // ------------------------------------------------ land
    this.groundCooldown -= dt;
    const L = c.length;
    const probes = [0.46, 0.2, -0.1, -0.42];
    for (const pf of probes) {
      const px = this.pos.x + fx * L * pf;
      const pz = this.pos.z + fz * L * pf;
      const h = world.terrain.heightAt(px, pz);
      const lim = -c.draft * 0.75;
      if (h > lim) {
        world.terrain.gradientAt(px, pz, _g);
        const gl = Math.max(_g.length(), 1e-3);
        const push = Math.min(2.5, (h - lim) * 0.6 + 0.05);
        this.pos.x -= (_g.x / gl) * push;
        this.pos.z -= (_g.y / gl) * push;
        if (this.speed > 3.5 && this.groundCooldown <= 0 && this.alive) {
          this.damage(this.speed * 1.8, null, world);
          this.groundCooldown = 1.2;
          world.particles.sandHit(new THREE.Vector3(px, 0.5, pz));
          world.onShake(this.team === 'player' ? 0.5 : 0, this.pos);
        }
        this.speed *= pf > 0.3 ? 0.86 : 0.95;
      }
    }
    // world edge
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > 960) {
      const k = (r - 960) * 0.05;
      this.pos.x -= (this.pos.x / r) * k;
      this.pos.z -= (this.pos.z / r) * k;
    }

    // ------------------------------------------------ buoyancy
    const B = c.beam;
    const hb = world.waterHeight(this.pos.x + fx * L * 0.38, this.pos.z + fz * L * 0.38);
    const hs = world.waterHeight(this.pos.x - fx * L * 0.38, this.pos.z - fz * L * 0.38);
    const hp = world.waterHeight(this.pos.x + port.x * B * 0.5, this.pos.z + port.z * B * 0.5);
    const hst = world.waterHeight(this.pos.x - port.x * B * 0.5, this.pos.z - port.z * B * 0.5);
    const resp = damp(3.2 / c.mass, dt);
    const targetHeave = (hb + hs + hp + hst) * 0.25;
    const targetPitch = -Math.atan2(hb - hs, L * 0.76) * 0.9;
    let targetRoll = Math.atan2(hp - hst, B) * 0.8;
    targetRoll += this.angVel * this.speed * 0.022; // heel out of the turn
    targetRoll += -cross * this.sailLevel * w.strength * 0.07 / Math.sqrt(c.mass); // heel to leeward
    this.rollKick *= 1 - damp(2.2, dt);
    targetRoll += this.rollKick;
    let sinkY = 0;
    if (!this.alive) {
      this.sinkT += dt;
      const s = this.sinkT;
      sinkY = -s * s * 0.12 - s * 0.25;
      targetRoll += this.sinkSide * Math.min(0.65, s * 0.09);
      if (s > 9) this.removed = true;
    }
    this.heave += (targetHeave - this.heave) * resp;
    this.pitch += ((targetPitch + (this.alive ? 0 : Math.min(0.35, this.sinkT * 0.05))) - this.pitch) * resp;
    this.roll += (targetRoll - this.roll) * resp;

    this.root.position.set(this.pos.x, this.heave + sinkY - c.draft * 0.06, this.pos.z);
    this.root.rotation.set(this.pitch, this.heading, this.roll);
    // hit tests and fx read the world matrix before the next render
    this.root.updateMatrixWorld();

    // ------------------------------------------------ rig visuals
    const braceTarget = clamp(rel * 0.45, -0.75, 0.75) * Math.min(1, Math.abs(relDeg) / 30);
    // hysteresis so the canvas doesn't flicker sides when sailing dead on/off the wind
    if (cross > 0.06) this.leeTarget = 1;
    else if (cross < -0.06) this.leeTarget = -1;
    // slightly under-damped springs, slower on heavier hulls: a weighty swing with a soft settle
    const rigK = 26 / Math.sqrt(c.mass);
    const rigC = 2 * Math.sqrt(rigK) * 0.72;
    let rdt = Math.min(dt, 0.1);
    while (rdt > 0) {
      const h = Math.min(rdt, 1 / 60);
      rdt -= h;
      this.rigBraceV += ((braceTarget - this.rigBrace) * rigK - this.rigBraceV * rigC) * h;
      this.rigBrace += this.rigBraceV * h;
      this.rigLeeV += ((this.leeTarget - this.rigLee) * rigK * 0.8 - this.rigLeeV * rigC) * h;
      this.rigLee = clamp(this.rigLee + this.rigLeeV * h, -1.08, 1.08);
    }
    const brace = this.rigBrace;
    const leeSide = this.rigLee;
    // pennant flies downwind, in ship-local space
    const lx = w.dirX * port.x + w.dirZ * port.z;
    const lz = w.dirX * fx + w.dirZ * fz;
    const flagAng = Math.atan2(-lz, lx);
    // canvas spills and luffs while it crosses over, then fills again on the new side; gusts puff it out harder
    const fill = clamp(windFactor(relDeg) * w.strength * (1.1 + gust * 0.45), 0.25, 1.25) * (0.3 + 0.7 * Math.min(1, Math.abs(leeSide)));
    this.model.updateRig(this.sailLevel, -brace, leeSide, flagAng, fill);

    // ------------------------------------------------ wake & fx
    this.wakeT += dt;
    if (this.wakeT > 0.05 && this.speed > 0.6 && (this.alive || this.sinkT < 3)) {
      this.wakeT = 0;
      const k = clamp(this.speed / 12, 0, 1.2);
      const sx = this.pos.x - fx * L * 0.48;
      const sz = this.pos.z - fz * L * 0.48;
      world.wake.stamp(sx, sz, B * 0.55, 0.35 * k);
      const bx = this.pos.x + fx * L * 0.42;
      const bz = this.pos.z + fz * L * 0.42;
      world.wake.stamp(bx + port.x * B * 0.45, bz + port.z * B * 0.45, B * 0.28, 0.32 * k);
      world.wake.stamp(bx - port.x * B * 0.45, bz - port.z * B * 0.45, B * 0.28, 0.32 * k);
      world.wake.stamp(this.pos.x + port.x * B * 0.52, this.pos.z + port.z * B * 0.52, B * 0.2, 0.15 * k);
      world.wake.stamp(this.pos.x - port.x * B * 0.52, this.pos.z - port.z * B * 0.52, B * 0.2, 0.15 * k);
    }
    // fires when badly damaged or sinking
    const hpFrac = this.hp / this.maxHp;
    this.burning = this.alive ? (hpFrac < 0.4 ? (0.4 - hpFrac) / 0.4 : 0) : this.sinkT < 6 ? 1 : 0;
    if (this.burning > 0) {
      this.fireT += dt * (2 + this.burning * 10);
      while (this.fireT > 1) {
        this.fireT -= 1;
        const pts = this.model.deckPoints;
        const p = pts[Math.floor(Math.random() * pts.length)];
        if (p) {
          const wp = p.clone().applyMatrix4(this.model.root.matrixWorld);
          world.particles.flame(wp, 0.7 + this.burning * 0.6);
        }
      }
    }
  }
}
