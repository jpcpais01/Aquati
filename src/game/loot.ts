import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { patchMaterial } from '../render/environment';
import { World } from './world';

// Floating salvage: barrels and treasure chests that bob on the swell and
// glint in the sun. Sail through them to collect gold and patch your hull.

interface Item {
  x: number;
  z: number;
  kind: 0 | 1; // barrel | chest
  value: number;
  heal: number;
  spin: number;
  phase: number;
  age: number;
  sparkle: number;
}

function colored(geo: THREE.BufferGeometry, hex: number) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const c = new THREE.Color(hex);
  const n = g.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

function barrel() {
  const parts = [colored(new THREE.CylinderGeometry(0.42, 0.42, 1.1, 12), 0x8f5d34)];
  for (const y of [-0.38, 0.38]) {
    const h = new THREE.CylinderGeometry(0.44, 0.44, 0.08, 12);
    h.translate(0, y, 0);
    parts.push(colored(h, 0x2c2622));
  }
  const g = mergeGeometries(parts);
  g.rotateZ(Math.PI / 2);
  return g;
}

function chest() {
  const body = new THREE.BoxGeometry(1.2, 0.7, 0.8);
  const lid = new THREE.CylinderGeometry(0.4, 0.4, 1.2, 10, 1, false, 0, Math.PI);
  lid.rotateZ(Math.PI / 2);
  lid.translate(0, 0.35, 0);
  const band1 = new THREE.BoxGeometry(0.1, 0.78, 0.84);
  band1.translate(-0.35, 0.04, 0);
  const band2 = band1.clone();
  band2.translate(0.7, 0, 0);
  const lock = new THREE.BoxGeometry(0.2, 0.22, 0.06);
  lock.translate(0, 0.25, 0.42);
  return mergeGeometries([colored(body, 0x7a4426), colored(lid, 0x8a4f2b), colored(band1, 0xe2b552), colored(band2, 0xe2b552), colored(lock, 0xf2c45a)]);
}

export class Loot {
  readonly group = new THREE.Group();
  private items: Item[] = [];
  private meshes: THREE.InstancedMesh[];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();

  constructor() {
    const mat = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.1 }), { clouds: true, caustics: true });
    this.meshes = [barrel(), chest()].map((g) => {
      const im = new THREE.InstancedMesh(g, mat, 64);
      im.count = 0;
      im.castShadow = true;
      im.frustumCulled = false;
      this.group.add(im);
      return im;
    });
  }

  drop(x: number, z: number, count: number, rich = false) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 3 + Math.random() * 8;
      const chestItem = rich ? i === 0 : Math.random() < 0.15;
      this.items.push({
        x: x + Math.cos(a) * r,
        z: z + Math.sin(a) * r,
        kind: chestItem ? 1 : 0,
        value: chestItem ? 120 + Math.floor(Math.random() * 80) : 20 + Math.floor(Math.random() * 25),
        heal: chestItem ? 0.06 : 0.1,
        spin: (Math.random() - 0.5) * 0.4,
        phase: Math.random() * 10,
        age: 0,
        sparkle: 0,
      });
    }
  }

  /** Returns collected items for the given collector position. */
  update(dt: number, world: World, collector: THREE.Vector3 | null, radius: number): Item[] {
    const got: Item[] = [];
    const counts = [0, 0];
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.age += dt;
      // drift with the wind
      it.x += world.wind.dirX * 0.25 * dt;
      it.z += world.wind.dirZ * 0.25 * dt;
      if (collector) {
        const dx = collector.x - it.x, dz = collector.z - it.z;
        const d = Math.hypot(dx, dz);
        if (d < radius * 0.5) {
          got.push(it);
          this.items.splice(i, 1);
          continue;
        }
        if (d < radius) {
          // magnet: pull harder the closer it gets
          const pull = Math.min(d, (6 + 26 * (1 - d / radius)) * dt);
          it.x += (dx / d) * pull;
          it.z += (dz / d) * pull;
        }
      }
      if (it.age > 240) {
        this.items.splice(i, 1);
        continue;
      }
    }
    for (const it of this.items) {
      const k = it.kind;
      const idx = counts[k]++;
      if (idx >= 64) continue;
      const y = world.waterHeight(it.x, it.z);
      this.e.set(Math.sin(world.time * 1.3 + it.phase) * 0.18, it.phase + world.time * it.spin, Math.cos(world.time * 1.1 + it.phase) * 0.15);
      this.q.setFromEuler(this.e);
      this.m.compose(new THREE.Vector3(it.x, y + (k ? 0.05 : -0.05), it.z), this.q, new THREE.Vector3(1, 1, 1));
      this.meshes[k].setMatrixAt(idx, this.m);
      it.sparkle += dt;
      if (it.sparkle > (k ? 0.18 : 0.6)) {
        it.sparkle = 0;
        world.particles.sparkle(new THREE.Vector3(it.x, y, it.z));
      }
    }
    this.meshes.forEach((m, k) => {
      m.count = Math.min(64, counts[k]);
      m.instanceMatrix.needsUpdate = true;
    });
    return got;
  }

  nearest(x: number, z: number): { x: number; z: number; d: number } | null {
    let best: { x: number; z: number; d: number } | null = null;
    for (const it of this.items) {
      const d = Math.hypot(it.x - x, it.z - z);
      if (!best || d < best.d) best = { x: it.x, z: it.z, d };
    }
    return best;
  }

  all() {
    return this.items;
  }

  clear() {
    this.items.length = 0;
  }
}
