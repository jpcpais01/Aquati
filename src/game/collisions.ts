import * as THREE from 'three';
import { clamp } from '../core/noise';
import { Ship } from '../ships/ship';
import { World } from './world';

// Hull-to-hull contact. Each hull is a capsule along its keel (a fair fit for
// a waterline that is long, narrow and rounded at both ends), so a ship
// glancing off another's quarter slides along her side and swings, while a
// bow driven square into a beam stops dead and staves her in.
//
// Contacts are resolved with a single impulse at the touching point: the
// heavier hull barely moves, the lighter one is shoved aside and spun.
// The impulse's along-keel part changes the ship's way, the sideways part goes
// into its drift (which the keel soon soaks up) and its lever arm into the yaw.

const RESTITUTION = 0.22;
const RAM_MIN = 1.3; // m/s closing speed before timbers break
const COOLDOWN = 0.7;

const _ca = new THREE.Vector2();
const _cb = new THREE.Vector2();
const _p = new THREE.Vector3();
const _n = new THREE.Vector3();

interface Hull {
  ax: number;
  az: number;
  fx: number;
  fz: number;
  half: number;
  r: number;
  m: number;
  inertia: number;
}

function hullOf(s: Ship, out: Hull) {
  const c = s.cls;
  out.fx = Math.sin(s.heading);
  out.fz = Math.cos(s.heading);
  out.ax = s.pos.x;
  out.az = s.pos.z;
  out.r = c.beam * 0.47;
  out.half = Math.max(0.5, c.length * 0.45 - out.r);
  out.m = c.mass;
  out.inertia = (c.mass * (c.length * c.length + c.beam * c.beam)) / 12;
  return out;
}

/** Closest points between the two keel segments; returns the along-keel parameters (-1..1) via `t`. */
function closest(a: Hull, b: Hull, t: [number, number]) {
  // segment p = a + fa * s, s in [-ha, ha]; q = b + fb * u, u in [-hb, hb]
  const rx = a.ax - b.ax;
  const rz = a.az - b.az;
  const d = a.fx * b.fx + a.fz * b.fz;
  const e = a.fx * rx + a.fz * rz;
  const f = b.fx * rx + b.fz * rz;
  const den = 1 - d * d;
  let s = den > 1e-5 ? clamp((d * f - e) / den, -a.half, a.half) : 0;
  let u = clamp(d * s + f, -b.half, b.half);
  s = clamp(d * u - e, -a.half, a.half);
  u = clamp(d * s + f, -b.half, b.half);
  _ca.set(a.ax + a.fx * s, a.az + a.fz * s);
  _cb.set(b.ax + b.fx * u, b.az + b.fz * u);
  t[0] = s / a.half;
  t[1] = u / b.half;
}

export class ShipCollisions {
  private last = new Map<number, number>();
  private ha: Hull = { ax: 0, az: 0, fx: 0, fz: 0, half: 0, r: 0, m: 0, inertia: 0 };
  private hb: Hull = { ax: 0, az: 0, fx: 0, fz: 0, half: 0, r: 0, m: 0, inertia: 0 };
  private t: [number, number] = [0, 0];

  constructor(private player: () => Ship | null) {}

  resolve(ships: Ship[], world: World) {
    for (let i = 0; i < ships.length; i++) {
      const a = ships[i];
      if (a.removed || (!a.alive && a.sinkT > 3)) continue; // wrecks settle below passing keels
      for (let j = i + 1; j < ships.length; j++) {
        const b = ships[j];
        if (b.removed || (!b.alive && b.sinkT > 3)) continue;
        const reach = (a.cls.length + b.cls.length) * 0.5;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        if (dx * dx + dz * dz > reach * reach) continue;
        this.pair(a, b, world);
      }
    }
    if (this.last.size > 64) for (const [k, t] of this.last) if (world.time - t > 5) this.last.delete(k);
  }

  private pair(a: Ship, b: Ship, world: World) {
    const A = hullOf(a, this.ha);
    const B = hullOf(b, this.hb);
    closest(A, B, this.t);
    let nx = _cb.x - _ca.x;
    let nz = _cb.y - _ca.y;
    let d = Math.hypot(nx, nz);
    const minD = A.r + B.r;
    if (d >= minD) return;
    if (d < 1e-4) {
      nx = b.pos.x - a.pos.x;
      nz = b.pos.z - a.pos.z;
      d = Math.hypot(nx, nz) || 1;
      if (d < 1e-4) nx = 1;
    }
    nx /= d;
    nz /= d;
    // contact point on the seam, lever arms from each hull's centre
    const px = _ca.x + nx * A.r;
    const pz = _ca.y + nz * A.r;
    const rax = px - a.pos.x;
    const raz = pz - a.pos.z;
    const rbx = px - b.pos.x;
    const rbz = pz - b.pos.z;
    const ia = 1 / A.m;
    const ib = 1 / B.m;

    // push apart by inverse mass so the heavier hull holds her ground
    const pen = minD - d;
    const corr = Math.min(pen, 1.5) / (ia + ib);
    a.pos.x -= nx * corr * ia;
    a.pos.z -= nz * corr * ia;
    b.pos.x += nx * corr * ib;
    b.pos.z += nz * corr * ib;

    // relative velocity at the contact (point velocity = v + w * (r.z, -r.x))
    const vax = a.vel.x + a.angVel * raz;
    const vaz = a.vel.z - a.angVel * rax;
    const vbx = b.vel.x + b.angVel * rbz;
    const vbz = b.vel.z - b.angVel * rbx;
    const vn = (vbx - vax) * nx + (vbz - vaz) * nz; // < 0: closing
    if (vn >= 0) return;
    const armA = raz * nx - rax * nz;
    const armB = rbz * nx - rbx * nz;
    const jn = (-(1 + RESTITUTION) * vn) / (ia + ib + (armA * armA) / A.inertia + (armB * armB) / B.inertia);
    // and a little friction along the seam, so a glancing blow drags and swings her
    const tx = -nz;
    const tz = nx;
    const vt = (vbx - vax) * tx + (vbz - vaz) * tz;
    const tArmA = raz * tx - rax * tz;
    const tArmB = rbz * tx - rbx * tz;
    const jtMax = (-vt) / (ia + ib + (tArmA * tArmA) / A.inertia + (tArmB * tArmB) / B.inertia);
    const jt = clamp(jtMax, -jn * 0.3, jn * 0.3);
    const jx = nx * jn + tx * jt;
    const jz = nz * jn + tz * jt;
    applyImpulse(a, -jx * ia, -jz * ia, -(raz * jx - rax * jz) / A.inertia);
    applyImpulse(b, jx * ib, jz * ib, (rbz * jx - rbx * jz) / B.inertia);

    const closing = -vn;
    // heel away from the blow: struck high on the side, the rail goes over
    const pa = a.portDir(_n);
    a.kickRoll(((nx * pa.x + nz * pa.z) * closing * 0.012) / A.m);
    const pb = b.portDir(_n);
    b.kickRoll((-(nx * pb.x + nz * pb.z) * closing * 0.012) / B.m);

    const key = Math.min(a.id, b.id) * 65536 + Math.max(a.id, b.id);
    const since = world.time - (this.last.get(key) ?? -100);
    if (closing < RAM_MIN) {
      // a slow grind along each other's sides: foam squeezed up the seam, a creak now and then
      if (since > 0.45 && Math.abs(vt) > 1.2) {
        this.last.set(key, world.time);
        world.wake.stamp(px, pz, 2.5, 0.6);
        const [vol, pan, dd] = world.soundAt(_p.set(px, 0, pz));
        world.audio.crunch(vol * 0.5, pan, dd, 0.05);
      }
      return;
    }
    if (since < COOLDOWN) return;
    this.last.set(key, world.time);
    this.impact(a, b, px, pz, nx, nz, closing, this.t[0], this.t[1], world);
  }

  private impact(a: Ship, b: Ship, px: number, pz: number, nx: number, nz: number, closing: number, ta: number, tb: number, world: World) {
    const force = clamp((closing - RAM_MIN) / 11, 0, 1);
    // the bow is built to take a blow; a beam or quarter is not
    const bowA = ta > 0.55 && Math.sin(a.heading) * nx + Math.cos(a.heading) * nz > 0.45;
    const bowB = tb > 0.55 && -(Math.sin(b.heading) * nx + Math.cos(b.heading) * nz) > 0.45;
    const ma = a.cls.mass;
    const mb = b.cls.mass;
    const base = closing * closing * 0.55;
    const same = a.team === b.team;
    const scale = same ? 0.35 : 1;
    let dmgA = base * ((2 * mb) / (ma + mb)) * (bowA ? 0.45 : 1) * (bowB ? 1.25 : 1) * scale;
    let dmgB = base * ((2 * ma) / (ma + mb)) * (bowB ? 0.45 : 1) * (bowA ? 1.25 : 1) * scale;
    dmgA = Math.min(dmgA, a.maxHp * 0.5);
    dmgB = Math.min(dmgB, b.maxHp * 0.5);

    const y = world.waterHeight(px, pz);
    const deckY = y + 1 + Math.min(a.cls.draft, b.cls.draft) * 0.4;
    if (dmgA > 1) a.damage(dmgA, same ? null : b, world, _p.set(px, deckY, pz));
    if (dmgB > 1) b.damage(dmgB, same ? null : a, world, _p.set(px, deckY, pz));

    // splinters bursting out of both hulls, water flung up between them
    world.particles.woodHit(_p.set(px, deckY, pz), _n.set(-nx, 0, -nz));
    if (force > 0.35) world.particles.woodHit(_p.set(px, deckY, pz), _n.set(nx, 0, nz));
    world.particles.splash(_p.set(px, y, pz), 0.55 + force * 0.85);
    world.wake.stamp(px, pz, 3 + force * 5, 1, true);
    world.wake.stamp(px, pz, 2 + force * 2, 1.2);
    world.wake.push(px, pz, 2.5 + force * 3, 0.35 + force * 0.6);

    const [vol, pan, dd] = world.soundAt(_p.set(px, 0, pz));
    world.audio.crunch(vol, pan, dd, force);
    world.audio.hit(vol * (0.4 + force * 0.6), pan, dd);
    if (force > 0.3) world.audio.splash(vol * 0.6, pan, dd);
    const p = this.player();
    const mine = p === a || p === b;
    world.onShake(mine ? 0.3 + force * 0.9 : 0.25 * vol * force, _p);
  }
}

function applyImpulse(s: Ship, dvx: number, dvz: number, dw: number) {
  const fx = Math.sin(s.heading);
  const fz = Math.cos(s.heading);
  const along = dvx * fx + dvz * fz;
  s.speed += along;
  s.drift.x += dvx - fx * along;
  s.drift.y += dvz - fz * along;
  s.angVel = clamp(s.angVel + dw, -1.6, 1.6);
}
