import * as THREE from 'three';
import { angleDelta, clamp, mulberry32 } from '../core/noise';
import { World } from '../game/world';
import { Ship, gunRange } from './ship';
import { AMMO, AmmoId } from '../game/ammo';
import { ShipClassId } from './shipTypes';
import { clampToRegion } from '../world/regions';
import { Grudge, sideOf } from '../game/peace';

// How often each class of pirate loads something nastier than round shot.
const PIRATE_AMMO: Record<ShipClassId, [AmmoId, number][]> = {
  sloop: [['chain', 0.18], ['grape', 0.16]],
  brig: [['chain', 0.12], ['fire', 0.12], ['grape', 0.1]],
  galleon: [['shell', 0.2], ['fire', 0.1], ['grape', 0.14]],
};

// Pirate captains: patrol between open-water waypoints, hunt the player when
// spotted, jockey for a broadside at their preferred range, avoid reefs and
// each other, and run for it when their hull is in tatters.

type Mode = 'patrol' | 'engage' | 'flee';

const _g = new THREE.Vector2();

/** A pirate flotilla: wingmen keep station on the flagship, and when one ship
 *  sights you the whole pack comes about to hunt together. */
export class Pack {
  alertT = -1e9;
  leader: PirateAI | null = null;
}

export class PirateAI {
  mode: Mode = 'patrol';
  private wp = { x: 0, z: 0 };
  private think = 0;
  private desired = 0;
  private sideBias = Math.random() < 0.5 ? 1 : -1;
  private rnd = mulberry32(Math.floor(Math.random() * 1e9));
  private aimDelay = 0;
  readonly aggression: number;
  pack: Pack | null = null;
  /** Station relative to the flagship: x to starboard, z astern (metres). */
  slot = { x: 0, z: 0 };
  /**
   * A named captain sent after you: hunts you from any distance, never strikes
   * her colours, and loads her own favourite shot.
   */
  readonly hunter: boolean;
  private ammoMix: [AmmoId, number][];
  /** Something in the sea even pirates run from (the Kraken): they flee it while it's near. */
  fear: { x: number; z: number } | null = null;
  private scared = false;
  /**
   * Who has given her cause to fight. On peaceful seas she only ever hunts
   * the sides in here; everywhere it keeps a fight she's in from cooling
   * while blows are still being traded.
   */
  readonly grudge = new Grudge();
  /** Peaceful seas: a named hunter with no excuse yet keeps you in sight, just out of reach of her guns. */
  private shadow: Ship | null = null;

  constructor(readonly ship: Ship, difficulty: number, hunt?: { ammo: [AmmoId, number][] }) {
    this.hunter = !!hunt;
    this.ammoMix = hunt?.ammo ?? PIRATE_AMMO[ship.cls.id];
    this.aggression = hunt ? 1 : clamp(0.55 + difficulty * 0.15, 0.4, 1);
    this.wp.x = ship.pos.x;
    this.wp.z = ship.pos.z;
  }

  private pickWaypoint(world: World) {
    for (let i = 0; i < 30; i++) {
      const a = this.rnd() * Math.PI * 2;
      const r = 120 + this.rnd() * 260;
      // she keeps to the archipelago she's in
      const [x, z] = clampToRegion(this.ship.pos.x + Math.cos(a) * r, this.ship.pos.z + Math.sin(a) * r, this.ship.pos.x, this.ship.pos.z);
      if (world.terrain.heightAt(x, z) < -7 && !world.hazards?.vortexAt(x, z, 1.6)) {
        this.wp = { x, z };
        return;
      }
    }
  }

  /**
   * Steering away from shallows and maelstroms: probe ahead and to either side.
   * Hot on your heels a captain reads the breakers over a reef too late and
   * skirts a maelstrom far too close; a named hunter knows these waters
   * better than that, and a phantom floats over the coral as if it weren't
   * there. `escaping`: already in a maelstrom's grip, she only looks for land.
   */
  private avoid(world: World, heading: number, escaping = false): number {
    const s = this.ship;
    const L = s.cls.length;
    const reckless = this.mode === 'engage' && !this.hunter;
    const hz = world.hazards;
    const blocked = (ang: number, d: number) => {
      const x = s.pos.x + Math.sin(ang) * d;
      const z = s.pos.z + Math.cos(ang) * d;
      const h = world.terrain.heightAt(x, z);
      if (h > -s.cls.draft - 1.5) {
        if (h > -0.2 || world.terrain.reefAt(x, z) < 0.3) return true;
        if (!s.ghost && (!reckless || d < L)) return true;
      }
      return !escaping && !!hz && hz.vortexAt(x, z, reckless ? 0.6 : 1.25);
    };
    const look = [L * 0.8, L * 1.6, L * 2.6 + s.speed * 2];
    let ahead = false;
    for (const d of look) if (blocked(heading, d)) ahead = true;
    if (!ahead) return heading;
    for (let k = 1; k <= 6; k++) {
      const off = k * 0.32;
      const left = look.every((d) => !blocked(heading + off, d));
      const right = look.every((d) => !blocked(heading - off, d));
      if (left && right) return heading + off * this.sideBias;
      if (left) return heading + off;
      if (right) return heading - off;
    }
    return heading + Math.PI * 0.6;
  }

  /**
   * Who she's after: you, or one of your escorts if one is nearer or has just
   * hurt her. A named hunter only has eyes for you unless an escort gets right
   * in her way.
   */
  private pickTarget(world: World, player: Ship | null, escorts: Ship[]): Ship | null {
    const s = this.ship;
    const cur = this.target;
    let best: Ship | null = null;
    let bs = Infinity;
    let curScore = Infinity;
    const now = world.time;
    for (const c of player ? [player, ...escorts] : escorts) {
      if (!c.alive || c.removed) continue;
      // peaceful seas: nobody she hasn't been given cause to fight
      if (world.peaceful && !this.grudge.against(c, now)) continue;
      let score = Math.hypot(c.pos.x - s.pos.x, c.pos.z - s.pos.z);
      if (c === player) score *= this.hunter ? 0.35 : 0.8;
      if (s.lastAttacker === c && world.time - s.lastHit < 12) score *= 0.6;
      if (c === cur) curScore = score;
      if (score < bs) {
        bs = score;
        best = c;
      }
    }
    // a little loyalty to the ship she's already fighting, so she doesn't dither between two
    return cur && curScore < bs * 1.3 ? cur : best;
  }

  /** The ship she's hunting (you or one of your escorts), chosen a few times a second. */
  target: Ship | null = null;

  update(dt: number, world: World, player: Ship | null, others: Ship[], escorts: Ship[] = []) {
    const s = this.ship;
    if (!s.alive) {
      s.rudder = 0;
      return;
    }
    this.think -= dt;
    if (!player && !escorts.length) this.target = null;
    else if (this.think <= 0 || (this.target && (!this.target.alive || this.target.removed))) this.target = this.pickTarget(world, player && player.alive ? player : null, escorts);
    const target = this.target && this.target.alive ? this.target : null;
    const dx = target ? target.pos.x - s.pos.x : 0;
    const dz = target ? target.pos.z - s.pos.z : 0;
    const dist = Math.hypot(dx, dz);
    const hpF = s.hp / s.maxHp;
    const range = (s.cls.muzzleSpeed * s.cls.muzzleSpeed) / 14 * 0.55;

    if (this.think <= 0) {
      this.think = 0.4 + this.rnd() * 0.3;
      // still under her guns: the quarrel doesn't cool
      if (target && dist < range * 1.1 && this.grudge.against(target, world.time)) this.grudge.mark(sideOf(target), world.time);
      s.wrath = this.grudge.mask(world.time);
      this.shadow = world.peaceful && this.hunter && !target && player && player.alive ? player : null;
      let provoked = !!s.lastAttacker && (s.lastAttacker === player || escorts.includes(s.lastAttacker)) && world.time - s.lastHit < 25;
      const pk = this.pack;
      if (pk && pk.leader && !pk.leader.ship.alive) pk.leader = null;
      // the pack answers a sighting by any of its ships
      if (pk && target && world.time - pk.alertT < 20 && dist < 560) provoked = true;
      // the dead don't run, and they sense the living from further off
      if (this.hunter) this.mode = target ? 'engage' : this.mode === 'engage' ? 'patrol' : this.mode;
      else if (target && hpF < 0.22 && !s.ghost && this.mode !== 'flee' && this.rnd() < 0.5) this.mode = 'flee';
      else if (target && (dist < (s.ghost ? 300 : 230) || provoked) && this.mode !== 'flee') this.mode = 'engage';
      else if (this.mode === 'engage' && (!target || dist > 340)) this.mode = 'patrol';
      else if (this.mode === 'flee' && (!target || dist > 300)) this.mode = 'patrol';

      if (pk && this.mode === 'engage' && target) pk.alertT = world.time;
      const dread = this.fear;
      this.scared = !!dread && Math.hypot(dread.x - s.pos.x, dread.z - s.pos.z) < 520;
      if (dread && this.scared) {
        // every hand to the braces: away from it, guns forgotten
        this.mode = 'flee';
        this.desired = Math.atan2(s.pos.x - dread.x, s.pos.z - dread.z) + Math.sin(world.time * 0.3 + s.id) * 0.25;
        s.sailTarget = 1;
        s.rudder = clamp(angleDelta(s.heading, this.avoid(world, this.desired)) * 2.2, -1, 1);
        return;
      }

      const lead = pk && pk.leader && pk.leader !== this ? pk.leader.ship : null;
      if (this.mode === 'patrol' && this.shadow && !lead) {
        // off your quarter, a little beyond her guns' reach, matching your pace: waiting for her excuse
        const q = this.shadow;
        const sh = Math.sin(q.heading);
        const ch = Math.cos(q.heading);
        const far = range * 1.35;
        const sx = this.sideBias * far * 0.62;
        const sz = far * 0.78;
        const tx = q.pos.x + ch * sx - sh * sz;
        const tz = q.pos.z - sh * sx - ch * sz;
        const gap = Math.hypot(tx - s.pos.x, tz - s.pos.z);
        const close = Math.hypot(q.pos.x - s.pos.x, q.pos.z - s.pos.z) < far * 0.8;
        this.desired = gap < 18 ? q.heading : Math.atan2(tx + sh * 24 - s.pos.x, tz + ch * 24 - s.pos.z);
        // never closer than that: she bears away if you sail at her
        if (close) this.desired = Math.atan2(s.pos.x - q.pos.x, s.pos.z - q.pos.z);
        s.sailTarget = close ? 1 : gap > 70 ? 1 : gap > 30 ? 0.75 : clamp(q.sailTarget + 0.1, 0.3, 1);
      } else if (this.mode === 'patrol' && lead) {
        // keep station on the flagship's quarter
        const sh = Math.sin(lead.heading);
        const ch = Math.cos(lead.heading);
        const tx = lead.pos.x + ch * this.slot.x - sh * this.slot.z;
        const tz = lead.pos.z - sh * this.slot.x - ch * this.slot.z;
        const gap = Math.hypot(tx - s.pos.x, tz - s.pos.z);
        // aim a little ahead of the station so we fall in alongside rather than chase its stern
        const ax = tx + sh * 20;
        const az = tz + ch * 20;
        this.desired = gap < 14 ? lead.heading : Math.atan2(ax - s.pos.x, az - s.pos.z);
        s.sailTarget = clamp(lead.sailTarget + (gap > 40 ? 0.35 : gap > 18 ? 0.15 : 0), 0.25, 1);
      } else if (this.mode === 'patrol') {
        if (Math.hypot(this.wp.x - s.pos.x, this.wp.z - s.pos.z) < 40) this.pickWaypoint(world);
        this.desired = Math.atan2(this.wp.x - s.pos.x, this.wp.z - s.pos.z);
        s.sailTarget = 0.5;
      } else if (this.mode === 'engage' && target) {
        const bearing = Math.atan2(dx, dz);
        const rel = angleDelta(s.heading, bearing);
        // keep the enemy abeam on whichever side is closer (or loaded)
        let side = rel > 0 ? 1 : -1;
        const sideName = side > 0 ? 'port' : 'starboard';
        if (!s.canFire(sideName) && s.canFire(side > 0 ? 'starboard' : 'port') && dist < range * 0.9) side = -side;
        const ideal = range * 0.55;
        let off = Math.PI / 2;
        if (dist > ideal * 1.5) off = Math.PI * 0.22;
        else if (dist > ideal * 1.1) off = Math.PI * 0.38;
        else if (dist < ideal * 0.55) off = Math.PI * 0.72;
        this.desired = bearing - side * off;
        s.sailTarget = dist > ideal * 1.2 ? 1 : 0.75;
      } else if (this.mode === 'flee' && target) {
        this.desired = Math.atan2(-dx, -dz) + Math.sin(world.time * 0.3) * 0.3;
        s.sailTarget = 1;
      }
      // keep clear of other ships
      for (const o of others) {
        if (o === s || !o.alive) continue;
        const ox = o.pos.x - s.pos.x;
        const oz = o.pos.z - s.pos.z;
        const od = Math.hypot(ox, oz);
        const minD = (o.cls.length + s.cls.length) * 0.75;
        if (od < minD) {
          const away = Math.atan2(-ox, -oz);
          this.desired += angleDelta(this.desired, away) * 0.5;
        }
        // peaceful seas: a captain with no quarrel gives your ships a wide berth,
        // reading where your course and hers meet, rather than bumping you into a fight
        if (world.peaceful && o.team === 'player' && !this.grudge.against(o, world.time)) this.giveWay(o, od, ox, oz);
      }
    }

    // the sea has her: in a maelstrom's grip every hand goes to the braces to
    // spiral out with the flow, and hard on the coral she claws off for deep water
    const esc = world.hazards?.escape(s.pos.x, s.pos.z) ?? null;
    if (esc !== null) {
      this.desired = esc;
      s.sailTarget = 1;
    } else if (s.scrape > 0.12) {
      world.terrain.gradientAt(s.pos.x, s.pos.z, _g);
      if (_g.lengthSq() > 1e-6) this.desired = Math.atan2(-_g.x, -_g.y);
      s.sailTarget = 1;
    }
    const steerTo = this.avoid(world, this.desired, esc !== null);
    s.rudder = clamp(angleDelta(s.heading, steerTo) * 2.2, -1, 1);

    // gunnery
    if (target && this.mode !== 'patrol' && !this.scared && dist < range * 1.05) {
      const rel = angleDelta(s.heading, Math.atan2(dx, dz));
      const arc = 0.32 + this.aggression * 0.1;
      this.aimDelay -= dt;
      if (this.aimDelay <= 0) {
        if (Math.abs(rel - Math.PI / 2) < arc && s.canFire('port')) {
          s.ammo = this.pickAmmo(dist, target);
          s.fire('port', world, target);
          this.aimDelay = 0.6 + this.rnd() * 1.2 / this.aggression;
        } else if (Math.abs(rel + Math.PI / 2) < arc && s.canFire('starboard')) {
          s.ammo = this.pickAmmo(dist, target);
          s.fire('starboard', world, target);
          this.aimDelay = 0.6 + this.rnd() * 1.2 / this.aggression;
        }
      }
    }
  }

  /**
   * Keep clear of one of your ships she has no quarrel with: if their courses
   * bring them within a hull's length or so in the next few seconds she bears
   * away from the meeting point, and shortens sail if you're the one coming up
   * on her, so you can sail past.
   */
  private giveWay(o: Ship, od: number, ox: number, oz: number) {
    const s = this.ship;
    const clear = (o.cls.length + s.cls.length) * 0.85 + 6;
    if (od > clear * 3.5) return;
    const rvx = o.vel.x - s.vel.x;
    const rvz = o.vel.z - s.vel.z;
    const rv2 = rvx * rvx + rvz * rvz;
    // when (within the next 9 s) the two pass closest, and how close
    const t = rv2 > 1e-4 ? clamp(-(ox * rvx + oz * rvz) / rv2, 0, 9) : 0;
    const mx = ox + rvx * t;
    const mz = oz + rvz * t;
    const miss = Math.hypot(mx, mz);
    if (miss > clear && od > clear * 1.3) return;
    // bear away from where she'd meet you (straight off you when already close)
    const near = od < clear * 1.3;
    const away = near || miss < 1 ? Math.atan2(-ox, -oz) : Math.atan2(-mx, -mz);
    const k = near ? 0.85 : 0.65 * (1 - t / 12);
    this.desired += angleDelta(this.desired, away) * k;
    if (!near) return;
    // across her bow she spills her wind and lets you by; coming up on her quarter, she makes way
    const ahead = Math.sin(s.heading) * ox + Math.cos(s.heading) * oz > 0;
    s.sailTarget = ahead ? Math.min(s.sailTarget, 0.35) : Math.max(s.sailTarget, 0.75);
  }

  /** Now and then a pirate crew rams home something nastier, if it will reach and isn't wasted. */
  private pickAmmo(dist: number, target: Ship): AmmoId {
    const s = this.ship;
    // a phantom's guns only ever spit ghost-fire
    if (s.ghost) return 'wraith';
    let r = this.rnd();
    for (const [id, p] of this.ammoMix) {
      if (r < p) {
        const reach = gunRange(s.cls.muzzleSpeed * AMMO[id].speed) * 0.9;
        if (dist > reach) return 'round';
        if (id === 'chain' && target.torn > 4) return 'round';
        if (id === 'fire' && target.afire > 4) return 'round';
        if (id === 'grape' && target.crewHit > 4) return 'round';
        return id;
      }
      r -= p;
    }
    return 'round';
  }
}
