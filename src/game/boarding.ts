import * as THREE from 'three';
import { angleDelta, clamp, damp, lerp } from '../core/noise';
import type { DeckPlan } from '../ships/crew';
import type { Ship } from '../ships/ship';
import { Lines, railPoint } from '../shore/deck';
import type { World } from './world';

// Boarding a crippled prize, from the moment the hooks fly to the moment the
// lines are cut. Grapnels whirl up off your rail and arc across, bite into
// hers and come taut; the two ships glide to a stop and her hull is hauled in
// against yours, beam to beam, where both ride lashed together while the
// fight for her deck goes on (src/shore/shore.ts `board`). Afterwards the
// lines are cut, the hulls shoved apart, and a ship taken as a prize sails off
// under a prize crew.

export type BoardPhase = 'idle' | 'grapple' | 'deck' | 'part';

/** When the lines are all fast and the haul begins, and when the hulls meet (s into the grapple). */
const PULL0 = 1.35;
const PULL1 = 3.1;
const FLIGHT = 0.62;
const PART_T = 1.6;
/** A prize under a prize crew sails off and is gone after this long or this far. */
const PRIZE_LIFE = 55;
const PRIZE_GONE = 470;

interface Grapnel {
  /** Along our side (t) and hers. */
  ours: number;
  hers: number;
  /** When it leaves the thrower's hand, and whether it has bitten yet. */
  at: number;
  bit: boolean;
  thrown: boolean;
  spin: number;
}

export interface BoardingHooks {
  /** A grapnel whirled and thrown from our rail. */
  thrown(at: THREE.Vector3): void;
  /** It bites into her rail. */
  bit(at: THREE.Vector3): void;
  /** The hulls come together. */
  met(at: THREE.Vector3): void;
  /** Hauled alongside and lashed: over the side, lads. */
  lashed(): void;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _h = new THREE.Vector3();
const _u = new THREE.Vector3();
const swingOut: { from: THREE.Vector3; to: THREE.Vector3; slack: number }[] = [];

export class Boarding {
  phase: BoardPhase = 'idle';
  ship: Ship | null = null;
  prize: Ship | null = null;
  t = 0;
  /** Her side of us (+1 port) and our side of her. */
  side = 1;
  herSide = 1;
  /** Riding beam to beam the same way, or bow to stern. */
  private same = true;
  /** Where she ends up in our frame (x across to port, z ahead), and how she started out. */
  private lat = 0;
  private off = 0;
  private rel = { x: 0, z: 0, h: 0, vx: 0, vz: 0, vh: 0 };
  /** Our own way as the lines take the strain, bleeding off. */
  private glide = { x: 0, z: 0, h: 0, vx: 0, vz: 0, vh: 0 };
  private grapnels: Grapnel[] = [];
  private met = false;
  /** Prizes sailing off under a prize crew. */
  readonly prizes: { ship: Ship; t: number }[] = [];
  /** Colours coming down a beaten ship's halyards (and, on a prize, yours going up in their place). */
  private colours: { ship: Ship; t: number; y0: number; e0: number; drop: number; mine: THREE.Mesh[] | null; up: number }[] = [];

  constructor(
    private lines: Lines,
    private hooks: BoardingHooks,
  ) {}

  get busy() {
    return this.phase !== 'idle';
  }

  /** Throws the grapnels across: `ours` and `hers` are the two main decks. */
  begin(ship: Ship, prize: Ship, ours: DeckPlan, hers: DeckPlan) {
    this.ship = ship;
    this.prize = prize;
    this.phase = 'grapple';
    this.t = 0;
    this.met = false;
    const sh = Math.sin(ship.heading);
    const ch = Math.cos(ship.heading);
    const dx = prize.pos.x - ship.pos.x;
    const dz = prize.pos.z - ship.pos.z;
    // her place in our frame now, and her way through the water relative to ours
    const rx = dx * ch - dz * sh;
    const rz = dx * sh + dz * ch;
    const vx = prize.vel.x - ship.vel.x;
    const vz = prize.vel.z - ship.vel.z;
    this.rel = { x: rx, z: rz, h: angleDelta(ship.heading, prize.heading), vx: vx * ch - vz * sh, vz: vx * sh + vz * ch, vh: prize.angVel - ship.angVel };
    this.glide = { x: ship.pos.x, z: ship.pos.z, h: ship.heading, vx: ship.vel.x, vz: ship.vel.z, vh: ship.angVel };
    this.side = rx >= 0 ? 1 : -1;
    this.same = Math.cos(this.rel.h) >= 0;
    // hull to hull at the waterline; the rails stand a stride apart above (tumblehome)
    this.lat = this.side * (ship.cls.beam / 2 + prize.cls.beam / 2 + 0.3);
    // her waist opposite ours, so the decks face each other
    const midOurs = ours.zAt((ours.main.t0 + ours.main.t1) / 2);
    const midHers = hers.zAt((hers.main.t0 + hers.main.t1) / 2);
    this.off = midOurs - (this.same ? midHers : -midHers);
    // our side of her: the far side of her keel from our own
    this.herSide = this.same ? -this.side : this.side;
    // one line for every few metres of the shorter waist
    const span = Math.min(ours.main.t1 - ours.main.t0, 0.75) * ship.cls.length;
    const n = clamp(Math.round(span / 4), 3, 6);
    this.grapnels = [];
    for (let i = 0; i < n; i++) {
      const tO = lerp(ours.main.t0 + 0.04, ours.main.t1 - 0.04, (i + 0.5) / n);
      const zO = ours.zAt(tO) - this.off;
      const zH = this.same ? zO : -zO;
      const tH = clamp(hers.tOf(zH), hers.main.t0 + 0.02, hers.main.t1 - 0.02);
      this.grapnels.push({ ours: tO, hers: tH, at: 0.5 + i * 0.17 + Math.random() * 0.12, bit: false, thrown: false, spin: Math.random() * 6 });
    }
  }

  /**
   * Before the ships move: both glide to a stop and are held, and she is
   * hauled in from where she lay to her berth against our side.
   */
  pin(dt: number) {
    const s = this.ship;
    const e = this.prize;
    if (this.phase === 'idle' || !s || !e) return;
    this.t += dt;
    if (this.phase === 'part') {
      if (this.t > PART_T) this.finish();
      return;
    }
    if (!s.alive || !e.alive) {
      this.part();
      return;
    }
    const g = this.glide;
    const kg = 1 - damp(1.3, dt);
    g.vx *= kg;
    g.vz *= kg;
    g.vh *= kg;
    g.x += g.vx * dt;
    g.z += g.vz * dt;
    g.h += g.vh * dt;
    this.hold(s, g.x, g.z, g.h);
    // she drifts on as the lines snake out, then takes the strain and comes in
    const r = this.rel;
    const kr = 1 - damp(this.t > PULL0 ? 4 : 1.4, dt);
    r.vx *= kr;
    r.vz *= kr;
    r.vh *= kr;
    r.x += r.vx * dt;
    r.z += r.vz * dt;
    r.h += r.vh * dt;
    const u = this.phase === 'deck' ? 1 : clamp((this.t - PULL0) / (PULL1 - PULL0), 0, 1);
    const k = u * u * (3 - 2 * u);
    const lx = lerp(r.x, this.lat, k);
    const lz = lerp(r.z, this.off, k);
    const lh = lerp(r.h, this.same ? 0 : r.h >= 0 ? Math.PI : -Math.PI, k);
    const sh = Math.sin(g.h);
    const ch = Math.cos(g.h);
    this.hold(e, g.x + lx * ch + lz * sh, g.z - lx * sh + lz * ch, g.h + lh);
    if (this.phase === 'grapple' && this.t >= PULL1 && !this.met) {
      this.met = true;
      this.phase = 'deck';
      this.hooks.met(_a.set((s.pos.x + e.pos.x) / 2, 0.4, (s.pos.z + e.pos.z) / 2));
      this.hooks.lashed();
    }
  }

  private hold(s: Ship, x: number, z: number, h: number) {
    s.pos.set(x, 0, z);
    s.heading = h;
    s.speed = 0;
    s.angVel = 0;
    s.drift.set(0, 0);
    s.anchored = true;
    s.sailTarget = 0;
    s.rudder = 0;
  }

  /** The hulls shove apart as the lines are cut; a moment later it's all over. */
  part() {
    const s = this.ship;
    const e = this.prize;
    if (this.phase === 'idle' || this.phase === 'part') return;
    this.phase = 'part';
    this.t = 0;
    if (!s || !e) return;
    s.anchored = false;
    e.anchored = false;
    const port = s.portDir(_u);
    s.drift.x -= port.x * this.side * 1.3;
    s.drift.y -= port.z * this.side * 1.3;
    e.drift.x += port.x * this.side * 1.6;
    e.drift.y += port.z * this.side * 1.6;
  }

  private finish() {
    this.phase = 'idle';
    this.ship = null;
    this.prize = null;
    this.grapnels = [];
    this.lines.begin();
    this.lines.end();
  }

  /** Her crew has struck: her flag and ensign come down hand over hand. */
  strike(ship: Ship) {
    const m = ship.model;
    const top = m.flagPivot.position.y;
    this.colours.push({ ship, t: 0, y0: top, e0: m.ensignPivot.position.y, drop: Math.max(2, Math.min(top - m.shape.mainDeckY(0.5) - 2.2, top * 0.75)), mine: null, up: -1 });
  }

  /** ...and on a prize, your own colours run up in their place (your flag's own material: nothing new to compile). */
  hoist(ship: Ship, by: Ship) {
    const c = this.colours.find((o) => o.ship === ship);
    const mat = (by.model.flagPivot.children[0] as THREE.Mesh | undefined)?.material;
    if (!c || !mat) return;
    c.mine = [];
    for (const piv of [ship.model.flagPivot, ship.model.ensignPivot]) {
      const theirs = piv.children[0] as THREE.Mesh | undefined;
      if (!theirs) continue;
      const m = new THREE.Mesh(theirs.geometry, mat);
      m.castShadow = true;
      m.visible = false;
      piv.add(m);
      c.mine.push(m);
    }
    c.up = 0;
  }

  private runColours(dt: number) {
    for (let i = this.colours.length - 1; i >= 0; i--) {
      const c = this.colours[i];
      const m = c.ship.model;
      if (c.ship.removed) {
        this.colours.splice(i, 1);
        continue;
      }
      c.t += dt;
      const k = clamp(c.t / 2.6, 0, 1);
      // hauled down in tugs, not one smooth slide
      const e = k * k * (3 - 2 * k) - Math.sin(k * Math.PI * 7) * 0.012 * (1 - k);
      let low = e;
      if (k >= 1) {
        for (const piv of [m.flagPivot, m.ensignPivot]) for (const ch of piv.children) ch.visible = !!c.mine?.includes(ch as THREE.Mesh) && c.up >= 0;
        if (c.up >= 0) {
          c.up += dt;
          const u = clamp(c.up / 3.2, 0, 1);
          low = 1 - u * u * (3 - 2 * u);
          if (u >= 1) this.colours.splice(i, 1);
        } else if (c.t > 30) this.colours.splice(i, 1);
      }
      m.flagPivot.position.y = c.y0 - c.drop * low;
      m.ensignPivot.position.y = c.e0 - 1.3 * low;
    }
  }

  /** She goes off under a prize crew: away from us and over the horizon. */
  sendAway(ship: Ship) {
    ship.prize = true;
    ship.sailTarget = 2 / 3;
    this.prizes.push({ ship, t: 0 });
  }

  /** After the ships move: the lines between the rails, and the boarders' ropes. */
  update(dt: number, world: World, swings: ((out: typeof swingOut) => typeof swingOut) | null, player: Ship | null) {
    this.sailPrizes(dt, player);
    if (this.colours.length) this.runColours(dt);
    const s = this.ship;
    const e = this.prize;
    if (this.phase === 'idle' || !s || !e) return;
    const L = this.lines;
    L.begin();
    const pull = clamp((this.t - PULL0) / (PULL1 - PULL0), 0, 1);
    for (const gr of this.grapnels) {
      railPoint(s, gr.ours, this.side, _a, 0.12);
      railPoint(e, gr.hers, this.herSide, _b, 0.06);
      if (this.phase === 'part') {
        // cut: the loose end drops over the side and is hauled in
        const f = clamp(this.t / PART_T, 0, 1);
        _h.lerpVectors(_a, _b, 0.55 * (1 - f));
        _h.y = lerp(_b.y, Math.max(world.waterHeight(_h.x, _h.z), _a.y - 3.2), Math.min(1, f * 2.5));
        L.line(_a, _h, 0.25 * (1 - f), 0.04, 0.15 * (1 - f), this.t * 9 + gr.spin, 6);
        continue;
      }
      const u = (this.t - gr.at) / FLIGHT;
      if (u < 0) {
        if (!gr.thrown && this.t > gr.at - 0.45) {
          gr.thrown = true;
          this.hooks.thrown(_a);
        }
        continue;
      }
      if (u < 1) {
        // in flight: an arc from the thrower's swing up over the gap, the line paying out behind
        _h.set(_a.x, _a.y + 1.5, _a.z).lerp(_b, u);
        _h.y += 2.4 * Math.sin(Math.PI * u);
        L.line(_a, _h, 0.12, 0.034, 0.35 * (1 - u), this.t * 14 + gr.spin, 7);
        _u.subVectors(_a, _h).setY(0.4);
        L.hook(_h, _u, gr.spin + this.t * 18);
        continue;
      }
      if (!gr.bit) {
        gr.bit = true;
        this.hooks.bit(_b);
      }
      // fast: slack, then hauling taut, then working against the swell
      const sag = this.phase === 'deck' ? 0.07 + 0.04 * Math.sin(world.time * 1.3 + gr.spin) : lerp(0.9, 0.08, pull);
      L.line(_a, _b, sag, 0.042, this.phase === 'grapple' && pull <= 0 ? 0.08 : 0, world.time * 3 + gr.spin);
      _u.subVectors(_a, _b).setY(0.5);
      L.hook(_b, _u, gr.spin);
    }
    if (swings) for (const r of swings(swingOut)) L.line(r.from, r.to, r.slack, 0.032, 0, 0, r.slack > 0 ? 6 : 3);
    L.end();
  }

  /** Prizes under a prize crew: away from your guns, and gone once over the horizon. */
  private sailPrizes(dt: number, player: Ship | null) {
    for (let i = this.prizes.length - 1; i >= 0; i--) {
      const p = this.prizes[i];
      const s = p.ship;
      p.t += dt;
      if (!s.alive || s.removed) {
        this.prizes.splice(i, 1);
        continue;
      }
      // give the ship she was lashed to a wide berth, then turn for home
      const ax = player ? s.pos.x - player.pos.x : 0;
      const az = player ? s.pos.z - player.pos.z : 0;
      const d = Math.hypot(ax, az);
      const want = d > 1 ? Math.atan2(ax, az) : s.heading;
      s.rudder = clamp(angleDelta(s.heading, want) * 2, -1, 1);
      s.sailTarget = p.t > 2 ? 2 / 3 : 0.2;
      // gone over the horizon (or far enough off, after a while, that nobody sees her go)
      if (d > PRIZE_GONE || (p.t > PRIZE_LIFE && d > 300) || p.t > PRIZE_LIFE * 4) {
        s.removed = true;
        this.prizes.splice(i, 1);
      }
    }
  }

  /** A fresh voyage: nothing lashed, no prizes on the way to port. */
  reset() {
    this.finish();
    this.prizes.length = 0;
    this.colours.length = 0;
  }
}
