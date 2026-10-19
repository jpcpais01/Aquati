import { angleDelta, clamp, mulberry32 } from '../core/noise';
import { World } from '../game/world';
import { Ship } from './ship';

// Pirate captains: patrol between open-water waypoints, hunt the player when
// spotted, jockey for a broadside at their preferred range, avoid reefs and
// each other, and run for it when their hull is in tatters.

type Mode = 'patrol' | 'engage' | 'flee';

export class PirateAI {
  mode: Mode = 'patrol';
  private wp = { x: 0, z: 0 };
  private think = 0;
  private desired = 0;
  private sideBias = Math.random() < 0.5 ? 1 : -1;
  private rnd = mulberry32(Math.floor(Math.random() * 1e9));
  private aimDelay = 0;
  readonly aggression: number;

  constructor(readonly ship: Ship, difficulty: number) {
    this.aggression = clamp(0.55 + difficulty * 0.15, 0.4, 1);
    this.wp.x = ship.pos.x;
    this.wp.z = ship.pos.z;
  }

  private pickWaypoint(world: World) {
    for (let i = 0; i < 30; i++) {
      const a = this.rnd() * Math.PI * 2;
      const r = 120 + this.rnd() * 260;
      const x = clamp(this.ship.pos.x + Math.cos(a) * r, -880, 880);
      const z = clamp(this.ship.pos.z + Math.sin(a) * r, -880, 880);
      if (world.terrain.heightAt(x, z) < -7) {
        this.wp = { x, z };
        return;
      }
    }
  }

  /** Steering away from shallows: probe ahead and to either side. */
  private avoid(world: World, heading: number): number {
    const s = this.ship;
    const L = s.cls.length;
    const blocked = (ang: number, d: number) => {
      const x = s.pos.x + Math.sin(ang) * d;
      const z = s.pos.z + Math.cos(ang) * d;
      return world.terrain.heightAt(x, z) > -s.cls.draft - 1.5;
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

  update(dt: number, world: World, player: Ship | null, others: Ship[]) {
    const s = this.ship;
    if (!s.alive) {
      s.rudder = 0;
      return;
    }
    this.think -= dt;
    const target = player && player.alive ? player : null;
    const dx = target ? target.pos.x - s.pos.x : 0;
    const dz = target ? target.pos.z - s.pos.z : 0;
    const dist = Math.hypot(dx, dz);
    const hpF = s.hp / s.maxHp;
    const range = (s.cls.muzzleSpeed * s.cls.muzzleSpeed) / 14 * 0.55;

    if (this.think <= 0) {
      this.think = 0.4 + this.rnd() * 0.3;
      const provoked = s.lastAttacker === target && world.time - s.lastHit < 25;
      if (target && hpF < 0.22 && this.mode !== 'flee' && this.rnd() < 0.5) this.mode = 'flee';
      else if (target && (dist < 230 || provoked) && this.mode !== 'flee') this.mode = 'engage';
      else if (this.mode === 'engage' && (!target || dist > 340)) this.mode = 'patrol';
      else if (this.mode === 'flee' && (!target || dist > 300)) this.mode = 'patrol';

      if (this.mode === 'patrol') {
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
      }
    }

    const steerTo = this.avoid(world, this.desired);
    s.rudder = clamp(angleDelta(s.heading, steerTo) * 2.2, -1, 1);

    // gunnery
    if (target && this.mode !== 'patrol' && dist < range * 1.05) {
      const rel = angleDelta(s.heading, Math.atan2(dx, dz));
      const arc = 0.32 + this.aggression * 0.1;
      this.aimDelay -= dt;
      if (this.aimDelay <= 0) {
        if (Math.abs(rel - Math.PI / 2) < arc && s.canFire('port')) {
          s.fire('port', world, target);
          this.aimDelay = 0.6 + this.rnd() * 1.2 / this.aggression;
        } else if (Math.abs(rel + Math.PI / 2) < arc && s.canFire('starboard')) {
          s.fire('starboard', world, target);
          this.aimDelay = 0.6 + this.rnd() * 1.2 / this.aggression;
        }
      }
    }
  }
}
