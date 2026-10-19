import * as THREE from 'three';
import { patchMaterial } from '../render/environment';
import { Ship } from '../ships/ship';
import { AMMO, AmmoId, EFFECT } from './ammo';
import { Shot, World } from './world';

const GRAVITY = 14;
const MAX = 512;
/** Instances: chain shot draws two half-balls per shot. */
const INSTANCES = MAX * 2;

interface Ball {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  owner: Ship;
  damage: number;
  age: number;
  trail: number;
  tore: number; // last ship whose canvas this ball tore through
  heard: boolean;
  style: string;
  ammo: AmmoId;
  spin: number;
}

export interface HitEvent {
  ship: Ship;
  attacker: Ship;
  damage: number;
  pos: THREE.Vector3;
}

const _local = new THREE.Vector3();
const _inv = new THREE.Matrix4();
const _side = new THREE.Vector3();
const _up = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _s = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _col = new THREE.Color();
const AMMO_COLORS = Object.fromEntries(Object.values(AMMO).map((a) => [a.id, new THREE.Color(a.color)])) as Record<AmmoId, THREE.Color>;

/** A grape-shot volley's hits on one ship, gathered so it reads as one blow. */
interface Rake {
  attacker: Ship;
  damage: number;
  pos: THREE.Vector3;
  t: number;
}

export class Projectiles {
  readonly mesh: THREE.InstancedMesh;
  private balls: Ball[] = [];
  private m = new THREE.Matrix4();
  private rakes = new Map<Ship, Rake>();
  private soundT = new Map<number, number>();
  onHit: (e: HitEvent) => void = () => {};

  constructor() {
    const geo = new THREE.SphereGeometry(0.2, 10, 8);
    const mat = patchMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.7, roughness: 0.35 }), { clouds: true });
    this.mesh = new THREE.InstancedMesh(geo, mat, INSTANCES);
    // every ball carries its shot's colour; made up front so the program never changes mid-fight
    for (let i = 0; i < INSTANCES; i++) this.mesh.setColorAt(i, AMMO_COLORS.round);
    this.mesh.count = 0;
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
  }

  add(s: Shot) {
    if (this.balls.length >= MAX) this.balls.shift();
    const ammo = s.ammo ?? 'round';
    this.balls.push({
      pos: s.pos.clone(), vel: s.vel.clone(), owner: s.owner as Ship, damage: s.damage, age: 0, trail: 0, tore: -1,
      // only the odd grape ball whistles past, or a volley would be a swarm of bees
      heard: ammo === 'grape' && Math.random() > 0.2, style: s.trail ?? 'powder', ammo, spin: Math.random() * Math.PI * 2,
    });
  }

  /** Throttle per ship and sound, so a raking volley is one hail of hits, not thirty. */
  private canPlay(id: number, now: number, gap: number) {
    const t = this.soundT.get(id) ?? -1;
    if (now - t < gap) return false;
    this.soundT.set(id, now);
    return true;
  }

  update(dt: number, world: World, ships: Ship[]) {
    const steps = 2;
    const h = dt / steps;
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      let dead = false;
      for (let st = 0; st < steps && !dead; st++) {
        b.vel.y -= GRAVITY * h;
        b.pos.addScaledVector(b.vel, h);
        b.age += h;
        // ships: test in each hull's local frame (oriented box)
        for (const s of ships) {
          // settled wrecks sit too low and twisted to stop a ball
          if (s === b.owner || s.removed || (!s.alive && s.sinkT > 2)) continue;
          const dx = b.pos.x - s.pos.x;
          const dz = b.pos.z - s.pos.z;
          const R = s.cls.length * 0.55;
          if (dx * dx + dz * dz > R * R) continue;
          _inv.copy(s.model.root.matrixWorld).invert();
          _local.copy(b.pos).applyMatrix4(_inv);
          const shape = s.model.shape;
          const t = _local.z / s.cls.length + 0.5;
          if (t < 0 || t > 1.02) continue;
          const tc = Math.min(1, Math.max(0, t));
          const top = shape.top(tc) + 0.6;
          if (_local.y > top) {
            if (!s.alive) continue;
            // chain shot scythes through anything standing above the deck
            if (b.ammo === 'chain') {
              const mastH = s.cls.masts.reduce((m, d) => Math.max(m, d.height), 0);
              if (Math.abs(_local.x) < s.cls.beam * 0.75 && _local.y < top + mastH * 0.95) {
                dead = true;
                this.chainHit(b, s, world, top);
                break;
              }
              continue;
            }
            // grape sweeps the deck at head height and cuts down whoever stands there
            if (b.ammo === 'grape' && _local.y < top + 2.2 && Math.abs(_local.x) < shape.halfWidthAtY(tc, Math.max(0, top - 0.6))) {
              dead = true;
              this.grapeHit(b, s, world);
              break;
            }
            // high shots fly through the rigging: tear canvas, smash masts
            const rig = s.dmg.rigTest(_local);
            if (rig.kind === 2) {
              dead = true;
              const dmg = s.damage(b.damage * 0.4, b.owner, world, null, false);
              s.dmg.onRigHit(2, rig.mast, b.pos.clone(), b.vel, world);
              if (b.ammo === 'shell') this.detonate(b, b.pos.clone(), world, ships, false, s, dmg);
              else {
                if (b.ammo === 'fire') this.ignite(b, s, world);
                this.onHit({ ship: s, attacker: b.owner, damage: dmg, pos: b.pos.clone() });
              }
              break;
            }
            if (rig.kind === 1 && b.tore !== s.id) {
              b.tore = s.id;
              s.dmg.onRigHit(1, rig.mast, b.pos.clone(), b.vel, world);
              // red-hot shot through dry canvas: the sails catch
              if (b.ammo === 'fire' && Math.random() < 0.5) this.ignite(b, s, world);
            }
            continue;
          }
          if (_local.y < shape.bottom(tc) - 0.2) continue;
          const hw = shape.halfWidthAtY(tc, Math.max(_local.y, 0)) + 0.15;
          if (Math.abs(_local.x) > hw) continue;
          dead = true;
          if (!s.alive) {
            if (b.ammo === 'shell') this.detonate(b, b.pos.clone(), world, ships, false, null, 0);
            else world.particles.woodHit(b.pos.clone(), new THREE.Vector3(0, 1, 0));
            break;
          }
          if (b.ammo === 'grape') {
            this.grapeHit(b, s, world);
            break;
          }
          if (b.ammo === 'chain') {
            this.chainHit(b, s, world, top);
            break;
          }
          const dmg = s.damage(b.damage, b.owner, world, b.pos);
          const n = new THREE.Vector3(Math.sign(_local.x) || 1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), s.heading);
          world.particles.woodHit(b.pos.clone(), n);
          const [vol, pan, d] = world.soundAt(b.pos);
          world.audio.hit(vol, pan, d);
          if (b.ammo === 'shell') {
            this.detonate(b, b.pos.clone(), world, ships, false, s, dmg);
            break;
          }
          if (b.ammo === 'fire') this.ignite(b, s, world);
          this.onHit({ ship: s, attacker: b.owner, damage: dmg, pos: b.pos.clone() });
          break;
        }
        if (dead) break;
        const ground = world.terrain.heightAt(b.pos.x, b.pos.z);
        if (ground > 0 && b.pos.y < ground) {
          const p = b.pos.clone().setY(ground + 0.3);
          if (b.ammo === 'shell') this.detonate(b, p, world, ships, false, null, 0);
          else {
            world.particles.sandHit(p);
            const [vol, pan, d] = world.soundAt(b.pos);
            if (b.ammo !== 'grape' || Math.random() < 0.25) world.audio.thud(vol, pan, d);
          }
          dead = true;
          break;
        }
        const wy = world.waterHeight(b.pos.x, b.pos.z);
        if (b.pos.y < wy) {
          const p = b.pos.clone().setY(wy);
          dead = true;
          if (b.ammo === 'shell') {
            this.detonate(b, p, world, ships, true, null, 0);
            break;
          }
          const [vol, pan, d] = world.soundAt(p);
          if (b.ammo === 'grape') {
            // a hail of little spouts rather than one great one
            world.particles.splash(p, 0.32);
            world.wake.stamp(p.x, p.z, 0.9, 0.5);
            if (Math.random() < 0.3) world.audio.splash(vol * 0.5, pan, d);
            break;
          }
          if (b.ammo === 'fire') {
            world.particles.steam(p);
            world.audio.sizzle(vol, pan, d);
          } else world.particles.splash(p, 1);
          world.wake.stamp(p.x, p.z, 2.2, 1.4);
          world.wake.stamp(p.x, p.z, 4.5, 0.8, true);
          world.wake.push(p.x, p.z, 1.8, -0.35); // crater that rings outward
          world.audio.splash(vol, pan, d);
          break;
        }
      }
      if (!dead && !b.heard) {
        // enemy shot tearing close past the listener
        const lx = b.pos.x - world.listener.x;
        const lz = b.pos.z - world.listener.z;
        if (lx * lx + lz * lz < 15 * 15) {
          b.heard = true;
          const ox = b.owner.pos.x - world.listener.x;
          const oz = b.owner.pos.z - world.listener.z;
          if (ox * ox + oz * oz > 35 * 35) {
            const [vol, pan] = world.soundAt(b.pos);
            const pan2 = world.soundAt(_local.copy(b.vel).multiplyScalar(0.5).add(b.pos))[1];
            // a chain whirls past with a deep, throbbing moan
            world.audio.whoosh(vol, pan * 3, pan2 * 3, b.ammo === 'chain' ? 0.55 : b.ammo === 'grape' ? 1.5 : 1);
          }
        }
      }
      if (!dead && b.ammo !== 'grape') {
        b.trail += dt;
        if (b.trail > 0.035) {
          b.trail = 0;
          world.particles.trail(b.pos, Math.max(0, 1 - b.age * 0.6), b.style, b.vel);
        }
      }
      if (dead || b.age > 7) this.balls.splice(i, 1);
    }
    this.flushRakes(dt);
    this.draw(world);
  }

  private draw(world: World) {
    const streaks = world.particles.streaks;
    streaks.begin();
    let n = 0;
    for (let i = 0; i < this.balls.length; i++) {
      const b = this.balls[i];
      const am = AMMO[b.ammo];
      streaks.add(b.pos, b.vel, b.age, b.style);
      const sc = am.size;
      if (b.ammo === 'chain') {
        // two half-balls cartwheeling about their chain, square to the flight
        _side.set(-b.vel.z, 0, b.vel.x).normalize();
        _up.crossVectors(_side, b.vel).normalize();
        const a = b.spin + b.age * 26;
        const r = 0.55 + Math.min(1, b.age * 6) * 0.35;
        const c = Math.cos(a) * r;
        const sn = Math.sin(a) * r;
        _a.copy(b.pos).addScaledVector(_side, c).addScaledVector(_up, sn);
        _b.copy(b.pos).addScaledVector(_side, -c).addScaledVector(_up, -sn);
        streaks.addSeg(_a, _b, 'link');
        _s.setScalar(sc);
        this.m.compose(_a, _q, _s);
        this.mesh.setMatrixAt(n, this.m);
        this.mesh.setColorAt(n++, AMMO_COLORS.chain);
        this.m.compose(_b, _q, _s);
        this.mesh.setMatrixAt(n, this.m);
        this.mesh.setColorAt(n++, AMMO_COLORS.chain);
        continue;
      }
      _s.setScalar(sc);
      this.m.compose(b.pos, _q, _s);
      this.mesh.setMatrixAt(n, this.m);
      if (b.ammo === 'fire') {
        // red-hot iron flickers as it cools in the air
        _col.copy(AMMO_COLORS.fire).multiplyScalar(1 + 0.35 * Math.sin(b.age * 40 + b.spin));
        this.mesh.setColorAt(n++, _col);
      } else this.mesh.setColorAt(n++, AMMO_COLORS[b.ammo]);
    }
    streaks.end();
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  // ------------------------------------------------------------------ special shot

  /** Red-hot iron struck her: she catches, and burns on. */
  private ignite(b: Ball, s: Ship, world: World) {
    world.particles.fireHit(b.pos.clone());
    const [vol, pan, d] = world.soundAt(b.pos);
    if (this.canPlay(s.id * 8 + 1, world.time, 0.3)) world.audio.ignite(vol, pan, d);
    if (s.ignite(b.owner)) world.onStatus(s, 'ablaze', b.owner);
  }

  /** Chain through the rigging: sails shredded, sometimes a spar knocked about, a little hull damage. */
  private chainHit(b: Ball, s: Ship, world: World, top: number) {
    const lz = _local.z;
    const dmg = s.damage(b.damage, b.owner, world, null, false);
    const at = b.pos.clone();
    // the chain wraps the nearest mast: canvas torn to ribbons
    const mi = s.dmg.nearestMast(lz);
    if (mi >= 0) {
      s.dmg.onRigHit(1, mi, at, b.vel, world);
      s.dmg.onRigHit(1, mi, at, b.vel, world);
      if (Math.random() < 0.14 && _local.y > top + 1.5) s.dmg.onRigHit(2, mi, at, b.vel, world);
    }
    _col.set(s.livery.sail);
    world.particles.shreds(at, b.vel, [_col.r, _col.g, _col.b]);
    const [vol, pan, d] = world.soundAt(at);
    if (this.canPlay(s.id * 8 + 2, world.time, 0.2)) world.audio.chain(vol, pan, d);
    if (s.shred()) world.onStatus(s, 'shredded', b.owner);
    this.onHit({ ship: s, attacker: b.owner, damage: dmg, pos: at });
  }

  /** A grape-shot ball across her deck. The volley's hits are gathered and reported as one. */
  private grapeHit(b: Ball, s: Ship, world: World) {
    const dmg = s.damage(b.damage, b.owner, world, null, false);
    world.particles.pelletHit(b.pos.clone());
    const [vol, pan, d] = world.soundAt(b.pos);
    if (this.canPlay(s.id * 8 + 3, world.time, 0.25)) world.audio.grape(vol, pan, d);
    if (s.rake()) world.onStatus(s, 'crew', b.owner);
    const r = this.rakes.get(s);
    if (r) {
      r.damage += dmg;
      r.t = 0;
    } else this.rakes.set(s, { attacker: b.owner, damage: dmg, pos: b.pos.clone(), t: 0 });
    // a killing ball is reported at once, so the sinking is credited
    if (!s.alive) this.flushRake(s);
  }

  private flushRake(s: Ship) {
    const r = this.rakes.get(s);
    if (!r) return;
    this.rakes.delete(s);
    this.onHit({ ship: s, attacker: r.attacker, damage: r.damage, pos: r.pos });
  }

  private flushRakes(dt: number) {
    if (!this.rakes.size) return;
    for (const [s, r] of this.rakes) {
      r.t += dt;
      if (r.t > 0.22) this.flushRake(s);
    }
  }

  /**
   * An explosive shell bursting, on a hull, the shore or the sea. Every ship
   * close by is caught in it, so a near miss still tells.
   */
  private detonate(b: Ball, at: THREE.Vector3, world: World, ships: Ship[], water: boolean, direct: Ship | null, directDmg: number) {
    world.particles.shellBurst(at, water);
    if (water) {
      world.wake.stamp(at.x, at.z, 3.5, 1.6);
      world.wake.stamp(at.x, at.z, 7, 1, true);
      world.wake.push(at.x, at.z, 3.2, -0.6);
    }
    const [vol, pan, d] = world.soundAt(at);
    world.audio.shell(vol, pan, d);
    world.onShake(0.45 * vol * vol, at);
    const base = b.damage / AMMO.shell.damage;
    const R = EFFECT.blastRadius;
    for (const s of ships) {
      if (s === b.owner || !s.alive || s.removed || s.team === b.owner.team) continue;
      const dx = at.x - s.pos.x;
      const dz = at.z - s.pos.z;
      const reach = s.cls.length * 0.5 + R;
      if (dx * dx + dz * dz > reach * reach) continue;
      // distance from the burst to her hull: an oriented box around the keel
      _inv.copy(s.model.root.matrixWorld).invert();
      _local.copy(at).applyMatrix4(_inv);
      const ox = Math.max(0, Math.abs(_local.x) - s.cls.beam * 0.5);
      const oz = Math.max(0, Math.abs(_local.z) - s.cls.length * 0.5);
      const dist = Math.hypot(ox, oz);
      if (dist > R) continue;
      const k = 1 - dist / R;
      const close = dist < 1.6;
      let dmg = s.damage(base * EFFECT.blastDamage * (0.3 + 0.7 * k), b.owner, world, close ? at : null, close);
      if (s === direct) dmg += directDmg;
      this.onHit({ ship: s, attacker: b.owner, damage: dmg, pos: at.clone().setY(Math.max(at.y, 1.5)) });
    }
    // the direct hit, if the burst somehow skipped her (a dead ship, or a friend)
    if (direct && direct.team === b.owner.team) this.onHit({ ship: direct, attacker: b.owner, damage: directDmg, pos: at.clone() });
  }

  clear() {
    this.balls.length = 0;
    this.rakes.clear();
    this.soundT.clear();
    this.mesh.count = 0;
  }
}
