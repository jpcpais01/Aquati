import * as THREE from 'three';
import { angleDelta, clamp, damp, mulberry32, smoothstep } from '../core/noise';
import { globalUniforms } from '../render/environment';
import { Reef, SeaFloor } from '../world/terrain';
import { Vortex, VORTEX_N } from '../world/vortex';
import type { Ship } from '../ships/ship';
import type { Item } from './loot';
import { World } from './world';

// The sea's own dangers, out where no island shelters you.
//
// Maelstroms: three great whirlpools turn in deep water. Their pull reaches
// out a long way; inside it the current drags a ship round and in, swinging
// her head with the spin, and the sea itself falls away into a funnel she
// heels down into (world/vortex.ts shapes the water, the ocean shader paints
// it). Near the eye the strain wrings her timbers; in the throat it tears her
// apart. They swell in a storm and slacken a little in fair weather, and you
// sail out of one by running before the wind, spiralling out with the flow.
//
// Reefs: open-sea coral lies a metre or two under the surface (world/terrain.ts
// raises it, ship.ts grinds keels on it). A sloop's shallow keel slips over
// most of it; a deep-draughted galleon strikes and sticks fast. The swell
// breaks white over the crest, so a sharp eye can read one from afar.
//
// Pirates steer clear of both while they patrol, but a captain hot on your
// heels cuts corners: lead one across the coral, or skirt a maelstrom close
// enough that her heavier hull is caught where yours wasn't, and the sea does
// your work for you (and the Crown pays you for her all the same).

export interface Maelstrom {
  name: string;
  x: number;
  z: number;
  /** Radius of its pull in fair weather (m). */
  r0: number;
  phase: number;
  /** The live shape shared with the water and the buoyancy. */
  vortex: Vortex;
}

/** What a captain can tell about the sea ahead of her (World.hazards). */
export interface HazardSense {
  /** Whether (x, z) lies within `margin` radii of a maelstrom's eye. */
  vortexAt(x: number, z: number, margin: number): boolean;
  /** The heading out of a maelstrom's grip for a ship at (x, z), or null when she's clear of it. */
  escape(x: number, z: number): number | null;
  /** The water's flow at (x, z) (m/s into `out`); returns the swing it gives a hull (rad/s). */
  flowAt(x: number, z: number, out: THREE.Vector2): number;
  /** How near the eye of a live maelstrom (x, z) lies: 1 at the eye .. 0 past `reach` radii. */
  eyeAt(x: number, z: number, reach: number): number;
}

/** Where a ship stands with a maelstrom: its name, how far in (radius fractions) and how hard it has her. */
export interface VortexState {
  m: Maelstrom;
  /** Distance from the eye in radii. */
  u: number;
  dist: number;
  /** Speed of the water under her (m/s). */
  flow: number;
  /** Her own speed away from the eye (m/s; negative: being drawn in). */
  out: number;
}

/** A maelstrom to place: name, radius of its pull (m), and which way it turns. */
type MaelstromSpec = [string, number, 1 | -1];

export const NAMES: MaelstromSpec[] = [
  ['La Gargantilha', 128, 1],
  ['Redemolino Noir', 112, -1],
  ['El Ojo de Juracán', 100, 1],
];
/** Las Brumas has one, out in the jade water among the stacks. */
export const BRUMAS_NAMES: MaelstromSpec[] = [['Sorvedouro da Bruma', 108, -1]];

/** Where an archipelago's maelstroms go: round its centre, clear of `avoid`. */
export interface MaelstromPlan {
  cx: number;
  cz: number;
  names: MaelstromSpec[];
  avoid: { x: number; z: number; r: number }[];
  seed: number;
}

/** Peak swirl (m/s, at the edge of the throat) and inflow at full strength. */
const SWIRL = 8.5;
const INFLOW = 3.1;
/** Radius fraction where the swirl peaks; inside it the water turns like a solid wheel. */
const CORE = 0.17;
/** Strain from the funnel's walls and its throat, as fractions of max hull per second. */
const STRAIN = 0.018;
const THROAT = 0.055;
/**
 * The maw: inside this radius fraction the throat drags a hull under, at up
 * to DRAW of the way per second (light hulls ride it a little longer).
 * Fight clear in time and she bobs back up; let it reach her rail and she's gone.
 */
const MAW = 0.15;
const DRAW = 0.2;

const _v = new THREE.Vector2();

export class Hazards implements HazardSense {
  readonly maelstroms: Maelstrom[] = [];
  readonly reefs: Reef[];
  /** Hull strain owed to each ship, paid in bites. */
  private strain = new Map<Ship, { acc: number; t: number }>();
  private fxT = 0;
  private storm = 0;

  constructor(private terrain: SeaFloor, plans: MaelstromPlan[]) {
    this.reefs = terrain.reefs;
    for (const plan of plans) this.place(plan);
  }

  private place({ cx, cz, names, avoid, seed }: MaelstromPlan) {
    const terrain = this.terrain;
    const rnd = mulberry32(seed);
    const TAU = Math.PI * 2;
    for (const [name, r, dir] of names) {
      for (let attempt = 0; attempt < 4000; attempt++) {
        const a = rnd() * TAU;
        const d = 200 + Math.sqrt(rnd()) * 760;
        const x = cx + Math.cos(a) * d;
        const z = cz + Math.sin(a) * d;
        if (d + r > 960) continue;
        if (avoid.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r * 1.05)) continue;
        if (this.reefs.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r + 40)) continue;
        if (this.maelstroms.some((o) => Math.hypot(o.x - x, o.z - z) < o.r0 + r + 220)) continue;
        // deep, open water all the way round its pull
        let deep = true;
        for (const rr of [0, 0.5, 1, 1.2]) {
          for (let k = 0; k < (rr ? 14 : 1) && deep; k++) {
            const b = (k / 14) * TAU;
            if (terrain.heightAt(x + Math.cos(b) * r * rr, z + Math.sin(b) * r * rr) > -11) deep = false;
          }
        }
        if (!deep) continue;
        this.maelstroms.push({ name, x, z, r0: r, phase: rnd() * 100, vortex: { x, z, r, k: 1, dir } });
        // the seabed falls away under it, so its throat has somewhere to go
        terrain.carveAbyss(x, z, r * 1.05);
        break;
      }
    }
  }

  /** Links the maelstroms' shape into the world's water. */
  attach(world: World) {
    world.vortices.length = 0;
    for (const m of this.maelstroms) world.vortices.push(m.vortex);
    world.hazards = this;
  }

  /** Every maelstrom stilled (the farewell's sea, the shipwright's harbour don't need them). */
  setLive(on: boolean) {
    for (const m of this.maelstroms) m.vortex.k = on ? 1 : 0;
    this.sync();
  }

  vortexAt(x: number, z: number, margin: number): boolean {
    for (const m of this.maelstroms) if (Math.hypot(m.x - x, m.z - z) < m.vortex.r * margin) return true;
    return false;
  }

  escape(x: number, z: number): number | null {
    for (const m of this.maelstroms) {
      const v = m.vortex;
      const dx = x - m.x;
      const dz = z - m.z;
      const d = Math.hypot(dx, dz);
      if (d > v.r * 0.95 || v.k <= 0.05) continue;
      // out and round with the flow: fighting straight across the current only stalls her
      const out = Math.atan2(dx, dz);
      return out + v.dir * -0.55;
    }
    return null;
  }

  eyeAt(x: number, z: number, reach: number): number {
    let best = 0;
    for (const m of this.maelstroms) {
      const v = m.vortex;
      if (v.k <= 0.05) continue;
      const u = Math.hypot(x - m.x, z - m.z) / v.r;
      if (u < reach) best = Math.max(best, 1 - u / reach);
    }
    return best;
  }

  /** The water's flow at (x, z) (m/s into `out`); returns the swing it gives a hull (rad/s). */
  flowAt(x: number, z: number, out: THREE.Vector2): number {
    out.set(0, 0);
    let spin = 0;
    for (const m of this.maelstroms) {
      const v = m.vortex;
      if (v.k <= 0) continue;
      const dx = x - m.x;
      const dz = z - m.z;
      const d = Math.hypot(dx, dz);
      const u = d / v.r;
      if (u > 1.3 || d < 0.01) continue;
      const edge = 1 - smoothstep(0.7, 1.3, u);
      // a Rankine vortex: a solid core, then a swirl that falls away with distance
      const vt = v.k * SWIRL * (u < CORE ? u / CORE : Math.pow(CORE / u, 0.62)) * edge;
      // (easing off at the very eye, so what reaches it hangs there rather than jittering across)
      const vr = v.k * INFLOW * edge * (0.35 + 0.65 * (1 - Math.min(u, 1))) * Math.min(1, u / 0.03);
      const rx = dx / d;
      const rz = dz / d;
      // the water turns toward increasing atan2(z, x) when dir is 1 (as the ocean
      // shader's arms do): along dir * (-rz, rx), and in toward the eye
      out.x += -rz * v.dir * vt - rx * vr;
      out.y += rx * v.dir * vt - rz * vr;
      // headings run the other way round (0 = +z, rising toward +x)
      spin -= (vt / Math.max(d, 6)) * v.dir;
    }
    return spin;
  }

  /** Where `s` stands with the nearest maelstrom (null when well clear of all). */
  stateOf(s: Ship, reach = 2.6): VortexState | null {
    let best: VortexState | null = null;
    for (const m of this.maelstroms) {
      const v = m.vortex;
      const dx = s.pos.x - m.x;
      const dz = s.pos.z - m.z;
      const dist = Math.hypot(dx, dz);
      const u = dist / v.r;
      if (u > reach || (best && u > best.u)) continue;
      const out = dist > 0.01 ? (s.vel.x * dx + s.vel.z * dz) / dist : 0;
      best = { m, u, dist, flow: Math.hypot(s.current.x, s.current.y), out };
    }
    return best;
  }

  /** The reef `s` is in or nearing, if any. */
  reefOf(s: Ship, pad = 0): Reef | null {
    return this.terrain.reefNear(s.pos.x, s.pos.z, pad);
  }

  /**
   * Coral ahead of her bow that her keel would strike: how far ahead (m) and
   * the water over it (m), or null when the way is clear.
   */
  shoalAhead(s: Ship, look: number): { dist: number; depth: number } | null {
    const T = this.terrain;
    if (!T.reefNear(s.pos.x, s.pos.z, look + 20)) return null;
    const f = s.forward;
    const B = s.cls.beam * 0.45;
    const px = f.z;
    const pz = -f.x;
    const keel = s.cls.draft * 0.95 + 0.15;
    for (let d = s.cls.length * 0.5; d <= look; d += 3) {
      for (const o of [0, B, -B]) {
        const x = s.pos.x + f.x * d + px * o;
        const z = s.pos.z + f.z * d + pz * o;
        if (T.reefAt(x, z) < 0.3) continue;
        const depth = -T.heightAt(x, z);
        if (depth < keel) return { dist: d - s.cls.length * 0.5, depth };
      }
    }
    return null;
  }

  update(dt: number, world: World, ships: Ship[], loot: Item[], view: THREE.Vector3, storm: number) {
    const t = world.time;
    this.storm += (storm - this.storm) * damp(0.2, dt);
    // they breathe: never quite still, deeper and wider when a storm drives the sea
    for (const m of this.maelstroms) {
      const v = m.vortex;
      if (v.k <= 0 && dt > 0) continue;
      const breath = 0.92 + 0.08 * Math.sin(t * 0.031 + m.phase) + 0.05 * Math.sin(t * 0.083 + m.phase * 2.3);
      v.k = breath * (1 + this.storm * 0.28);
      v.r = m.r0 * (1 + this.storm * 0.14);
    }
    this.sync();
    if (dt <= 0) return;

    // the current takes every hull in its reach, afloat or foundering
    for (const s of ships) {
      if (s.removed) continue;
      const spin = this.flowAt(s.pos.x, s.pos.z, _v);
      // a phantom slips half the sea's grip; a heavy hull answers the swing slowly
      const grip = s.ghost ? 0.5 : s.phantom ? 0.15 : 1;
      s.current.set(_v.x * grip, _v.y * grip);
      // dragged down, she whirls faster and faster with the water
      s.spin = ((spin * grip * 0.75) / Math.sqrt(s.cls.mass)) * (1 + s.drawn * 1.8);
      // on her Phantom Run the throat lets go of her
      if (s.phantom) s.drawn = Math.max(0, s.drawn - dt * 0.5);
      else if (!s.ghost) this.drag(s, dt, world);
      if (s.alive && !s.ghost && !s.phantom) this.wring(s, dt, world);
    }
    // salvage swept round and down: the throat swallows what it reaches
    for (let i = loot.length - 1; i >= 0; i--) {
      const it = loot[i];
      this.flowAt(it.x, it.z, _v);
      if (_v.x === 0 && _v.y === 0) continue;
      it.x += _v.x * dt * 0.85;
      it.z += _v.y * dt * 0.85;
      for (const m of this.maelstroms) {
        if (Math.hypot(it.x - m.x, it.z - m.z) < m.vortex.r * 0.07) {
          loot.splice(i, 1);
          world.particles.splash(new THREE.Vector3(it.x, world.waterHeight(it.x, it.z), it.z), 0.5);
          break;
        }
      }
    }
    this.spray(dt, world, view);
  }

  /**
   * The throat at the heart of the funnel pulls a hull down into it: deeper
   * and deeper while she lingers there, till the sea pours over her rail and
   * takes her (no blast, no wreck left wallowing on the surface: she goes on
   * down the throat). A wreck that drifts into it is swallowed the same way.
   */
  private drag(s: Ship, dt: number, world: World) {
    if (s.swallowed) return;
    let pull = 0;
    for (const m of this.maelstroms) {
      const v = m.vortex;
      if (v.k <= 0.05) continue;
      const u = Math.hypot(s.pos.x - m.x, s.pos.z - m.z) / v.r;
      if (u < MAW) pull = Math.max(pull, (1 - u / MAW) * Math.min(v.k, 1.3));
    }
    if (!s.alive) {
      if (pull > 0.45 && s.sinkT < s.wreckLife) s.swallowed = true;
      return;
    }
    if (pull <= 0) {
      // clear of the maw she bobs back up, slowly
      s.drawn = Math.max(0, s.drawn - dt * 0.12);
      return;
    }
    const was = s.drawn;
    s.drawn += dt * DRAW * Math.pow(pull, 0.75) * (0.8 + 0.2 * s.cls.mass);
    // the first time the throat really takes hold, her timbers cry out
    if (was < 0.35 && s.drawn >= 0.35) {
      const [vol, pan, d] = world.soundAt(s.pos);
      world.audio.crunch(vol, pan, d, 0.5);
      world.onShake(s.team === 'player' ? 0.35 : 0, s.pos);
    }
    if (s.drawn < 1) return;
    // the sea comes in over her rail: she's gone
    s.drawn = 1;
    s.swallowed = true;
    world.onHazard(s, 'maelstrom', 0, s.pos);
    const dealt = s.damage(s.hp * 4 + s.maxHp, null, world, null, false, true);
    // (in a shared sea another captain's game may yet decide her fate)
    if (s.alive) {
      s.swallowed = false;
      s.drawn = 0.97;
    }
    world.onHazard(s, 'maelstrom', dealt, s.pos);
  }

  /** The strain of the funnel on a hull: a creak near the eye, ruin in its throat. */
  private wring(s: Ship, dt: number, world: World) {
    let rate = 0;
    for (const m of this.maelstroms) {
      const v = m.vortex;
      const u = Math.hypot(s.pos.x - m.x, s.pos.z - m.z) / v.r;
      if (u > 0.42) continue;
      const wall = Math.pow(1 - u / 0.42, 1.5) * STRAIN;
      const throat = u < 0.13 ? (1 - u / 0.13) * THROAT : 0;
      rate += (wall + throat) * v.k;
    }
    let st = this.strain.get(s);
    if (rate <= 0) {
      if (st) st.acc = 0;
      return;
    }
    if (!st) this.strain.set(s, (st = { acc: 0, t: 0 }));
    st.acc += rate * s.maxHp * dt;
    st.t -= dt;
    if (st.t > 0) return;
    st.t = 0.7;
    const dealt = s.damage(st.acc, null, world, null);
    st.acc = 0;
    world.onHazard(s, 'maelstrom', dealt, s.pos);
  }

  /** Mist boiling up off the throat and spindrift flung from the churn, near enough to see. */
  private spray(dt: number, world: World, view: THREE.Vector3) {
    this.fxT += dt;
    if (this.fxT < 0.05) return;
    const step = this.fxT;
    this.fxT = 0;
    for (const m of this.maelstroms) {
      const v = m.vortex;
      if (v.k <= 0.05 || Math.hypot(view.x - m.x, view.z - m.z) > 460) continue;
      const n = Math.random() < step * 14 * v.k ? 1 : 0;
      for (let i = 0; i < n + (Math.random() < step * 10 ? 1 : 0); i++) {
        const a = Math.random() * Math.PI * 2;
        const rr = v.r * (0.09 + Math.random() * 0.07);
        const x = m.x + Math.cos(a) * rr;
        const z = m.z + Math.sin(a) * rr;
        const y = world.waterHeight(x, z) + 0.3;
        // tangent to the turn
        const tx = -Math.sin(a) * v.dir;
        const tz = Math.cos(a) * v.dir;
        const sp = v.k * SWIRL * 0.75;
        if (i === 0) {
          world.particles.emit({
            x, y, z, vx: tx * sp * 0.6, vy: 1.4 + Math.random() * 1.6, vz: tz * sp * 0.6,
            life: 2.4 + Math.random() * 1.4, size: 2.4, sizeEnd: 8 + Math.random() * 5,
            color: [1.2, 1.26, 1.3], colorEnd: [1.1, 1.14, 1.18], alpha: 0.2, drag: 0.5, grav: -0.2, spin: (Math.random() - 0.5) * 0.8, kind: 1, fadeIn: 0.25,
          });
        } else {
          world.particles.emit({
            x, y, z, vx: tx * sp + Math.cos(a) * 1.5, vy: 2.5 + Math.random() * 3, vz: tz * sp + Math.sin(a) * 1.5,
            life: 0.7 + Math.random() * 0.4, size: 0.5, sizeEnd: 1.4,
            color: [1.3, 1.36, 1.4], alpha: 0.6, grav: 11, drag: 0.9, kind: 0, fadeIn: 0.02,
          });
        }
      }
    }
  }

  /** The roar of the nearest maelstrom, from where you're listening. */
  sound(world: World) {
    let best = 0;
    let pan = 0;
    let near = 0;
    for (const m of this.maelstroms) {
      const v = m.vortex;
      if (v.k <= 0.05) continue;
      const dx = m.x - world.listener.x;
      const dz = m.z - world.listener.z;
      const d = Math.hypot(dx, dz);
      const vol = clamp(1 - (d - v.r * 0.4) / (v.r * 3.6), 0, 1) ** 1.6 * Math.min(1.2, v.k);
      if (vol > best) {
        best = vol;
        pan = (dx * world.listenerRight.x + dz * world.listenerRight.y) / Math.max(d, v.r * 0.6);
        near = clamp(1 - d / v.r, 0, 1);
      }
    }
    world.audio.setMaelstrom(best, pan, near);
  }

  private sync() {
    const u = globalUniforms.uVortex.value;
    for (let i = 0; i < VORTEX_N; i++) {
      const m = this.maelstroms[i];
      if (m) u[i].set(m.x, m.z, m.vortex.r, m.vortex.k * m.vortex.dir);
      else u[i].set(0, 0, 1, 0);
    }
  }

  /** Signed swing of a heading toward `to` (for the HUD's arrow). */
  static turn(from: number, to: number) {
    return angleDelta(from, to);
  }
}
