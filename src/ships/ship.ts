import * as THREE from 'three';
import { angleDelta, clamp, damp, lerp, smoothstep } from '../core/noise';
import { World } from '../game/world';
import { AMMO, AmmoId, EFFECT } from '../game/ammo';
import { globalUniforms } from '../render/environment';
import { BowWave } from '../fx/bowWave';
import { ShipModel } from './shipModel';
import { ShipDamage, WRECK_LIFE } from './shipDamage';
import { Livery, ShipClass } from './shipTypes';

export type Team = 'player' | 'pirate';

/** How a blow lands when other captains share the sea: on her for real, only seen here, or seen here and told to her owner. */
export type Verdict = 'real' | 'echo' | 'send';

/**
 * Multiplayer's say in a ship's fate (see net/coop.ts). Each ship is sailed by
 * one captain's game; a blow only counts in the game that decides it, and the
 * others just see the splinters fly.
 */
export interface NetRules {
  verdict(target: Ship, attacker: Ship | null): Verdict;
  /** Our shot struck another game's ship: tell its owner (`dmg` already rolled). */
  sent(target: Ship, dmg: number, attacker: Ship, kind: 'blow' | 'fire' | 'chain' | 'grape' | 'dread'): void;
  /** One of our ships ran out a broadside. */
  fired(ship: Ship, side: 'port' | 'starboard', target: Ship | null, point: THREE.Vector3 | null): void;
}

interface PendingShot {
  at: number;
  muzzle: number;
  target: Ship | null;
  point: THREE.Vector3 | null;
  ammo: AmmoId;
}

/** How far a player's guns can train fore and aft of square, radians. The firing arcs on the water show exactly this. */
export const PLAYER_ARC = 0.5;
const PIRATE_ARC = 0.32;
const GRAVITY = 14;

/** How far a broadside reaches with the guns at full elevation (and a little to spare). */
/**
 * Low-arc elevation that carries a ball `d` across and `h` up (negative: down).
 * Falls back to 45 degrees when the mark lies out of reach.
 */
export function elevationFor(v: number, d: number, h: number, g = GRAVITY) {
  if (d < 0.01) return 0;
  const a = (g * d * d) / (2 * v * v);
  const disc = d * d - 4 * a * (a + h);
  if (disc < 0) return Math.PI / 4;
  return Math.atan((d - Math.sqrt(disc)) / (2 * a));
}

/** Where chain shot is laid: the middle of her canvas, above the waterline. */
export function sailAimHeight(s: Ship) {
  const mastH = s.cls.masts.reduce((m, d) => Math.max(m, d.height), 0);
  return s.model.shape.top(0.5) + 0.6 + mastH * 0.42;
}

export const gunRange = (muzzleSpeed: number) => ((muzzleSpeed * muzzleSpeed) / GRAVITY) * 0.62;

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

// Hull pressure along the keel: [fraction of length from midships, weight, radius in beams].
// The bow shoves water up, the shoulders, waist and quarters draw it down and
// the stern lifts it again (net zero, so a hove-to ship never digs a hole).
// The wake simulation turns this into the bow and stern V-waves.
const HULL_PRESSURE: [number, number, number][] = [
  [0.44, 1, 0.32],
  [0.24, -0.75, 0.36],
  [0.0, -0.5, 0.4],
  [-0.22, -0.35, 0.38],
  [-0.42, 0.6, 0.34],
];

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _g = new THREE.Vector2();
const _fp = new THREE.Vector3();
let SHIP_ID = 0;

export class Ship {
  /** Set while other captains share the sea; null sailing alone. */
  static net: NetRules | null = null;
  readonly id = ++SHIP_ID;
  /** Another captain's game sails her: she goes where it says, and only it decides her fate. */
  remote = false;
  /** The captain at her helm, when she is someone's flagship in a shared sea. */
  captain: string | null = null;
  readonly root = new THREE.Group();
  readonly model: ShipModel;
  readonly dmg: ShipDamage;
  /** The curling sheet of white water at the stem; drawn in the water pass (the game adds it). */
  readonly bowWave: BowWave;
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
  /**
   * Seconds the wreck lingers afloat before her final plunge. Your own ship
   * founders within moments, bow lifting as the stern drags her under, so the
   * farewell can follow her down.
   */
  wreckLife = WRECK_LIFE;
  /**
   * Founders go down by the stern and come to rest on the seabed (your own
   * ship, for the farewell); every other wreck slips under and is gone.
   */
  founders = false;
  removed = false;
  reload = { port: 0, starboard: 0 };
  /** The full reload each side started from (it depends on the shot loaded). */
  readonly reloadFull: { port: number; starboard: number };
  /** The shot the guns load for the next broadside. */
  ammo: AmmoId = 'round';
  /** Seconds left burning (fire shot), and who lit her. */
  afire = 0;
  afireBy: Ship | null = null;
  /** Seconds the canvas stays shredded (chain shot). */
  torn = 0;
  /** Seconds the gun crews stay thinned (grape shot). */
  crewHit = 0;
  private burnAcc = 0;
  private burnT = 0;
  lastHit = -100;
  lastAttacker: Ship | null = null;
  burning = 0;
  gold = 0;
  kills = 0;
  /**
   * A named captain's edge over an ordinary crew: a stouter hull, heavier and
   * quicker guns, more way, and a steadier aim (scales the pirates' scatter).
   */
  readonly boost = { hp: 1, guns: 1, reload: 1, speed: 1, aim: 1 };
  /** The named captain aboard (see game/bounty.ts), if she is a hunter. */
  hunter: string | null = null;
  anchored = false;
  /** Taken in a boarding action and sailing off under a prize crew: no longer anybody's enemy. */
  prize = false;
  /** A fort's guns standing in as the owner of its shot (never a real ship). */
  battery = false;
  /** Held fast (0 free .. 1): the Kraken's coils round her hull stop her in the water. */
  held = 0;
  /** Sideways drift (x, z m/s) from being shoved by another hull; bleeds off against the water. */
  readonly drift = new THREE.Vector2();
  /** The water's own flow under her (x, z m/s): a maelstrom's current, set each frame by the hazards. */
  readonly current = new THREE.Vector2();
  /** How fast the turning water swings her head round (rad/s), likewise. */
  spin = 0;
  /** How hard her keel is grinding on coral (0 clear .. 1 hard aground), eased. */
  scrape = 0;
  /** Water over the coral where she last struck it (m). */
  reefDepth = 0;
  private scrapeAcc = 0;
  private scrapeT = 0;
  /** World time each gun last fired, by muzzle index (crews time their drill to it). */
  readonly gunFiredAt: number[];
  private pending: PendingShot[] = [];
  private heave = 0;
  private swellHeave = 0;
  private pitch = 0;
  private roll = 0;
  private rollKick = 0;
  private groundCooldown = 0;
  private wakeT = 0;
  private sprayT = 0;
  // rig springs: yards and booms swing across instead of snapping on a tack/gybe
  private rigBrace = 0;
  private rigBraceV = 0;
  private rigLee = 1;
  private rigLeeV = 0;
  private leeTarget = 1;
  private fireT = 0;
  private galleyT = Math.random();
  name: string;
  /** Vault cannon cosmetics (style ids): the flash and smoke at the gun, the wake behind the ball. */
  readonly cannonFx = { blast: 'powder', trail: 'powder' };
  /**
   * A phantom: sails on whatever the wind does, slips half the sea's grip,
   * shrugs off fire and grape, lets some shot pass clean through, and
   * fades away instead of foundering.
   */
  readonly ghost: boolean;
  /** How far a ghost has materialised (0 mist .. 1 there); she fades in from wherever it starts. */
  presence = 1;
  private flare = 0;
  private mistT = 0;

  /** `model` may be one built ahead of time (see ShipModel's deferred build). */
  constructor(readonly cls: ShipClass, readonly livery: Livery, public team: Team, quality = 1, model?: ShipModel) {
    this.ghost = !!livery.ghost;
    this.model = model ?? new ShipModel(cls, livery, quality);
    this.root.add(this.model.root);
    this.root.rotation.order = 'YXZ';
    this.dmg = new ShipDamage(this);
    this.bowWave = new BowWave(this.model.shape, cls.length, cls.beam);
    this.hp = cls.hp;
    this.name = cls.title;
    this.gunFiredAt = this.model.muzzles.map(() => -100);
    this.reloadFull = { port: cls.reload, starboard: cls.reload };
  }

  /** Muzzle velocity with the loaded shot (lighter and lumpier shot flies slower and falls shorter). */
  get muzzleSpeed() {
    return this.cls.muzzleSpeed * AMMO[this.ammo].speed;
  }

  /** Fire shot struck home: she burns for longer with each ball. Returns true if she just caught. */
  ignite(by: Ship | null): boolean {
    if (!this.alive || this.ghost || !this.effect(by, 'fire')) return false;
    const fresh = this.afire <= 0;
    this.afire = Math.min(EFFECT.burnMax, Math.max(0, this.afire) + EFFECT.burnPerHit);
    if (by) this.afireBy = by;
    return fresh;
  }

  /** Chain shot tore through the canvas. Returns true if her sails were whole a moment ago. */
  shred(by: Ship | null = null): boolean {
    if (!this.alive || !this.effect(by, 'chain')) return false;
    const fresh = this.torn <= 0;
    this.torn = EFFECT.tornTime;
    return fresh;
  }

  /** Grape shot swept the deck. Returns true if her crews were at full strength. */
  rake(by: Ship | null = null): boolean {
    if (!this.alive || this.ghost || !this.effect(by, 'grape')) return false;
    const fresh = this.crewHit <= 0;
    this.crewHit = EFFECT.crewTime;
    return fresh;
  }

  /** Wraith-fire struck her: the crews shrink from their guns. Returns true if they were steady a moment ago. */
  terrify(by: Ship | null = null): boolean {
    if (!this.alive || this.ghost || !this.effect(by, 'dread')) return false;
    const fresh = this.crewHit <= 0;
    this.crewHit = Math.max(this.crewHit, EFFECT.dreadTime);
    return fresh;
  }

  /**
   * In a shared sea, whether a special shot's effect takes hold here: always on
   * a ship we decide, as a look on another's (her owner sends the truth), and
   * never twice on ours from a ball another game already told us about.
   */
  private effect(by: Ship | null, kind: 'fire' | 'chain' | 'grape' | 'dread') {
    const net = Ship.net;
    if (!net || !by) return true;
    const v = net.verdict(this, by);
    if (v === 'send') net.sent(this, 0, by, kind);
    return v !== 'echo' || this.remote;
  }

  /** Heel the hull over by `amount` radians (positive lifts the port rail); it springs back on its own. */
  kickRoll(amount: number) {
    this.rollKick = clamp(this.rollKick + amount, -0.3, 0.3);
  }

  get maxHp() {
    return Math.round(this.cls.hp * this.boost.hp);
  }

  /** Makes her a named captain's ship: boosted, and her hull filled to the new strength. */
  setBoost(b: Ship['boost']) {
    Object.assign(this.boost, b);
    this.hp = this.maxHp;
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

  /** Begins a rippling broadside at a ship (led) or a point on the water. Returns false while reloading. */
  fire(side: 'port' | 'starboard', world: World, target: Ship | null = null, point: THREE.Vector3 | null = null): boolean {
    if (!this.canFire(side)) return false;
    const s = side === 'port' ? 1 : -1;
    const ms = this.model.muzzles.map((m, i) => ({ m, i })).filter((e) => e.m.side === s);
    // fire from the middle outward for a rolling thunder
    ms.sort((a, b) => Math.abs(a.m.pos.z) - Math.abs(b.m.pos.z));
    const pt = point ? point.clone() : null;
    const ammo = this.ammo;
    ms.forEach((e, k) => this.pending.push({ at: world.time + k * 0.085 + Math.random() * 0.05, muzzle: e.i, target, point: pt, ammo }));
    this.reload[side] = this.reloadFull[side] = this.cls.reload * AMMO[ammo].reload * this.boost.reload;
    this.rollKick += s * 0.05 * (this.cls.cannonsPerSide / 5) / this.cls.mass;
    if (Ship.net && !this.remote) Ship.net.fired(this, side, target, pt);
    return true;
  }

  private shoot(p: PendingShot, world: World) {
    const m = this.model.muzzles[p.muzzle];
    this.gunFiredAt[p.muzzle] = world.time;
    this.root.updateMatrixWorld();
    const pos = m.pos.clone().applyMatrix4(this.model.root.matrixWorld);
    const dir = m.dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.heading);
    const am = AMMO[p.ammo];
    const v = this.cls.muzzleSpeed * am.speed * (0.97 + Math.random() * 0.06);
    const g = GRAVITY;
    const mine = this.team === 'player';
    let dist = 60;
    let aimH: number | null = null;
    const aim = p.target && p.target.alive ? p.target.pos : p.point;
    if (aim) {
      // Lead the target. Your own crews also allow for the ship's way, which the
      // ball keeps: in a running duel that drift alone used to carry whole
      // broadsides past the bow. Pirate crews only lead their mark.
      const tv = p.target && p.target.alive ? p.target.vel : null;
      const rvx = (tv ? tv.x : 0) - (mine ? this.vel.x : 0);
      const rvz = (tv ? tv.z : 0) - (mine ? this.vel.z : 0);
      // chain shot is laid high, into her sails, not on the waterline
      if (p.ammo === 'chain' && p.target && p.target.alive) aimH = p.target.pos.y + sailAimHeight(p.target) - pos.y;
      let tof = Math.hypot(aim.x - pos.x, aim.z - pos.z) / (v * 0.95);
      for (let it = 0; it < 2; it++) {
        _v2.set(aim.x + rvx * tof - pos.x, 0, aim.z + rvz * tof - pos.z);
        const e = aimH !== null ? elevationFor(v, _v2.length(), aimH, g) : 0.5 * Math.asin(clamp((g * _v2.length()) / (v * v), 0, 1));
        tof = _v2.length() / (v * Math.cos(e));
      }
      dist = _v2.length();
      const ang = Math.atan2(_v2.x, _v2.z);
      const base = Math.atan2(dir.x, dir.z);
      const arc = mine ? PLAYER_ARC : PIRATE_ARC;
      const fa = base + clamp(angleDelta(base, ang), -arc, arc);
      dir.set(Math.sin(fa), 0, Math.cos(fa));
    }
    // (aim points only lie past the usual reach for a mark up on a fort's walls, which wants the higher arc)
    const elev = aimH !== null ? clamp(elevationFor(v, dist, aimH, g), -0.05, 0.7) : clamp(0.5 * Math.asin(clamp((g * dist) / (v * v), 0, 1)), 0.015, 0.47);
    // pirate gun crews are a little less disciplined than yours
    const sloppy = mine ? 1 : 2.4 * this.boost.aim;
    const yaw = (Math.random() - 0.5) * 0.035 * sloppy;
    const pitch = elev + (Math.random() - 0.5) * 0.02 * sloppy;
    const fa0 = Math.atan2(dir.x, dir.z) + yaw;
    // grape: a bag of balls bursting out in a cone; everything else, one ball
    for (let b = 0; b < am.balls; b++) {
      const sy = b ? (Math.random() - 0.5) * 2 * am.spread : 0;
      const sp = b ? (Math.random() - 0.5) * am.spread : 0;
      const fa = fa0 + sy;
      const pa = pitch + sp;
      const vk = b ? 0.94 + Math.random() * 0.1 : 1;
      const vel = new THREE.Vector3(Math.sin(fa) * Math.cos(pa), Math.sin(pa), Math.cos(fa) * Math.cos(pa)).multiplyScalar(v * vk);
      vel.add(this.vel);
      world.onShot({ pos: b ? pos.clone() : pos, vel, owner: this, damage: this.cls.damage * am.damage * this.boost.guns, trail: am.trail ?? this.cannonFx.trail, ammo: p.ammo });
    }
    world.particles.muzzle(pos, dir, this.vel, this.cannonFx.blast);
    if (p.ammo !== 'round') world.particles.ammoMuzzle(pos, dir, this.vel, p.ammo);
    if (this.cannonFx.blast === 'thunder') {
      // the thunderclap's shockwave rings out across the water
      const wx = pos.x + dir.x * 2.5;
      const wz = pos.z + dir.z * 2.5;
      world.wake.stamp(wx, wz, 4, 0.9, true);
      world.wake.push(wx, wz, 2.2, -0.25);
    }
    const [vol, pan, d] = world.soundAt(pos);
    // a phantom's guns: a hollow, muffled boom under a rising spectral howl
    world.audio.cannon(this.ghost ? vol * 0.55 : vol, pan, d, clamp((this.cls.length - 15) / 14, 0, 1));
    if (p.ammo === 'wraith') world.audio.wraith(vol, pan, d);
    world.onShake(this.team === 'player' ? 0.35 : 0.12 * vol, pos);
  }

  /** `at` is the world impact point; `hull` false for shots that only hit the rig; `pierce` ignores armour (wraith-fire). */
  damage(amount: number, attacker: Ship | null, world: World, at: THREE.Vector3 | null = null, hull = true, pierce = false) {
    if (!this.alive) return 0;
    const dmg = amount * (pierce ? 1 : 1 - this.cls.armor) * (0.85 + Math.random() * 0.3);
    // a phantom flares green where she is struck
    if (this.ghost) this.flare = Math.min(1, this.flare + 0.45);
    // in a shared sea only one game decides each blow; the rest see the splinters fly
    const v = Ship.net ? Ship.net.verdict(this, attacker) : 'real';
    if (v === 'real') this.hp -= dmg;
    else if (v === 'send') Ship.net!.sent(this, dmg, attacker!, 'blow');
    if (hull) this.dmg.onHit(at, dmg, world);
    this.lastHit = world.time;
    if (attacker) this.lastAttacker = attacker;
    this.rollKick += (Math.random() - 0.5) * 0.04;
    if (this.hp <= 0) this.die(attacker, world);
    return dmg;
  }

  /** A blow another captain's game decided (multiplayer): the hull takes it as dealt. */
  takeBlow(dmg: number, attacker: Ship | null, world: World) {
    if (!this.alive) return;
    this.hp -= dmg;
    this.lastHit = world.time;
    if (attacker) this.lastAttacker = attacker;
    if (this.hp <= 0) this.die(attacker, world);
  }

  /** She's done for: the blast (or the curse breaking), and the wreck begins to settle. */
  die(attacker: Ship | null, world: World) {
    if (!this.alive) return;
    this.hp = 0;
    this.alive = false;
    this.sinkT = 0;
    if (attacker) attacker.kills++;
    const [vol, pan, d] = world.soundAt(this.pos);
    if (this.ghost) {
      // no blast: the curse breaks, and she comes apart into the mist she came from
      world.particles.exorcism(this.pos.clone().setY(this.model.shape.mainDeckY(0.5)), this.cls.length);
      world.audio.exorcise(vol, pan, d);
    } else {
      world.particles.explosion(this.pos.clone().setY(this.model.shape.mainDeckY(0.5)), 0.6 + this.cls.length / 40);
      world.audio.explosion(vol, pan, d);
    }
    world.onShake(this.team === 'player' ? 1.2 : 0.5 * vol, this.pos);
    this.dmg.onDeath(world);
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
    // grape shot thinned the gun crews: the survivors reload slower
    const rl = dt * (this.crewHit > 0 ? EFFECT.crewReload : 1);
    this.reload.port = Math.max(0, this.reload.port - rl);
    this.reload.starboard = Math.max(0, this.reload.starboard - rl);
    this.crewHit = Math.max(0, this.crewHit - dt);
    this.torn = Math.max(0, this.torn - dt);
    if (this.afire > 0) {
      // rain beats the flames down sooner
      this.afire -= dt * (1 + globalUniforms.uRain.value * 1.6);
      if (this.alive) {
        this.burnAcc += this.maxHp * EFFECT.burnRate * dt;
        this.burnT += dt;
        if (this.burnT >= 0.8 || this.afire <= 0) {
          const d = this.damage(this.burnAcc, this.afireBy, world, null, false);
          world.onDot(this, this.afireBy, d);
          if (Math.random() < 0.5) {
            const [vol, pan, dd] = world.soundAt(this.pos);
            world.audio.flames(vol, pan, dd);
          }
          this.burnAcc = 0;
          this.burnT = 0;
        }
      }
      if (this.afire <= 0) {
        this.afire = 0;
        this.afireBy = null;
      }
    }

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
      // shredded canvas (chain shot) draws far less wind, mending over the last few seconds
      const tornK = 1 - EFFECT.tornSlow * Math.min(1, this.torn / 3);
      const hpF = (0.72 + 0.28 * (this.hp / this.maxHp)) * this.dmg.speedFactor * tornK;
      // a ghost sails on a wind of her own, dead into the eye of the real one if she likes
      const wf = this.ghost ? 1.02 : windFactor(relDeg) * (0.75 + 0.25 * w.strength) * (1 + gust * 0.08);
      const target = c.maxSpeed * this.boost.speed * this.sailLevel * wf * hpF * (1 - this.held * 0.92);
      const rate = target > this.speed ? c.accel : c.accel * (1.4 + this.held * 3);
      this.speed += (target - this.speed) * damp(rate, dt);
      const steer = clamp(0.28 + 0.9 * (this.speed / c.maxSpeed), 0.28, 1.1);
      const targetAng = this.rudder * c.turnRate * steer * (1 - this.held * 0.8);
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
    this.heading += (this.angVel + this.spin) * dt;

    // leeway: a little sideways slip with the wind
    const port = this.portDir(_v2);
    const cross = w.dirX * port.x + w.dirZ * port.z;
    const slip = cross * 0.35 * this.sailLevel * w.strength;
    // a shove from another hull: the keel resists sideways motion far more than fore-and-aft
    this.drift.multiplyScalar(1 - damp(1.5, dt));
    this.vel.set(fx * this.speed + port.x * slip + this.drift.x + this.current.x, 0, fz * this.speed + port.z * slip + this.drift.y + this.current.y);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    // ------------------------------------------------ land
    this.groundCooldown -= dt;
    const L = c.length;
    const probes = [0.46, 0.2, -0.1, -0.42];
    let grind = 0;
    let gx = 0;
    let gz = 0;
    for (const pf of probes) {
      const px = this.pos.x + fx * L * pf;
      const pz = this.pos.z + fz * L * pf;
      const h = world.terrain.heightAt(px, pz);
      // open-sea coral: no beach to run up on, just a crest a keel either clears
      // or grinds across, depending on how much water she draws (a phantom's
      // hull floats over it untouched)
      const reef = h < 0 ? world.terrain.reefAt(px, pz) : 0;
      if (reef > 0.3) {
        if (!this.ghost) {
          const k = clamp((h + c.draft * 0.95) / 0.9, 0, 1) * smoothstep(0.3, 0.6, reef);
          if (k > grind) {
            grind = k;
            gx = px;
            gz = pz;
          }
        }
        continue;
      }
      const lim = -c.draft * 0.75;
      if (h > lim) {
        world.terrain.gradientAt(px, pz, _g);
        const gl = Math.max(_g.length(), 1e-3);
        const push = Math.min(2.5, (h - lim) * 0.6 + 0.05);
        this.pos.x -= (_g.x / gl) * push;
        this.pos.z -= (_g.y / gl) * push;
        if (this.speed > 3.5 && this.groundCooldown <= 0 && this.alive) {
          this.damage(this.speed * 1.8, null, world, _fp.set(px, 0.2, pz));
          this.groundCooldown = 1.2;
          world.particles.sandHit(new THREE.Vector3(px, 0.5, pz));
          world.particles.splash(new THREE.Vector3(px, world.waterHeight(px, pz), pz), 0.5 + Math.min(0.6, this.speed / 25));
          const [vol, pan, d] = world.soundAt(this.pos);
          world.audio.crunch(vol, pan, d, Math.min(1, this.speed / 12));
          world.audio.thud(vol, pan, d);
          world.onShake(this.team === 'player' ? 0.5 : 0, this.pos);
        }
        this.speed *= pf > 0.3 ? 0.86 : 0.95;
      }
    }
    this.grindReef(grind, gx, gz, dt, world);
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
    // a maelstrom's funnel is no swell to ride over: she sits down its wall at once
    const funnel = world.funnelAt(this.pos.x, this.pos.z);
    const targetHeave = (hb + hs + hp + hst) * 0.25 + funnel;
    const targetPitch = -Math.atan2(hb - hs, L * 0.76) * 0.9;
    let targetRoll = Math.atan2(hp - hst, B) * 0.8;
    targetRoll += this.angVel * this.speed * 0.022; // heel out of the turn
    targetRoll += -cross * this.sailLevel * w.strength * 0.07 / Math.sqrt(c.mass); // heel to leeward
    this.rollKick *= 1 - damp(2.2, dt);
    targetRoll += this.rollKick;
    let sinkY = 0;
    let pitchTarget = targetPitch;
    let swell = 1;
    if (!this.alive) {
      // the wreck settles into its final pose and lingers before slipping under
      this.sinkT += dt;
      const wr = this.dmg.wreckPose(this.sinkT, dt, world);
      sinkY = wr.y;
      // once she's under, the swell no longer lifts her
      swell = wr.afloat;
      pitchTarget = targetPitch * 0.3 * swell + wr.pitch;
      targetRoll = targetRoll * 0.3 * swell + wr.roll;
      if (wr.done) this.removed = true;
      // a laid ghost is gone once the last of her has dissolved
      if (this.ghost && this.sinkT > GHOST_FADE + 1) this.removed = true;
    } else {
      // flooding: she rides lower and lists toward her holes
      this.dmg.update(dt, world);
      sinkY = -this.dmg.lowered;
      targetRoll += this.dmg.list;
    }
    this.swellHeave += (targetHeave * swell - this.swellHeave) * resp;
    this.heave = this.swellHeave - funnel;
    this.pitch += (pitchTarget - this.pitch) * resp;
    this.roll += (targetRoll - this.roll) * resp;

    this.root.position.set(this.pos.x, this.heave + sinkY - c.draft * 0.06, this.pos.z);
    this.root.rotation.set(this.pitch, this.heading, this.roll);
    // hit tests and fx read the world matrix before the next render
    this.root.updateMatrixWorld();
    this.dmg.syncFrames();

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
    const fill = this.ghost
      ? 0.95 + 0.25 * Math.sin(world.time * 0.7 + this.id)
      : clamp(windFactor(relDeg) * w.strength * (1.1 + gust * 0.45), 0.25, 1.25) * (0.3 + 0.7 * Math.min(1, Math.abs(leeSide)));
    this.model.updateRig(this.sailLevel, -brace, leeSide, flagAng, fill);
    this.model.tick(world.time);

    // ------------------------------------------------ wake & fx
    // a ghost barely troubles the water
    const wakeK = (this.alive ? 1 : Math.max(0, 1 - this.sinkT / 3)) * (this.ghost ? 0.3 * this.presence : 1);
    const spd = Math.abs(this.speed);
    if (spd > 0.3 && wakeK > 0) {
      // pressure every frame: the water field grows the Kelvin arms and transverse swell from it
      // the bow surges and eases as she pitches and the hull yaws a touch, so the arms come
      // out uneven; a little per-frame jitter roughens the crests
      const tt = world.time + this.id * 7.31;
      const surge = 1 + 0.22 * Math.sin(tt * 1.37) * Math.sin(tt * 0.53 + 1.1) + this.pitch * 3;
      const press = 10.5 * (Math.min(spd, 16) / 12) * Math.sqrt(B / 6.2) * wakeK * dt * Math.max(0.5, surge);
      const yaw = Math.sin(tt * 0.71) * 0.12 * B;
      for (const [u, wgt, r] of HULL_PRESSURE) {
        const j = (Math.random() - 0.5) * 0.16 * B + yaw * u * 2;
        const a = 1 + (Math.random() - 0.5) * 0.35;
        world.wake.press(this.pos.x + fx * L * u + port.x * j, this.pos.z + fz * L * u + port.z * j, B * r * (0.9 + Math.random() * 0.2), press * wgt * a);
      }
    }
    this.wakeT += dt;
    if (this.wakeT > 0.04 && spd > 0.5 && wakeK > 0) {
      this.wakeT = 0;
      const k = clamp(spd / 12, 0, 1.25) * wakeK;
      const px = port.x;
      const pz = port.z;
      // stern: churned white wash, a dense core with ragged eddies tumbling off it
      const sx = this.pos.x - fx * L * 0.5;
      const sz = this.pos.z - fz * L * 0.5;
      world.wake.stamp(sx, sz, B * 0.5, 0.3 * k);
      for (let i = 0; i < 2; i++) {
        const o = (Math.random() - 0.5) * B * 0.8;
        const a = Math.random() * L * 0.12;
        world.wake.stamp(sx + px * o - fx * a, sz + pz * o - fz * a, B * (0.18 + Math.random() * 0.16), 0.16 * k);
      }
      // where the bow sheet runs out onto the sea it leaves fine ribbons of lace that
      // peel away on both sides (thin stamps strung along its landing line, not blobs)
      const rnd = () => 0.5 + Math.random();
      for (const side of [1, -1]) {
        const ox = px * side * B;
        const oz = pz * side * B;
        for (const s0 of [0.22, 0.45, 0.7, 0.92]) {
          const [lx, lz] = this.bowWave.landing(s0 + (Math.random() - 0.5) * 0.08, side);
          const wx = this.pos.x + px * lx + fx * lz;
          const wz = this.pos.z + pz * lx + fz * lz;
          world.wake.stamp(wx, wz, (0.35 + Math.random() * 0.3) * Math.sqrt(B / 6.2), (0.22 + 0.1 * s0) * k * rnd());
        }
        // lateral wash hugging the hull, in uneven clumps
        if (Math.random() < 0.7) {
          const u = 0.2 - Math.random() * 0.45;
          world.wake.stamp(this.pos.x + fx * L * u + ox * (0.5 + Math.random() * 0.14), this.pos.z + fz * L * u + oz * (0.5 + Math.random() * 0.14), B * 0.2 * rnd(), 0.16 * k * rnd());
        }
      }
      // hard over: the stern skids outward and smears a fan of foam
      const skid = Math.min(1, Math.abs(this.angVel) * spd * 0.12);
      if (skid > 0.08) {
        const out = -Math.sign(this.angVel) * B * 0.55;
        world.wake.stamp(this.pos.x - fx * L * 0.38 + px * out, this.pos.z - fz * L * 0.38 + pz * out, B * 0.36, 0.22 * skid * wakeK);
      }
    }
    // the bow wave sheet rides the waterline, growing with speed
    const bowAmp = this.alive ? Math.min(1.2, spd / 12) * wakeK : 0;
    this.bowWave.update(this.pos.x, this.heave, this.pos.z, this.heading, this.pitch * 0.8, bowAmp, spd, dt);
    // bow spray: fine droplets thrown off the crest of the sheet at speed, in bursts when
    // she buries her nose in a swell. Small, quick and falling: water, not puffs of smoke.
    if (this.alive && !this.ghost && spd > c.maxSpeed * 0.35) {
      const fast = (spd / c.maxSpeed - 0.35) / 0.65;
      const slam = Math.max(0, this.pitch - 0.02) * 30; // positive pitch = bow down
      this.sprayT += dt * (fast * fast * 40 + slam * 50);
      const crest = this.heave + (0.18 + 0.7 * bowAmp) * Math.sqrt(B / 6.2) * 0.9;
      while (this.sprayT > 1) {
        this.sprayT -= 1;
        const side = Math.random() < 0.5 ? 1 : -1;
        const [lx, lz] = this.bowWave.landing(0.04 + Math.random() * 0.22, side);
        const f = 0.25 + Math.random() * 0.35; // up on the curling lip, not out at the landing line
        const x = this.pos.x + port.x * lx * f + fx * lz;
        const z = this.pos.z + port.z * lx * f + fz * lz;
        const out = 1.2 + Math.random() * 2.6 + fast * 1.5;
        const up = 1.6 + Math.random() * 2.4 + slam * 0.8;
        const n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
          const jx = (Math.random() - 0.5) * 0.6;
          const jy = Math.random() * 0.5;
          world.particles.emit({
            x, y: crest, z,
            vx: port.x * side * (out + jx) + this.vel.x * 0.9 - fx * Math.random() * 1.5,
            vy: up + jy,
            vz: port.z * side * (out + jx) + this.vel.z * 0.9 - fz * Math.random() * 1.5,
            life: 0.4 + Math.random() * 0.4, size: 0.06 + Math.random() * 0.09, sizeEnd: 0.035,
            color: [1.4, 1.5, 1.55], alpha: 0.9, grav: 14, drag: 0.5, kind: 0, fadeIn: 0.01,
          });
        }
      }
    }
    // a lazy wisp from the galley stovepipe, carried off downwind
    const pipe = this.model.chimney;
    if (this.ghost) this.haunt(dt, world);
    else if (pipe && this.alive) {
      this.galleyT += dt * 2.2;
      while (this.galleyT > 1) {
        this.galleyT -= 1;
        _fp.copy(pipe).applyMatrix4(this.model.root.matrixWorld);
        const drift = 0.6 + w.strength * 1.4;
        world.particles.emit({
          x: _fp.x, y: _fp.y + 0.05, z: _fp.z,
          vx: this.vel.x * 0.85 + w.dirX * drift + (Math.random() - 0.5) * 0.2, vy: 0.7 + Math.random() * 0.3, vz: this.vel.z * 0.85 + w.dirZ * drift + (Math.random() - 0.5) * 0.2,
          life: 2.2 + Math.random() * 1.2, size: 0.32, sizeEnd: 1.6 + Math.random() * 0.8,
          color: [0.82, 0.8, 0.78], colorEnd: [1.05, 1.04, 1.02], alpha: 0.32, drag: 0.6, grav: -0.15, spin: (Math.random() - 0.5) * 0.6, kind: 1, fadeIn: 0.15,
        });
      }
    }
    // fires when badly damaged or sinking, doused as she goes under
    const hpFrac = this.hp / this.maxHp;
    this.burning = this.alive ? (hpFrac < 0.4 ? (0.4 - hpFrac) / 0.4 : 0) : this.sinkT < 22 ? (1 - this.sinkT / 26) * swell ** 3 : 0;
    // set alight by fire shot: the flames run along her whole deck
    if (this.afire > 0 && this.alive) this.burning = Math.max(this.burning, 0.55 + 0.45 * Math.min(1, this.afire / 8));
    if (this.burning > 0) {
      this.fireT += dt * (2 + this.burning * 10);
      while (this.fireT > 1) {
        this.fireT -= 1;
        if (this.dmg.firePoint(world, _fp)) {
          if (this.ghost) world.particles.spiritFlame(_fp, 0.7 + this.burning * 0.6);
          else world.particles.flame(_fp, 0.7 + this.burning * 0.6);
        }
      }
    }
  }

  /**
   * A ghost's own weather: a cold mist pouring off her waterline and trailing
   * astern, green motes rising off the deck, and her presence and hit-flare
   * fed to the shaders.
   */
  private haunt(dt: number, world: World) {
    if (this.alive) this.presence = Math.min(1, this.presence + dt / 3.2);
    else this.presence = Math.max(0, 1 - this.sinkT / GHOST_FADE);
    this.flare = Math.max(0, this.flare - dt * 2.2);
    const g = this.dmg.ghost;
    g.x = this.presence;
    g.y = this.flare;
    const pr = this.presence;
    if (pr <= 0.02) return;
    this.mistT += dt * (this.alive ? 14 : 30) * pr;
    const L = this.cls.length;
    const B = this.cls.beam;
    const fwd = this.forward;
    const fx = fwd.x;
    const fz = fwd.z;
    const pdx = fz;
    const pdz = -fx;
    while (this.mistT > 1) {
      this.mistT -= 1;
      const u = (Math.random() - 0.55) * L;
      const side = Math.random() < 0.5 ? 1 : -1;
      const x = this.pos.x + fx * u + pdx * side * B * 0.45;
      const z = this.pos.z + fz * u + pdz * side * B * 0.45;
      const wy = world.waterHeight(x, z);
      if (Math.random() < 0.7) {
        world.particles.emit({
          x, y: wy + 0.3 + Math.random() * 0.6, z,
          vx: this.vel.x * 0.25 + pdx * side * 0.6, vy: 0.15 + Math.random() * 0.25, vz: this.vel.z * 0.25 + pdz * side * 0.6,
          life: 3 + Math.random() * 2, size: 1.6 + Math.random(), sizeEnd: 6 + Math.random() * 4,
          color: [0.62, 0.82, 0.74], colorEnd: [0.78, 0.9, 0.86], alpha: 0.2 * pr, drag: 0.5, grav: -0.04, spin: (Math.random() - 0.5) * 0.3, kind: 1, fadeIn: 0.35,
        });
      } else {
        // will-o'-wisps lifting off the rails
        const deck = this.root.position.y + this.cls.freeboard + Math.random() * 2;
        world.particles.emit({
          x: x - pdx * side * B * 0.2, y: deck, z: z - pdz * side * B * 0.2,
          vx: this.vel.x * 0.6 + (Math.random() - 0.5) * 0.6, vy: 0.6 + Math.random() * 1.2, vz: this.vel.z * 0.6 + (Math.random() - 0.5) * 0.6,
          life: 1.2 + Math.random() * 1.4, size: 0.16 + Math.random() * 0.14, sizeEnd: 0.03,
          color: [1.4 * pr, 5 * pr, 3 * pr], colorEnd: [0.12, 1.0, 0.55], drag: 0.8, grav: -0.3, kind: 2, fadeIn: 0.15,
        }, true);
      }
    }
  }

  /**
   * Her keel on coral (`k` 0..1, deepest at x, z): it drags her up short and
   * stiffens her helm, and grinds her hull open in shuddering bites, worst at
   * the first strike. Hard aground she barely moves until she works her way
   * off into deeper water.
   */
  private grindReef(k: number, x: number, z: number, dt: number, world: World) {
    const was = this.scrape;
    this.scrape += (k - this.scrape) * damp(k > this.scrape ? 14 : 5, dt);
    if (k < 0.02 || !this.alive) {
      this.scrapeAcc = 0;
      return;
    }
    this.reefDepth = Math.max(0, -world.terrain.heightAt(x, z));
    const c = this.cls;
    const spd = Math.abs(this.speed);
    this.speed *= 1 - damp(k * 1.35, dt);
    this.angVel *= 1 - damp(k * 1.8, dt);
    // driven onto it at speed, the strike itself tears the most
    const strike = was < 0.06 && spd > 1.5;
    this.scrapeAcc += k * (2.6 + spd * 2.4) * dt + (strike ? spd * 3.4 * k : 0);
    this.scrapeT -= dt;
    if (this.scrapeT > 0 && !strike) return;
    this.scrapeT = 0.5 + Math.random() * 0.15;
    const at = _fp.set(x, this.heave - c.draft * 0.35, z);
    const dealt = this.damage(this.scrapeAcc, null, world, at);
    this.scrapeAcc = 0;
    world.onHazard(this, 'reef', dealt, at);
    // she shudders, throws up a cloud of churned sand and splintered coral, and foams at the hull
    this.kickRoll((Math.random() - 0.5) * 0.06 * k + (strike ? 0.05 * Math.sign(Math.random() - 0.5) : 0));
    const wy = world.waterHeight(x, z);
    world.particles.sandHit(new THREE.Vector3(x, wy + 0.1, z));
    if (strike || Math.random() < 0.5) world.particles.splash(new THREE.Vector3(x, wy, z), 0.35 + k * 0.4 + (strike ? 0.3 : 0));
    world.wake.stamp(x, z, c.beam * 0.7, 0.35 * k);
    const [vol, pan, d] = world.soundAt(this.pos);
    world.audio.scrape(vol, pan, d, k, strike);
    if (strike) world.onShake(this.team === 'player' ? 0.45 * k + 0.15 : 0, this.pos);
  }

  dispose() {
    this.dmg.dispose();
    this.bowWave.dispose();
  }
}

/** Seconds a laid ghost takes to dissolve. */
const GHOST_FADE = 4.5;
