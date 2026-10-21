import * as THREE from 'three';
import { patchMaterial } from '../render/environment';
import type { World } from '../game/world';

// Wreckage that outlives the shot that made it: planks, barrels and crates
// blasted off a hull tumble through the air, slap into the sea, bob on the
// swell and drift with the wind before slowly waterlogging and sinking. Big
// broken-off parts (toppled masts, snapped bowsprits) are full meshes that
// splash down, roll flat and float away the same way. Hulls shoulder floating
// junk aside as they sail through it.

const PLANK_CAP = 360;
const PROP_CAP = 72;

interface Piece {
  kind: 0 | 1 | 2; // plank, barrel, crate
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  quat: THREE.Quaternion;
  spin: THREE.Vector3; // angular velocity (world axis * rad/s)
  scale: THREE.Vector3;
  color: THREE.Color;
  floating: boolean;
  grounded: boolean;
  /** Adrift beneath the waves: rises (buoy > 0) or sinks (< 0) until it reaches the surface or the sand. */
  under: boolean;
  buoy: number;
  age: number;
  life: number;
  sink: number;
  bob: number;
  floatQ: THREE.Quaternion;
}

interface Body {
  obj: THREE.Object3D;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  axis: THREE.Vector3; // local long axis
  len: number;
  floating: boolean;
  age: number;
  life: number;
  sink: number;
  settleFrom: THREE.Quaternion;
  settleTo: THREE.Quaternion;
  settle: number;
  bob: number;
  dispose: boolean;
}

export interface Pusher {
  pos: THREE.Vector3;
  heading: number;
  length: number;
  beam: number;
  speed: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);
const rand = (a: number, b: number) => a + Math.random() * (b - a);

function barrelGeometry() {
  const body = new THREE.CylinderGeometry(0.27, 0.27, 0.74, 12, 4);
  const p = body.getAttribute('position');
  const col: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    // bulge in the middle, dark iron hoops near the ends
    const k = 1 + 0.12 * Math.cos((y / 0.37) * Math.PI * 0.5);
    p.setX(i, p.getX(i) * k);
    p.setZ(i, p.getZ(i) * k);
    const hoop = Math.abs(Math.abs(y) - 0.24) < 0.05 || Math.abs(y) > 0.36;
    if (hoop) col.push(0.32, 0.3, 0.28);
    else col.push(1, 1, 1);
  }
  body.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  body.computeVertexNormals();
  return body;
}

function crateGeometry() {
  const g = new THREE.BoxGeometry(0.62, 0.62, 0.62);
  const col: number[] = [];
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) col.push(1, 1, 1);
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

function plankGeometry() {
  // a splintered board: tapered, ragged at one end
  const g = new THREE.BoxGeometry(1, 0.07, 0.2, 3, 1, 1);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    if (x > 0.3) {
      p.setZ(i, p.getZ(i) * (0.55 + Math.sin(i * 12.9898) * 0.25));
      p.setX(i, x + Math.sin(i * 78.233) * 0.08);
    }
  }
  const col: number[] = [];
  for (let i = 0; i < p.count; i++) col.push(1, 1, 1);
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export class Debris {
  readonly group = new THREE.Group();
  private planks: THREE.InstancedMesh;
  private barrels: THREE.InstancedMesh;
  private crates: THREE.InstancedMesh;
  private pieces: Piece[] = [];
  private bodies: Body[] = [];
  private material: THREE.MeshStandardMaterial;

  constructor() {
    this.material = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78 }), { clouds: true, caustics: true });
    const mk = (geo: THREE.BufferGeometry, cap: number) => {
      const m = new THREE.InstancedMesh(geo, this.material, cap);
      m.setColorAt(0, new THREE.Color(1, 1, 1));
      m.count = 0;
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      this.group.add(m);
      return m;
    };
    this.planks = mk(plankGeometry(), PLANK_CAP);
    this.barrels = mk(barrelGeometry(), PROP_CAP);
    this.crates = mk(crateGeometry(), PROP_CAP);
  }

  private count(kind: number) {
    let n = 0;
    for (const p of this.pieces) if (p.kind === kind) n++;
    return n;
  }

  private add(kind: 0 | 1 | 2, pos: THREE.Vector3, vel: THREE.Vector3, color: THREE.Color, scale: THREE.Vector3, life: number) {
    const cap = kind === 0 ? PLANK_CAP : PROP_CAP;
    if (this.count(kind) >= cap) {
      // recycle the oldest of this kind
      const i = this.pieces.findIndex((p) => p.kind === kind);
      if (i >= 0) this.pieces.splice(i, 1);
    }
    const quat = new THREE.Quaternion().setFromEuler(_e.set(rand(0, 6.28), rand(0, 6.28), rand(0, 6.28)));
    this.pieces.push({
      kind, pos: pos.clone(), vel: vel.clone(), quat,
      spin: new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(kind === 0 ? rand(6, 16) : rand(2, 6)),
      scale, color, floating: false, grounded: false, under: false, buoy: 0, age: 0, life, sink: 0, bob: Math.random() * 10,
      floatQ: new THREE.Quaternion(),
    });
  }

  /**
   * Wreckage torn loose beneath the waves: planks and casks claw their way up
   * toward the light, crates and ballast tumble slowly down to the sand.
   */
  drown(at: THREE.Vector3, n: number, colors: THREE.Color[]) {
    for (let i = 0; i < n; i++) {
      const r = Math.random();
      const kind: 0 | 1 | 2 = r < 0.55 ? 0 : r < 0.8 ? 1 : 2;
      const vel = new THREE.Vector3(rand(-1.4, 1.4), rand(-0.4, 0.8), rand(-1.4, 1.4));
      const pos = at.clone().add(_v.set(rand(-1.5, 1.5), rand(-0.5, 1), rand(-1.5, 1.5)));
      const c = kind === 0 ? colors[Math.floor(Math.random() * colors.length)].clone().multiplyScalar(rand(0.75, 1.05)) : kind === 1 ? new THREE.Color(0.55, 0.36, 0.2) : new THREE.Color(0.7, 0.52, 0.33);
      const scale = kind === 0 ? new THREE.Vector3(rand(0.6, 1.6), 1, rand(0.8, 1.3)) : new THREE.Vector3(1, 1, 1).multiplyScalar(rand(0.85, 1.1));
      this.add(kind, pos, vel, c, scale, rand(50, 80));
      const p = this.pieces[this.pieces.length - 1];
      p.under = true;
      // most timber floats; a crate full of shot does not
      p.buoy = kind === 2 ? -rand(0.6, 1.1) : kind === 1 ? rand(1.0, 1.6) : Math.random() < 0.8 ? rand(0.6, 1.4) : -rand(0.3, 0.5);
      p.spin.multiplyScalar(0.12);
    }
  }

  /** Planks blasted outward from a breach. */
  splinters(at: THREE.Vector3, outward: THREE.Vector3, carry: THREE.Vector3, colors: THREE.Color[], n: number) {
    for (let i = 0; i < n; i++) {
      const sp = rand(4, 11);
      const vel = new THREE.Vector3(outward.x * sp + rand(-3, 3) + carry.x, rand(3, 10), outward.z * sp + rand(-3, 3) + carry.z);
      const c = colors[Math.floor(Math.random() * colors.length)].clone().multiplyScalar(rand(0.8, 1.1));
      const len = rand(0.45, 1.5);
      this.add(0, at, vel, c, new THREE.Vector3(len, 1, rand(0.7, 1.3)), rand(35, 70));
    }
  }

  /** Cargo and loose gear thrown off a dying ship. */
  cargo(at: THREE.Vector3, carry: THREE.Vector3, n: number, spread = 2) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(1.5, 6);
      const vel = new THREE.Vector3(Math.cos(a) * sp + carry.x, rand(4, 9), Math.sin(a) * sp + carry.z);
      const p = at.clone().add(_v.set(rand(-spread, spread), rand(0, 1), rand(-spread, spread)));
      if (Math.random() < 0.6) this.add(1, p, vel, new THREE.Color(0.55, 0.36, 0.2).multiplyScalar(rand(0.85, 1.1)), new THREE.Vector3(1, 1, 1), rand(60, 110));
      else this.add(2, p, vel, new THREE.Color(0.7, 0.52, 0.33).multiplyScalar(rand(0.85, 1.1)), new THREE.Vector3(1, 1, 1).multiplyScalar(rand(0.8, 1.15)), rand(60, 110));
    }
  }

  /**
   * Hands over a broken-off part (already parented to this group, in world
   * space). `axis` is its long axis in its own local frame.
   */
  addBody(obj: THREE.Object3D, vel: THREE.Vector3, spin: THREE.Vector3, axis: THREE.Vector3, len: number, dispose = true) {
    this.group.attach(obj);
    this.bodies.push({
      obj, vel: vel.clone(), spin: spin.clone(), axis: axis.clone(), len, floating: false, age: 0, life: rand(26, 40), sink: 0,
      settleFrom: new THREE.Quaternion(), settleTo: new THREE.Quaternion(), settle: 1, bob: Math.random() * 10, dispose,
    });
  }

  update(dt: number, world: World, pushers: Pusher[]) {
    if (dt <= 0) return;
    const wind = world.wind;
    const driftX = wind.dirX * 0.35 * wind.strength;
    const driftZ = wind.dirZ * 0.35 * wind.strength;

    // ---------------------------------------------------------- small pieces
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      p.age += dt;
      if (p.under) {
        // drifting in the water: heavy drag, a lazy tumble, a sway in the swell's surge
        const k = Math.exp(-1.6 * dt);
        p.vel.multiplyScalar(k);
        p.vel.y += p.buoy * dt;
        p.bob += dt;
        p.pos.x += (p.vel.x + Math.sin(p.bob * 0.8 + p.buoy * 9) * 0.18) * dt;
        p.pos.y += p.vel.y * dt;
        p.pos.z += (p.vel.z + Math.cos(p.bob * 0.6 + p.buoy * 5) * 0.18) * dt;
        p.spin.multiplyScalar(Math.exp(-0.2 * dt));
        const l = p.spin.length();
        if (l > 1e-4) p.quat.premultiply(_q.setFromAxisAngle(_v.copy(p.spin).divideScalar(l), l * dt));
        const ground = world.terrain.heightAt(p.pos.x, p.pos.z);
        const wh = world.waterHeight(p.pos.x, p.pos.z);
        if (p.pos.y > wh - 0.2) {
          // broke the surface: from here it bobs and drifts like any other flotsam
          p.under = false;
          p.floating = true;
          p.vel.set(p.vel.x * 0.3, 0, p.vel.z * 0.3);
          _e.setFromQuaternion(p.quat, 'YXZ');
          p.floatQ.setFromEuler(_e.set(rand(-0.15, 0.15), _e.y, rand(-0.15, 0.15), 'YXZ'));
          if (p.kind === 1) p.floatQ.multiply(_q.setFromAxisAngle(_v.set(1, 0, 0), Math.PI / 2));
        } else if (p.pos.y < ground + 0.15) {
          p.under = false;
          p.grounded = true;
          p.pos.y = ground + 0.12;
        }
        continue;
      }
      if (!p.floating && !p.grounded) {
        p.vel.y -= 16 * dt;
        p.pos.addScaledVector(p.vel, dt);
        const l = p.spin.length();
        if (l > 1e-4) p.quat.premultiply(_q.setFromAxisAngle(_v.copy(p.spin).divideScalar(l), l * dt));
        const ground = world.terrain.heightAt(p.pos.x, p.pos.z);
        const wh = world.waterHeight(p.pos.x, p.pos.z);
        if (ground > wh - 0.1 && p.pos.y < ground + 0.1) {
          p.grounded = true;
          p.pos.y = ground + 0.08;
        } else if (p.pos.y < wh) {
          p.floating = true;
          p.vel.multiplyScalar(0.25);
          p.vel.y = 0;
          // lie flat-ish, keep the yaw
          _e.setFromQuaternion(p.quat, 'YXZ');
          p.floatQ.setFromEuler(_e.set(rand(-0.15, 0.15), _e.y, rand(-0.15, 0.15), 'YXZ'));
          if (p.kind === 1 && Math.random() < 0.65) p.floatQ.multiply(_q.setFromAxisAngle(_v.set(1, 0, 0), Math.PI / 2)); // barrels roll on their side
          if (Math.random() < (p.kind === 0 ? 0.3 : 1)) {
            world.particles.splash(p.pos.clone().setY(wh), p.kind === 0 ? 0.25 : 0.45);
            world.wake.stamp(p.pos.x, p.pos.z, 1.1, 0.3, true);
            world.wake.push(p.pos.x, p.pos.z, 0.9, p.kind === 0 ? -0.08 : -0.18);
          }
        }
      } else if (p.floating) {
        // drift with the wind, slow down, bob on the swell
        const k = Math.exp(-0.9 * dt);
        p.vel.x = (p.vel.x - driftX) * k + driftX;
        p.vel.z = (p.vel.z - driftZ) * k + driftZ;
        p.pos.x += p.vel.x * dt;
        p.pos.z += p.vel.z * dt;
        if (p.age > p.life) p.sink += dt * 0.35;
        const ground = world.terrain.heightAt(p.pos.x, p.pos.z);
        const wh = world.waterHeight(p.pos.x, p.pos.z);
        const float = p.kind === 0 ? 0.0 : p.kind === 1 ? 0.12 : 0.08;
        const ty = Math.max(wh + float - p.sink, ground + 0.08);
        p.pos.y += (ty - p.pos.y) * Math.min(1, dt * 6);
        p.bob += dt;
        _q2.setFromEuler(_e.set(Math.sin(p.bob * 1.3) * 0.12, Math.sin(p.bob * 0.21) * 0.25, Math.cos(p.bob * 1.1) * 0.12));
        p.quat.slerp(_q.copy(p.floatQ).premultiply(_q2), Math.min(1, dt * 3));
        // hulls push floating junk aside
        for (const s of pushers) this.push(p.pos, p.vel, s, 0.3);
        if (p.sink > 2.2) {
          this.pieces.splice(i, 1);
          continue;
        }
      } else if (p.age > p.life) {
        this.pieces.splice(i, 1);
        continue;
      }
    }

    // ---------------------------------------------------------- big parts
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      const b = this.bodies[i];
      const o = b.obj;
      b.age += dt;
      if (!b.floating) {
        b.vel.y -= 14 * dt;
        o.position.addScaledVector(b.vel, dt);
        const l = b.spin.length();
        if (l > 1e-4) o.quaternion.premultiply(_q.setFromAxisAngle(_v.copy(b.spin).divideScalar(l), l * dt));
        // has the middle of the part reached the sea?
        const mid = _v.copy(b.axis).applyQuaternion(o.quaternion).multiplyScalar(b.len * 0.5).add(o.position);
        const wh = world.waterHeight(mid.x, mid.z);
        if (mid.y < wh + 0.4) {
          b.floating = true;
          // awash, its shadow barely shows on the sea: not worth a second full draw of every spar adrift
          o.traverse((c) => {
            c.castShadow = false;
          });
          b.vel.multiplyScalar(0.2);
          b.vel.y = 0;
          b.settle = 0;
          b.settleFrom.copy(o.quaternion);
          // roll so the long axis lies along the water
          const ax = _v2.copy(b.axis).applyQuaternion(o.quaternion);
          const flat = _v.set(ax.x, 0, ax.z);
          if (flat.lengthSq() < 1e-4) flat.set(1, 0, 0);
          flat.normalize();
          b.settleTo.setFromUnitVectors(ax.normalize(), flat).multiply(o.quaternion);
          // splash all along its length
          const tip = _v2.copy(b.axis).applyQuaternion(o.quaternion);
          const [vol, pan, d] = world.soundAt(mid);
          world.audio.splash(vol, pan, d);
          for (let k = 0; k <= 4; k++) {
            const sp = o.position.clone().addScaledVector(tip, (b.len * k) / 4);
            sp.y = world.waterHeight(sp.x, sp.z);
            world.particles.splash(sp, 1.1);
            world.wake.stamp(sp.x, sp.z, 2.2, 0.6);
            world.wake.stamp(sp.x, sp.z, 4, 0.45, true);
            world.wake.push(sp.x, sp.z, 2.4, -0.45);
          }
        }
      } else {
        const k = Math.exp(-0.7 * dt);
        b.vel.x = (b.vel.x - driftX * 0.6) * k + driftX * 0.6;
        b.vel.z = (b.vel.z - driftZ * 0.6) * k + driftZ * 0.6;
        o.position.x += b.vel.x * dt;
        o.position.z += b.vel.z * dt;
        b.settle = Math.min(1, b.settle + dt * 0.7);
        const st = b.settle * b.settle * (3 - 2 * b.settle);
        b.bob += dt;
        _q2.setFromAxisAngle(UP, Math.sin(b.bob * 0.15) * 0.0015);
        b.settleTo.premultiply(_q2);
        o.quaternion.slerpQuaternions(b.settleFrom, b.settleTo, st);
        // waterlogged spars ride low and slowly go under
        b.sink += dt * (b.age > b.life ? 0.25 + (b.age - b.life) * 0.05 : 0.025);
        const mid = _v.copy(b.axis).applyQuaternion(o.quaternion).multiplyScalar(b.len * 0.5).add(o.position);
        const wh = world.waterHeight(mid.x, mid.z);
        const ground = world.terrain.heightAt(mid.x, mid.z);
        for (const s of pushers) this.push(o.position, b.vel, s, 0.1);
        const ty = Math.max(wh - 0.45 - b.sink + Math.sin(b.bob * 1.2) * 0.08, ground + 0.2) - (mid.y - o.position.y);
        o.position.y += (ty - o.position.y) * Math.min(1, dt * 2.5);
        if (b.sink > 9) {
          this.removeBody(i);
          continue;
        }
      }
    }

    this.upload();
  }

  private push(pos: THREE.Vector3, vel: THREE.Vector3, s: Pusher, gain: number) {
    const dx = pos.x - s.pos.x;
    const dz = pos.z - s.pos.z;
    if (dx * dx + dz * dz > s.length * s.length) return;
    const fx = Math.sin(s.heading);
    const fz = Math.cos(s.heading);
    const along = Math.max(-s.length * 0.5, Math.min(s.length * 0.5, dx * fx + dz * fz));
    const ox = dx - fx * along;
    const oz = dz - fz * along;
    const d = Math.hypot(ox, oz);
    const r = s.beam * 0.5 * (1 - Math.pow(Math.abs(along) / (s.length * 0.5), 2) * 0.6) + 0.4;
    if (d < r && d > 1e-3) {
      const k = (r - d) / d;
      pos.x += ox * k;
      pos.z += oz * k;
      vel.x += (ox / d) * (1 + s.speed * gain) + fx * s.speed * 0.15;
      vel.z += (oz / d) * (1 + s.speed * gain) + fz * s.speed * 0.15;
    }
  }

  private removeBody(i: number) {
    const b = this.bodies[i];
    this.group.remove(b.obj);
    if (b.dispose) {
      b.obj.traverse((c) => {
        const m = c as THREE.Mesh;
        if (m.geometry && m.userData.dmgOwnGeo) m.geometry.dispose();
      });
    }
    this.bodies.splice(i, 1);
  }

  private upload() {
    const meshes = [this.planks, this.barrels, this.crates];
    const n = [0, 0, 0];
    for (const p of this.pieces) {
      const mesh = meshes[p.kind];
      const i = n[p.kind]++;
      _m.compose(p.pos, p.quat, p.scale);
      mesh.setMatrixAt(i, _m);
      mesh.setColorAt(i, p.color);
    }
    meshes.forEach((m, k) => {
      m.count = n[k];
      if (n[k] > 0) {
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
    });
  }

  clear() {
    this.pieces.length = 0;
    for (let i = this.bodies.length - 1; i >= 0; i--) this.removeBody(i);
    this.upload();
  }
}
