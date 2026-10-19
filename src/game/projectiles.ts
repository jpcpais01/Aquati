import * as THREE from 'three';
import { patchMaterial } from '../render/environment';
import { Ship } from '../ships/ship';
import { Shot, World } from './world';

const GRAVITY = 14;
const MAX = 256;

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
}

export interface HitEvent {
  ship: Ship;
  attacker: Ship;
  damage: number;
  pos: THREE.Vector3;
}

const _local = new THREE.Vector3();
const _inv = new THREE.Matrix4();

export class Projectiles {
  readonly mesh: THREE.InstancedMesh;
  private balls: Ball[] = [];
  private m = new THREE.Matrix4();
  onHit: (e: HitEvent) => void = () => {};

  constructor() {
    const geo = new THREE.SphereGeometry(0.2, 10, 8);
    const mat = patchMaterial(new THREE.MeshStandardMaterial({ color: 0x1c1d20, metalness: 0.7, roughness: 0.35 }), { clouds: true });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.count = 0;
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
  }

  add(s: Shot) {
    if (this.balls.length >= MAX) this.balls.shift();
    this.balls.push({ pos: s.pos.clone(), vel: s.vel.clone(), owner: s.owner as Ship, damage: s.damage, age: 0, trail: 0, tore: -1, heard: false, style: s.trail ?? 'powder' });
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
            // high shots fly through the rigging: tear canvas, smash masts
            if (!s.alive) continue;
            const rig = s.dmg.rigTest(_local);
            if (rig.kind === 2) {
              dead = true;
              const dmg = s.damage(b.damage * 0.4, b.owner, world, null, false);
              s.dmg.onRigHit(2, rig.mast, b.pos.clone(), b.vel, world);
              this.onHit({ ship: s, attacker: b.owner, damage: dmg, pos: b.pos.clone() });
              break;
            }
            if (rig.kind === 1 && b.tore !== s.id) {
              b.tore = s.id;
              s.dmg.onRigHit(1, rig.mast, b.pos.clone(), b.vel, world);
            }
            continue;
          }
          if (_local.y < shape.bottom(tc) - 0.2) continue;
          const hw = shape.halfWidthAtY(tc, Math.max(_local.y, 0)) + 0.15;
          if (Math.abs(_local.x) > hw) continue;
          dead = true;
          if (s.alive) {
            const dmg = s.damage(b.damage, b.owner, world, b.pos);
            const n = new THREE.Vector3(Math.sign(_local.x) || 1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), s.heading);
            world.particles.woodHit(b.pos.clone(), n);
            const [vol, pan, d] = world.soundAt(b.pos);
            world.audio.hit(vol, pan, d);
            this.onHit({ ship: s, attacker: b.owner, damage: dmg, pos: b.pos.clone() });
          } else {
            world.particles.woodHit(b.pos.clone(), new THREE.Vector3(0, 1, 0));
          }
          break;
        }
        if (dead) break;
        const ground = world.terrain.heightAt(b.pos.x, b.pos.z);
        if (ground > 0 && b.pos.y < ground) {
          world.particles.sandHit(b.pos.clone().setY(ground + 0.3));
          const [vol, pan, d] = world.soundAt(b.pos);
          world.audio.thud(vol, pan, d);
          dead = true;
          break;
        }
        const wy = world.waterHeight(b.pos.x, b.pos.z);
        if (b.pos.y < wy) {
          const p = b.pos.clone().setY(wy);
          world.particles.splash(p, 1);
          world.wake.stamp(p.x, p.z, 2.2, 1.4);
          world.wake.stamp(p.x, p.z, 4.5, 0.8, true);
          world.wake.push(p.x, p.z, 1.8, -0.35); // crater that rings outward
          const [vol, pan, d] = world.soundAt(p);
          world.audio.splash(vol, pan, d);
          dead = true;
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
            world.audio.whoosh(vol, pan * 3, pan2 * 3);
          }
        }
      }
      if (!dead) {
        b.trail += dt;
        if (b.trail > 0.035) {
          b.trail = 0;
          world.particles.trail(b.pos, Math.max(0, 1 - b.age * 0.6), b.style, b.vel);
        }
      }
      if (dead || b.age > 7) this.balls.splice(i, 1);
    }
    const streaks = world.particles.streaks;
    streaks.begin();
    for (let i = 0; i < this.balls.length; i++) {
      streaks.add(this.balls[i].pos, this.balls[i].vel, this.balls[i].age, this.balls[i].style);
      this.m.makeTranslation(this.balls[i].pos.x, this.balls[i].pos.y, this.balls[i].pos.z);
      this.mesh.setMatrixAt(i, this.m);
    }
    streaks.end();
    this.mesh.count = this.balls.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.balls.length = 0;
    this.mesh.count = 0;
  }
}
