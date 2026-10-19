import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32, Simplex2, smoothstep } from '../core/noise';
import { patchMaterial } from '../render/environment';
import { Terrain, Island } from './terrain';

// Toy-smooth tropical flora: chunky ringed palms, puffy broadleaf trees,
// pebble rocks. One InstancedMesh per kind per island keeps culling cheap.

function hexL(c: number) {
  return new THREE.Color(c).convertSRGBToLinear();
}

function paint(geo: THREE.BufferGeometry, fn: (p: THREE.Vector3, out: THREE.Color) => void) {
  const pos = geo.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    fn(p, c);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

function stripUV(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  geo.deleteAttribute('uv');
  return geo;
}

function palmGeometry(height: number, lean: number, seed: number): THREE.BufferGeometry {
  const rnd = mulberry32(seed);
  const parts: THREE.BufferGeometry[] = [];
  // ---- trunk: curved, tapered, ringed
  const rings = 14;
  const radial = 7;
  const pos: number[] = [];
  const idx: number[] = [];
  const curve = (t: number) => new THREE.Vector3(lean * t * t, height * t, 0);
  const trunkBrown = hexL(0x8a6a48);
  const trunkDark = hexL(0x5e4630);
  const tcol: number[] = [];
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    const c = curve(t);
    const rad = 0.36 * (1 - t * 0.45) * (1 + 0.09 * Math.cos(t * rings * Math.PI));
    for (let s = 0; s < radial; s++) {
      const a = (s / radial) * Math.PI * 2;
      pos.push(c.x + Math.cos(a) * rad, c.y, c.z + Math.sin(a) * rad);
      const band = r % 2 === 0 ? 1 : 0.82;
      const col = trunkDark.clone().lerp(trunkBrown, (0.35 + t * 0.65) * band);
      tcol.push(col.r, col.g, col.b);
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < radial; s++) {
      const a = r * radial + s;
      const b = r * radial + ((s + 1) % radial);
      idx.push(a, a + radial, b, b, a + radial, b + radial);
    }
  }
  const trunk = new THREE.BufferGeometry();
  trunk.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  trunk.setAttribute('color', new THREE.Float32BufferAttribute(tcol, 3));
  trunk.setIndex(idx);
  trunk.computeVertexNormals();
  parts.push(trunk);

  // ---- crown of fronds
  const top = curve(1);
  const frondCount = 9;
  const leafA = hexL(0x2f7d32);
  const leafB = hexL(0x7cc24a);
  for (let f = 0; f < frondCount; f++) {
    const a = (f / frondCount) * Math.PI * 2 + rnd() * 0.4;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const L = 3.6 + rnd() * 1.2;
    const lift = 0.9 + rnd() * 0.7;
    const segs = 9;
    const fp: number[] = [];
    const fc: number[] = [];
    const fi: number[] = [];
    const tintShift = rnd() * 0.25;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const spine = top.clone()
        .addScaledVector(dir, t * L)
        .add(new THREE.Vector3(0, Math.sin(t * Math.PI * 0.55) * lift - t * t * 2.6, 0));
      const w = 0.85 * Math.pow(Math.sin(Math.min(1, t * 1.05) * Math.PI), 0.65) + 0.05;
      const fold = 0.28 * w;
      const l = spine.clone().addScaledVector(side, w).add(new THREE.Vector3(0, -fold, 0));
      const r = spine.clone().addScaledVector(side, -w).add(new THREE.Vector3(0, -fold, 0));
      fp.push(l.x, l.y, l.z, spine.x, spine.y + 0.04, spine.z, r.x, r.y, r.z);
      const c = leafA.clone().lerp(leafB, Math.min(1, t * 0.9 + tintShift));
      const edge = c.clone().multiplyScalar(0.85);
      fc.push(edge.r, edge.g, edge.b, c.r, c.g, c.b, edge.r, edge.g, edge.b);
    }
    for (let s = 0; s < segs; s++) {
      const b = s * 3;
      fi.push(b, b + 3, b + 1, b + 1, b + 3, b + 4, b + 1, b + 4, b + 2, b + 2, b + 4, b + 5);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(fc, 3));
    g.setIndex(fi);
    g.computeVertexNormals();
    parts.push(g);
  }
  // coconuts
  const nutCol = hexL(0x6b4a26);
  for (let n = 0; n < 3; n++) {
    const g = stripUV(new THREE.IcosahedronGeometry(0.26, 1));
    const a = (n / 3) * Math.PI * 2;
    g.translate(top.x + Math.cos(a) * 0.32, top.y - 0.25, top.z + Math.sin(a) * 0.32);
    paint(g, (_, c) => c.copy(nutCol));
    parts.push(g);
  }
  const merged = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  merged.computeBoundingSphere();
  return merged;
}

function treeGeometry(seed: number): THREE.BufferGeometry {
  const rnd = mulberry32(seed);
  const parts: THREE.BufferGeometry[] = [];
  const trunk = stripUV(new THREE.CylinderGeometry(0.22, 0.38, 3.2, 7, 1));
  trunk.translate(0, 1.6, 0);
  const bark = hexL(0x6e5238);
  paint(trunk, (_, c) => c.copy(bark));
  parts.push(trunk.toNonIndexed());
  const leafDark = hexL(0x2c6a2a);
  const leafLight = hexL(0x78b84a);
  const blobs = 3 + Math.floor(rnd() * 2);
  for (let b = 0; b < blobs; b++) {
    const r = 1.5 + rnd() * 0.9;
    let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(r, 1);
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    g = mergeVertices(g);
    const a = rnd() * Math.PI * 2;
    const off = b === 0 ? 0 : 1.1 + rnd() * 0.5;
    g.scale(1, 0.82, 1);
    g.translate(Math.cos(a) * off, 3.6 + rnd() * 1.3 + (b === 0 ? 0.6 : 0), Math.sin(a) * off);
    // gentle lumps for a hand-sculpted feel
    const p = g.getAttribute('position');
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const k = 1 + Math.sin(v.x * 2.1 + seed) * Math.sin(v.z * 1.9) * 0.06;
      p.setXYZ(i, v.x * k, v.y, v.z * k);
    }
    g.computeVertexNormals();
    paint(g, (pp, c) => {
      const t = smoothstep(2.2, 6.2, pp.y);
      c.copy(leafDark).lerp(leafLight, t * 0.85);
    });
    parts.push(g.toNonIndexed());
  }
  const merged = mergeGeometries(parts);
  merged.computeBoundingSphere();
  return merged;
}

function bushGeometry(): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, 1);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g);
  g.scale(1.1, 0.7, 1.1);
  g.translate(0, 0.35, 0);
  g.computeVertexNormals();
  const a = hexL(0x2f6e2c);
  const b = hexL(0x6fae44);
  paint(g, (p, c) => c.copy(a).lerp(b, smoothstep(-0.2, 1, p.y)));
  return g.toNonIndexed();
}

function rockGeometry(seed: number): THREE.BufferGeometry {
  const s = new Simplex2(seed);
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, 2);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g);
  const p = g.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 1 + s.noise(v.x * 1.3, v.y * 1.3 + v.z) * 0.22;
    p.setXYZ(i, v.x * k * 1.2, v.y * k * 0.7, v.z * k);
  }
  g.computeVertexNormals();
  const a = hexL(0x6f6a62);
  const b = hexL(0xa7a097);
  paint(g, (pp, c) => c.copy(a).lerp(b, smoothstep(-0.6, 0.8, pp.y)));
  return g;
}

interface Placement {
  x: number;
  y: number;
  z: number;
  rotY: number;
  scale: number;
  variant: number;
  tint: number;
}

export class Vegetation {
  readonly group = new THREE.Group();
  private palms: Placement[][] = [];
  private trees: Placement[][] = [];
  private bushes: Placement[][] = [];
  private rocks: Placement[][] = [];

  constructor(private terrain: Terrain, private density = 1) {
    this.group.name = 'vegetation';
    terrain.islands.forEach((isl, i) => this.placeOnIsland(isl, i));
  }

  private placeOnIsland(isl: Island, idx: number) {
    const t = this.terrain;
    const rnd = mulberry32(Math.floor(isl.seed * 1000) + idx);
    const s = new Simplex2(Math.floor(isl.seed * 77));
    const palms: Placement[] = [];
    const trees: Placement[] = [];
    const bushes: Placement[] = [];
    const rocks: Placement[] = [];
    const taken: { x: number; z: number; r: number }[] = [];
    const grid = new Map<number, number[]>();
    const key = (x: number, z: number) => (Math.floor(x / 6) + 1000) * 4000 + Math.floor(z / 6) + 1000;
    const free = (x: number, z: number, r: number) => {
      const gx = Math.floor(x / 6);
      const gz = Math.floor(z / 6);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oz = -1; oz <= 1; oz++) {
          const list = grid.get((gx + ox + 1000) * 4000 + gz + oz + 1000);
          if (!list) continue;
          for (const ti of list) {
            const o = taken[ti];
            if (Math.hypot(o.x - x, o.z - z) < o.r + r) return false;
          }
        }
      }
      return true;
    };
    const take = (x: number, z: number, r: number) => {
      taken.push({ x, z, r });
      const k = key(x, z);
      const l = grid.get(k);
      if (l) l.push(taken.length - 1);
      else grid.set(k, [taken.length - 1]);
    };
    const ext = isl.r * Math.max(isl.stretch, 1 / isl.stretch) * 1.15;
    const area = ext * ext * 4;
    const tries = Math.floor((area / 9) * this.density);
    const grad = new THREE.Vector2();
    for (let n = 0; n < tries; n++) {
      const x = isl.x + (rnd() * 2 - 1) * ext;
      const z = isl.z + (rnd() * 2 - 1) * ext;
      const h = t.heightAt(x, z);
      if (h < -0.8) continue;
      t.gradientAt(x, z, grad);
      const slope = grad.length();
      const clump = s.noise(x * 0.025, z * 0.025);
      const roll = rnd();
      // beach-line palms leaning toward the sea
      if (h > 0.45 && h < 4.2 && slope < 0.42 && roll < 0.2 + clump * 0.12) {
        if (!free(x, z, 1.9)) continue;
        take(x, z, 1.9);
        const lean = Math.atan2(grad.y, -grad.x); // rotates local +x (trunk lean) downhill
        palms.push({ x, y: h - 0.15, z, rotY: lean + (rnd() - 0.5) * 0.9, scale: 0.8 + rnd() * 0.45, variant: Math.floor(rnd() * 3), tint: rnd() });
        t.stampAO(x, z, 2.6, 0.22);
        continue;
      }
      if (isl.kind === 'atoll') continue;
      if (h > 2.6 && h < isl.peak * 0.85 && slope < 0.55) {
        const jungle = smoothstep(-0.25, 0.45, clump) * (0.55 + 0.45 * smoothstep(3, 12, h));
        if (roll < jungle * 0.55) {
          if (!free(x, z, 2.1)) continue;
          take(x, z, 2.1);
          trees.push({ x, y: h - 0.2, z, rotY: rnd() * Math.PI * 2, scale: 0.75 + rnd() * 0.55, variant: Math.floor(rnd() * 3), tint: rnd() });
          t.stampAO(x, z, 4.2, 0.38);
          continue;
        }
        if (roll < jungle * 0.75 + 0.04) {
          if (!free(x, z, 1.1)) continue;
          take(x, z, 1.1);
          bushes.push({ x, y: h - 0.1, z, rotY: rnd() * Math.PI * 2, scale: 0.6 + rnd() * 0.8, variant: 0, tint: rnd() });
          t.stampAO(x, z, 1.8, 0.25);
          continue;
        }
      }
      const rockChance = (slope > 0.5 ? 0.06 : 0) + (h < 1.0 ? 0.02 : 0) + (isl.kind === 'rocky' ? 0.03 : 0);
      if (roll < rockChance) {
        if (!free(x, z, 1.4)) continue;
        take(x, z, 1.4);
        rocks.push({ x, y: h - 0.25, z, rotY: rnd() * Math.PI * 2, scale: 0.6 + Math.pow(rnd(), 2) * 2.2, variant: Math.floor(rnd() * 2), tint: rnd() });
      }
    }
    this.palms.push(palms);
    this.trees.push(trees);
    this.bushes.push(bushes);
    this.rocks.push(rocks);
  }

  build() {
    const palmGeos = [palmGeometry(8.5, 1.6, 3), palmGeometry(10.5, 2.4, 7), palmGeometry(7, 0.9, 13)];
    const treeGeos = [treeGeometry(5), treeGeometry(17), treeGeometry(29)];
    const bushGeo = bushGeometry();
    const rockGeos = [rockGeometry(4), rockGeometry(9)];

    const palmMat = patchMaterial(
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, side: THREE.DoubleSide, envMapIntensity: 0.8 }),
      { clouds: true, sway: 0.0028 },
    );
    const treeMat = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, envMapIntensity: 0.8 }), { clouds: true, sway: 0.0018 });
    const bushMat = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, envMapIntensity: 0.8 }), { clouds: true });
    const rockMat = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, envMapIntensity: 0.8 }), { clouds: true, caustics: true });

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const sc = new THREE.Vector3();
    const p = new THREE.Vector3();
    const col = new THREE.Color();
    const add = (list: Placement[], geos: THREE.BufferGeometry[], mat: THREE.Material, tintFn: (t: number, c: THREE.Color) => void, tiltRocks = false) => {
      for (let v = 0; v < geos.length; v++) {
        const sub = list.filter((pl) => pl.variant % geos.length === v);
        if (!sub.length) continue;
        const inst = new THREE.InstancedMesh(geos[v], mat, sub.length);
        sub.forEach((pl, i) => {
          e.set(tiltRocks ? (pl.tint - 0.5) * 0.6 : 0, pl.rotY, tiltRocks ? (pl.tint - 0.3) * 0.5 : 0);
          q.setFromEuler(e);
          sc.setScalar(pl.scale);
          p.set(pl.x, pl.y, pl.z);
          m.compose(p, q, sc);
          inst.setMatrixAt(i, m);
          tintFn(pl.tint, col);
          inst.setColorAt(i, col);
        });
        inst.castShadow = true;
        inst.receiveShadow = true;
        inst.computeBoundingSphere();
        this.group.add(inst);
      }
    };
    for (let i = 0; i < this.palms.length; i++) {
      add(this.palms[i], palmGeos, palmMat, (t, c) => c.setRGB(0.9 + t * 0.2, 0.95 + t * 0.1, 0.85 + (1 - t) * 0.1));
      add(this.trees[i], treeGeos, treeMat, (t, c) => c.setRGB(0.85 + t * 0.3, 0.9 + t * 0.15, 0.8 + (1 - t) * 0.2));
      add(this.bushes[i], [bushGeo], bushMat, (t, c) => c.setRGB(0.85 + t * 0.3, 0.95, 0.85));
      add(this.rocks[i], rockGeos, rockMat, (t, c) => c.setRGB(0.9 + t * 0.2, 0.9 + t * 0.15, 0.88 + t * 0.1), true);
    }
    return this.group;
  }

  counts() {
    const n = (l: Placement[][]) => l.reduce((a, b) => a + b.length, 0);
    return { palms: n(this.palms), trees: n(this.trees), bushes: n(this.bushes), rocks: n(this.rocks) };
  }
}
