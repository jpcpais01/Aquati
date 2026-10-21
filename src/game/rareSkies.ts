import * as THREE from 'three';
import type { Atmosphere } from '../world/atmosphere';
import type { Island } from '../world/terrain';
import { seaGlowAt } from '../world/seaGlow';
import { Embers } from '../fx/embers';
import { Mirage } from '../fx/mirage';

// The rare skies that live somewhere rather than everywhere: the ash a
// restless volcano throws downwind (ember rain), the mirages a scorching noon
// conjures ahead of the ship, and the sea-spark blooms of the open ocean at
// night. The atmosphere owns how each one looks; this decides where and when,
// and tells the crew.

const smooth = THREE.MathUtils.smoothstep;
/** How far downwind a plume carries its ash (m). */
const PLUME_REACH = 1300;

export interface RareHooks {
  toast(kicker: string, title: string, life?: number): void;
  /** A low rumble from the mountain, (vol 0..1, distance m). */
  rumble(vol: number, dist: number): void;
  shimmer(): void;
  sparkle(x: number, y: number, z: number): void;
  /** Ground height at (x, z): sea floor below 0. */
  ground(x: number, z: number): number;
}

export class RareSkies {
  readonly embers: Embers;
  readonly mirage: Mirage;
  /** 0 .. 1 how restless the volcanoes are: smoke and ash pouring from the craters. */
  restless = 0;
  private spell = 0; // seconds of the current ash spell left (0: quiet)
  private quietT = 60 + Math.random() * 160;
  private mirageT = 10;
  private mirages = 0;
  private inAsh = false;
  private inBloom = false;
  private volcanoes: Island[];

  constructor(tier: number, islands: Island[], private hooks: RareHooks) {
    this.embers = new Embers([700, 1400, 2200][tier] ?? 1400);
    this.mirage = new Mirage();
    this.volcanoes = islands.filter((i) => i.kind === 'volcanic');
    this.mirage.onEnter = () => {
      const m = this.mirage;
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = m.size * (0.2 + Math.random() * 0.5);
        this.hooks.sparkle(m.x + Math.cos(a) * r, 1 + Math.random() * 6, m.z + Math.sin(a) * r);
      }
      this.hooks.shimmer();
      if (this.mirages === 1) this.hooks.toast('Only a mirage', 'It frays away round the hull, as if it was never there', 3.6);
    };
  }

  /** A new voyage: nothing conjured, the mountain quiet a while. */
  reset() {
    this.mirage.clear();
    this.mirageT = 10;
    this.inAsh = this.inBloom = false;
  }

  /** The ash in the air at (x, z) from every volcano's plume, as if all were erupting (0 .. 1). */
  plumeAt(x: number, z: number, wx: number, wz: number): number {
    let ash = 0;
    for (const v of this.volcanoes) {
      const rx = x - v.x;
      const rz = z - v.z;
      const along = rx * wx + rz * wz;
      const across = Math.abs(rx * wz - rz * wx);
      // the plume fans out as it travels, and thins away at the end of its reach
      const width = v.r * 0.8 + Math.max(along, 0) * 0.32;
      const lane = smooth(along, -v.r * 0.6, v.r * 0.5) * (1 - smooth(along, PLUME_REACH * 0.55, PLUME_REACH)) * Math.exp(-((across / width) ** 2));
      // and the mountain's own flanks are dusted whichever way it blows
      const flank = 0.45 * (1 - smooth(Math.hypot(rx, rz), v.r * 0.8, v.r * 1.7));
      ash = Math.max(ash, lane, flank);
    }
    return ash;
  }

  update(dt: number, a: Atmosphere, ship: { x: number; z: number; heading: number } | null, playing: boolean, wind: { dirX: number; dirZ: number }, view: { x: number; z: number; dist: number }) {
    // ---- the volcano: long quiet spells, then now and then a restless one
    if (this.spell > 0) {
      this.spell -= dt;
    } else if ((this.quietT -= dt) < 0) {
      this.quietT = 200 + Math.random() * 240;
      if (Math.random() < 0.45 && this.volcanoes.length) {
        this.spell = 150 + Math.random() * 110;
        const v = this.volcanoes[0];
        const d = ship ? Math.hypot(ship.x - v.x, ship.z - v.z) : Infinity;
        if (playing && d < 2600) {
          this.hooks.rumble(0.5, d);
          this.hooks.toast(`${v.name} stirs`, 'Smoke pours from the crater. Downwind it is raining ash and embers', 4.5);
        }
      }
    }
    this.restless += ((this.spell > 0 ? 1 : 0) - this.restless) * (1 - Math.exp(-dt / 18));
    a.ashTo = ship ? this.plumeAt(ship.x, ship.z, wind.dirX, wind.dirZ) * this.restless : 0;
    this.embers.update(a.ash, view.x, view.z);

    // ---- the crew notice where they are
    if (ship && playing) {
      const ashy = a.ash > 0.45 && a.kind !== 'embers';
      if (ashy && !this.inAsh) {
        const v = this.volcanoes[0];
        this.hooks.toast('Ember rain', `Warm ash and glowing embers drift down from ${v ? v.name : 'the volcano'}`, 4);
      }
      this.inAsh = a.ash > (this.inAsh ? 0.3 : 0.45);
      const bloom = a.glow > 0.5 && seaGlowAt(ship.x, ship.z) > 0.4;
      if (bloom && !this.inBloom) this.hooks.toast('The sea is glowing', 'A bloom of sea-sparks: every wake and breaking wave lights up blue', 4.5);
      this.inBloom = a.glow > 0.35 && seaGlowAt(ship.x, ship.z) > (this.inBloom ? 0.2 : 0.4);
    }

    // ---- mirages: every ten seconds of a scorching noon, one chance in twenty
    const m = this.mirage;
    if ((this.mirageT -= dt) < 0) {
      this.mirageT = 10;
      if (ship && playing && a.heat > 0.6 && !m.active && Math.random() < 0.05) this.conjure(ship, view.dist);
    }
    if (ship) m.update(dt, ship.x, ship.z, a.heat);
  }

  /** An island shimmers up dead ahead of the ship, far enough off to watch her sail into it. */
  conjure(ship: { x: number; z: number; heading: number }, camDist: number) {
    const d = THREE.MathUtils.clamp(camDist * 1.6, 170, 360) + Math.random() * 60;
    const side = (Math.random() - 0.5) * 0.25 * d;
    const fx = Math.sin(ship.heading);
    const fz = Math.cos(ship.heading);
    const x = ship.x + fx * d + fz * side;
    const z = ship.z + fz * d - fx * side;
    const size = 15 + Math.random() * 8;
    // never over (or on top of) real land
    for (let i = 0; i < 7; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const r = i === 6 ? 0 : size * 1.4;
      if (this.hooks.ground(x + Math.cos(ang) * r, z + Math.sin(ang) * r) > -4) return;
    }
    this.mirage.spawn(x, z, size, Math.random() * Math.PI * 2);
    this.mirages++;
    this.hooks.shimmer();
    if (this.mirages === 1) this.hooks.toast('Land ho…?', 'An island shimmers up ahead where no chart shows one', 4.5);
    else this.hooks.toast('A mirage', 'The heat conjures another island', 3);
  }
}
