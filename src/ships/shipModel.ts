import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clamp, lerp, smoothstep } from '../core/noise';
import { patchMaterial } from '../render/environment';
import { Livery, ShipClass } from './shipTypes';
import { deckTexture, flagTexture, hullTexture, sailTexture, sternTexture } from './shipTextures';

// Fully procedural ships: a lofted hull with real sheer, tumblehome, bilge
// and stem; raised castles; planked decks; rigged masts with braced yards and
// billowing canvas; cannons poking through painted gunports. Local frame:
// +Z bow, +Y up, +X port, waterline at y = 0.

export class HullShape {
  constructor(readonly c: ShipClass) {}

  z(t: number) {
    return (t - 0.5) * this.c.length;
  }

  halfBeam(t: number) {
    const B = this.c.beam / 2;
    const mid = 0.43;
    if (t < mid) {
      const u = t / mid;
      return B * (this.c.transom + (1 - this.c.transom) * Math.pow(Math.sin((u * Math.PI) / 2), 0.75));
    }
    const u = (t - mid) / (1 - mid);
    return B * Math.pow(Math.max(1 - Math.pow(u, 2.3), 0), 0.6);
  }

  sheer(t: number) {
    const c = this.c;
    const fb = Math.max(0, (t - 0.5) / 0.5);
    const st = Math.max(0, (0.5 - t) / 0.5);
    return c.freeboard + c.sheerBow * fb * fb + c.sheerStern * st * st;
  }

  sternMask(t: number) {
    const sc = this.c.sternCastle;
    return sc ? 1 - smoothstep(sc.t - 0.035, sc.t + 0.012, t) : 0;
  }

  foreMask(t: number) {
    const fc = this.c.foreCastle;
    return fc ? smoothstep(fc.t - 0.012, fc.t + 0.035, t) : 0;
  }

  top(t: number) {
    return this.sheer(t) + (this.c.sternCastle?.h ?? 0) * this.sternMask(t) + (this.c.foreCastle?.h ?? 0) * this.foreMask(t);
  }

  /** Stepped deck height (castles are discrete levels). */
  deckY(t: number) {
    const c = this.c;
    let y = this.sheer(t) - c.bulwark;
    if (c.sternCastle && t < c.sternCastle.t) y += c.sternCastle.h;
    if (c.foreCastle && t > c.foreCastle.t) y += c.foreCastle.h;
    return y;
  }

  mainDeckY(t: number) {
    return this.sheer(t) - this.c.bulwark;
  }

  bottom(t: number) {
    const d = this.c.draft;
    const stern = -d * (0.78 + 0.22 * smoothstep(0, 0.2, t));
    const bowT = Math.pow(smoothstep(0.72, 1.0, t), 1.5);
    return lerp(stern, this.top(t) * 0.3, bowT);
  }

  private exponent(t: number) {
    const bell = 1 - Math.pow(Math.abs(2 * t - 1), 1.4);
    return lerp(t > 0.5 ? 1.45 : 2.0, 2.9, bell);
  }

  /** Point on the section at fraction v (0 keel .. 1 rail). Returns [halfWidth, y]. */
  section(t: number, v: number): [number, number] {
    const b = this.bottom(t);
    const tp = this.top(t);
    const y = b + (tp - b) * v;
    const w = this.halfBeam(t);
    const vW = clamp((0 - b) / (tp - b), 0.05, 0.92);
    const n = this.exponent(t);
    let x: number;
    if (v < vW) {
      const q = v / vW;
      x = w * Math.pow(Math.max(0, 1 - Math.pow(1 - q, n)), 1 / n);
    } else {
      const q = (v - vW) / (1 - vW);
      x = w * (1 - this.c.tumblehome * Math.pow(q, 1.6));
    }
    return [x, y];
  }

  halfWidthAtY(t: number, y: number) {
    const b = this.bottom(t);
    const tp = this.top(t);
    return this.section(t, clamp((y - b) / (tp - b), 0, 1))[0];
  }

  texV(t: number, y: number) {
    if (y <= 0) return 0.3 * clamp(1 + y / this.c.draft, 0, 1);
    return 0.3 + 0.7 * clamp(y / this.top(t), 0, 1);
  }
}

export interface Muzzle {
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  side: number; // +1 port, -1 starboard
}

export interface SailRef {
  mesh: THREE.Mesh;
  tier: number;
}

interface MaterialSet {
  hull: THREE.MeshStandardMaterial;
  stern: THREE.MeshStandardMaterial;
  deck: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  iron: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
  glow: THREE.MeshBasicMaterial;
  flag: THREE.MeshStandardMaterial;
  rope: THREE.LineBasicMaterial;
  sailPlain: THREE.Texture;
  sailEmblem: THREE.Texture;
}

const materialCache = new Map<string, MaterialSet>();
let sharedDeck: THREE.Texture | null = null;

function hexL(c: string | number) {
  return new THREE.Color(c as THREE.ColorRepresentation);
}

function colorize(geo: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g.getAttribute('uv')) g.deleteAttribute('uv');
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = color.r;
    arr[i * 3 + 1] = color.g;
    arr[i * 3 + 2] = color.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** A cylinder spanning two points. */
function spar(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, radial = 8): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, radial, 1);
  g.translate(0, len / 2, 0);
  const dir = b.clone().sub(a).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  g.applyMatrix4(new THREE.Matrix4().compose(a, q, new THREE.Vector3(1, 1, 1)));
  return g;
}

function sailGeometry(tl: THREE.Vector2, tr: THREE.Vector2, bl: THREE.Vector2, br: THREE.Vector2, billow: number): THREE.BufferGeometry {
  const nu = 10;
  const nv = 7;
  const pos: number[] = [];
  const uv: number[] = [];
  const bil: number[] = [];
  const nrm: number[] = [];
  for (let j = 0; j <= nv; j++) {
    const v = j / nv; // 0 top .. 1 bottom
    const l = tl.clone().lerp(bl, v);
    const r = tr.clone().lerp(br, v);
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      const p = l.clone().lerp(r, u);
      // a slight concave roach on the foot for elegance
      if (j === nv) p.y += Math.sin(u * Math.PI) * 0.12 * billow;
      pos.push(p.x, p.y, 0);
      uv.push(u, 1 - v);
      bil.push(billow);
      nrm.push(0, 0, 1);
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i;
      const b = a + 1;
      const c = a + nu + 1;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aBillow', new THREE.Float32BufferAttribute(bil, 1));
  g.setIndex(idx);
  return g;
}

export class ShipModel {
  readonly root = new THREE.Group();
  readonly shape: HullShape;
  readonly muzzles: Muzzle[] = [];
  readonly sails: SailRef[] = [];
  readonly yardPivots: THREE.Object3D[] = [];
  readonly foreAftPivots: THREE.Object3D[] = [];
  readonly flagPivot = new THREE.Group();
  readonly sailMaterial: THREE.MeshStandardMaterial;
  readonly sailEmblemMaterial: THREE.MeshStandardMaterial;
  readonly sailUniforms = { uSailFill: { value: 1 }, uSailPhase: { value: Math.random() * 10 }, uSailDepth: { value: 1 } };
  readonly deckPoints: THREE.Vector3[] = [];
  private woodParts: THREE.BufferGeometry[] = [];
  private ironParts: THREE.BufferGeometry[] = [];
  private trimParts: THREE.BufferGeometry[] = [];
  private glowParts: THREE.BufferGeometry[] = [];
  private mats: MaterialSet;
  private ropes: number[] = [];

  constructor(readonly cls: ShipClass, readonly livery: Livery, quality = 1) {
    this.shape = new HullShape(cls);
    this.mats = this.materials(quality);
    this.sailMaterial = this.makeSailMaterial(this.mats.sailPlain);
    this.sailEmblemMaterial = this.makeSailMaterial(this.mats.sailEmblem);
    this.buildHull();
    this.buildDeck();
    this.buildCastleWalls();
    this.buildCannons();
    this.buildRig();
    this.buildDetails();
    this.finish();
  }

  // ---------------------------------------------------------------- materials

  private cannonTs(): number[] {
    const [a, b] = this.cls.cannonSpan;
    const n = this.cls.cannonsPerSide;
    return Array.from({ length: n }, (_, i) => lerp(a, b, (i + 0.5) / n));
  }

  private cannonY(t: number) {
    return this.shape.mainDeckY(t) + 0.5;
  }

  private materials(quality: number): MaterialSet {
    const key = `${this.cls.id}|${this.livery.id}|${quality}`;
    const cached = materialCache.get(key);
    if (cached) return cached;
    const s = this.shape;
    const L = this.cls.length;
    const ports = this.cannonTs().map((t) => ({
      u: t,
      v: s.texV(t, this.cannonY(t)),
      w: 0.62 / L,
      h: (0.62 / s.top(t)) * 0.7,
    }));
    const hullMap = hullTexture(this.livery, ports, L, this.cls.length * 7);
    hullMap.anisotropy = 8;
    const hullParams = { map: hullMap, roughness: 0.48, metalness: 0, envMapIntensity: 1.0 };
    const hull =
      quality > 0
        ? new THREE.MeshPhysicalMaterial({ ...hullParams, clearcoat: 0.55, clearcoatRoughness: 0.28 })
        : new THREE.MeshStandardMaterial(hullParams);
    patchMaterial(hull, { clouds: true, caustics: true });
    const sternRows = this.cls.sternCastle ? (this.cls.id === 'galleon' ? 3 : 2) : 1;
    const st = sternTexture(this.livery, sternRows);
    const stern = patchMaterial(
      new THREE.MeshStandardMaterial({ map: st.map, emissiveMap: st.emissive, emissive: new THREE.Color(1, 0.75, 0.4), emissiveIntensity: 1.4, roughness: 0.5 }),
      { clouds: true },
    );
    if (!sharedDeck) sharedDeck = deckTexture();
    const deck = patchMaterial(new THREE.MeshStandardMaterial({ map: sharedDeck, roughness: 0.78 }), { clouds: true });
    const wood = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.66 }), { clouds: true, caustics: true });
    const iron = patchMaterial(new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.32, metalness: 0.75, envMapIntensity: 1.3 }), { clouds: true });
    const trim = patchMaterial(new THREE.MeshStandardMaterial({ color: hexL(this.livery.trim), roughness: 0.3, metalness: 0.8, envMapIntensity: 1.4 }), { clouds: true });
    const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(5.0, 3.2, 1.4) });
    const flag = patchMaterial(new THREE.MeshStandardMaterial({ map: flagTexture(this.livery), side: THREE.DoubleSide, roughness: 0.8 }), { flag: true });
    const rope = new THREE.LineBasicMaterial({ color: 0x2a1f16, transparent: true, opacity: 0.75 });
    const set: MaterialSet = {
      hull,
      stern,
      deck,
      wood,
      iron,
      trim,
      glow,
      flag,
      rope,
      sailPlain: sailTexture(this.livery, false),
      sailEmblem: sailTexture(this.livery, true),
    };
    materialCache.set(key, set);
    return set;
  }

  private makeSailMaterial(map: THREE.Texture) {
    const m = new THREE.MeshStandardMaterial({ map, side: THREE.DoubleSide, roughness: 0.92, envMapIntensity: 0.9 });
    return patchMaterial(m, { sail: true, clouds: true }, this.sailUniforms);
  }

  // ---------------------------------------------------------------- hull

  private tSamples(n: number): number[] {
    return Array.from({ length: n + 1 }, (_, k) => 0.5 - 0.5 * Math.cos((k / n) * Math.PI));
  }

  private buildHull() {
    const s = this.shape;
    const ts = this.tSamples(64);
    const M = 14;
    const vs = Array.from({ length: M }, (_, k) => {
      const q = k / (M - 1);
      return q * q * (3 - 2 * q) * 0.35 + q * 0.65;
    });
    const ringN = M * 2 - 1;
    const pos: number[] = [];
    const uv: number[] = [];
    for (const t of ts) {
      const z = s.z(t);
      for (let k = 0; k < ringN; k++) {
        const side = k < M - 1 ? -1 : 1;
        const vi = k < M - 1 ? M - 1 - k : k - (M - 1);
        const [x, y] = s.section(t, vs[vi]);
        pos.push(side * x, y, z);
        uv.push(t, s.texV(t, y));
      }
    }
    const idx: number[] = [];
    for (let r = 0; r < ts.length - 1; r++) {
      for (let k = 0; k < ringN - 1; k++) {
        const a = r * ringN + k;
        const b = a + 1;
        const c = a + ringN;
        const d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const hull = new THREE.Mesh(g, this.mats.hull);
    hull.castShadow = true;
    hull.receiveShadow = true;
    this.root.add(hull);

    // transom: fan across the stern ring
    const t0 = ts[0];
    const z0 = s.z(t0) - 0.02;
    const b0 = s.bottom(t0);
    const top0 = s.top(t0);
    const tp: number[] = [];
    const tuv: number[] = [];
    const w0 = s.halfBeam(t0);
    const cy = (b0 + top0) / 2;
    tp.push(0, cy, z0);
    tuv.push(0.5, (cy - b0) / (top0 - b0));
    for (let k = 0; k < ringN; k++) {
      const side = k < M - 1 ? -1 : 1;
      const vi = k < M - 1 ? M - 1 - k : k - (M - 1);
      const [x, y] = s.section(t0, vs[vi]);
      tp.push(side * x, y, z0);
      tuv.push(0.5 + (side * x) / (2.2 * w0), (y - b0) / (top0 - b0));
    }
    const tidx: number[] = [];
    for (let k = 1; k < ringN; k++) tidx.push(0, k + 1, k);
    tidx.push(0, 1, ringN); // top edge closure
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
    tg.setAttribute('uv', new THREE.Float32BufferAttribute(tuv, 2));
    tg.setIndex(tidx);
    tg.computeVertexNormals();
    const transom = new THREE.Mesh(tg, this.mats.stern);
    transom.castShadow = true;
    this.root.add(transom);

    // inner bulwark walls + rounded rail cap
    const wallCol = hexL(this.livery.strake).multiplyScalar(0.8);
    const inner: number[] = [];
    const innerCol: number[] = [];
    const its = ts.filter((t) => t > 0.004 && t < 0.985);
    for (const t of its) {
      const z = s.z(t);
      const y0 = s.mainDeckY(t) - 0.05;
      const y1 = s.top(t) - 0.02;
      const x0 = s.halfWidthAtY(t, y0) - 0.13;
      const x1 = s.halfWidthAtY(t, y1) - 0.13;
      inner.push(x0, y0, z, x1, y1, z, -x0, y0, z, -x1, y1, z);
      for (let q = 0; q < 4; q++) innerCol.push(wallCol.r, wallCol.g, wallCol.b);
    }
    const iidx: number[] = [];
    for (let r = 0; r < its.length - 1; r++) {
      const a = r * 4;
      const n = a + 4;
      // port wall faces -x (inward), starboard faces +x
      iidx.push(a, n, a + 1, a + 1, n, n + 1);
      iidx.push(a + 2, a + 3, n + 2, a + 3, n + 3, n + 2);
    }
    const ig = new THREE.BufferGeometry();
    ig.setAttribute('position', new THREE.Float32BufferAttribute(inner, 3));
    ig.setAttribute('color', new THREE.Float32BufferAttribute(innerCol, 3));
    ig.setIndex(iidx);
    ig.computeVertexNormals();
    this.woodParts.push(ig.toNonIndexed());

    // rail: one closed loop around the sheer
    const pts: THREE.Vector3[] = [];
    const railTs = this.tSamples(40).filter((t) => t > 0.003 && t < 0.997);
    for (const t of railTs) pts.push(new THREE.Vector3(-(s.halfWidthAtY(t, s.top(t)) - 0.065), s.top(t) + 0.03, s.z(t)));
    pts.push(new THREE.Vector3(0, s.top(1) + 0.03, s.z(1) + 0.05));
    for (let i = railTs.length - 1; i >= 0; i--) {
      const t = railTs[i];
      pts.push(new THREE.Vector3(s.halfWidthAtY(t, s.top(t)) - 0.065, s.top(t) + 0.03, s.z(t)));
    }
    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    const railR = 0.07 + this.cls.length * 0.0028;
    const rail = new THREE.TubeGeometry(curve, 220, railR, 6, true);
    rail.deleteAttribute('uv');
    this.trimParts.push(rail.toNonIndexed());
  }

  private buildDeck() {
    const s = this.shape;
    const c = this.cls;
    const segs: [number, number][] = [];
    const a = c.sternCastle?.t ?? 0;
    const b = c.foreCastle?.t ?? 1;
    if (c.sternCastle) segs.push([0.003, a]);
    segs.push([Math.max(0.003, a), Math.min(0.975, b)]);
    if (c.foreCastle) segs.push([b, 0.975]);
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (const [t0, t1] of segs) {
      const base = pos.length / 3;
      const n = 24;
      for (let k = 0; k <= n; k++) {
        const t = lerp(t0, t1, k / n);
        const z = s.z(t);
        // keep each deck level flat at its own height (follows the sheer)
        const y = t0 < a && c.sternCastle ? s.sheer(t) + c.sternCastle.h - c.bulwark : t1 > b && c.foreCastle && t0 >= b ? s.sheer(t) + c.foreCastle.h - c.bulwark : s.mainDeckY(t);
        const w = Math.max(0.05, s.halfWidthAtY(t, y) - 0.14);
        pos.push(-w, y, z, 0, y + 0.06, z, w, y, z);
        uv.push(-w * 0.25, z * 0.25, 0, z * 0.25, w * 0.25, z * 0.25);
        if (k > 0 && k < n && k % 3 === 0) this.deckPoints.push(new THREE.Vector3(0, y, z));
      }
      for (let k = 0; k < n; k++) {
        const r0 = base + k * 3;
        const r1 = r0 + 3;
        idx.push(r0, r1, r0 + 1, r1, r1 + 1, r0 + 1, r0 + 1, r1 + 1, r0 + 2, r1 + 1, r1 + 2, r0 + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const deck = new THREE.Mesh(g, this.mats.deck);
    deck.receiveShadow = true;
    deck.castShadow = false;
    this.root.add(deck);
  }

  private balustrade(t: number, yDeck: number, facing: number) {
    const s = this.shape;
    const z = s.z(t) + facing * 0.05;
    const w = s.halfWidthAtY(t, yDeck) - 0.2;
    const postCol = hexL(this.livery.trim);
    const n = Math.max(4, Math.floor((w * 2) / 0.45));
    for (let i = 0; i <= n; i++) {
      const x = -w + (i / n) * w * 2;
      const post = new THREE.CylinderGeometry(0.045, 0.06, 0.62, 6);
      post.translate(x, yDeck + 0.31, z);
      this.trimParts.push(colorize(post, postCol).deleteAttribute('color'));
    }
    const rail = spar(new THREE.Vector3(-w - 0.05, yDeck + 0.64, z), new THREE.Vector3(w + 0.05, yDeck + 0.64, z), 0.06, 0.06, 6);
    rail.deleteAttribute('uv');
    this.trimParts.push(rail.toNonIndexed());
  }

  private buildCastleWalls() {
    const s = this.shape;
    const c = this.cls;
    const strake = hexL(this.livery.strake);
    const dark = hexL(this.livery.wale);
    const addWall = (t: number, yLow: number, yHigh: number, facing: number) => {
      const z = s.z(t);
      const w = s.halfWidthAtY(t, yLow) - 0.12;
      const wall = new THREE.BoxGeometry(w * 2, yHigh - yLow, 0.14);
      wall.translate(0, (yLow + yHigh) / 2, z);
      this.woodParts.push(colorize(wall, strake.clone().multiplyScalar(0.9)));
      // door + windows on the wall face
      const door = new THREE.BoxGeometry(0.75, Math.min(1.25, yHigh - yLow - 0.15), 0.06);
      door.translate(0, yLow + Math.min(1.25, yHigh - yLow - 0.15) / 2, z + facing * 0.09);
      this.woodParts.push(colorize(door, dark));
      for (const sx of [-1, 1]) {
        const win = new THREE.BoxGeometry(0.42, 0.38, 0.05);
        win.translate(sx * w * 0.55, yLow + (yHigh - yLow) * 0.6, z + facing * 0.09);
        this.glowParts.push(win);
      }
    };
    if (c.sternCastle) {
      const t = c.sternCastle.t;
      const low = s.mainDeckY(t);
      const high = s.sheer(t) + c.sternCastle.h - c.bulwark;
      addWall(t, low, high, 1);
      this.balustrade(t, high, 1);
    }
    if (c.foreCastle) {
      const t = c.foreCastle.t;
      const low = s.mainDeckY(t);
      const high = s.sheer(t) + c.foreCastle.h - c.bulwark;
      addWall(t, low, high, -1);
      this.balustrade(t, high, -1);
    }
  }

  // ---------------------------------------------------------------- guns

  private buildCannons() {
    const s = this.shape;
    const k = 0.75 + this.cls.length * 0.011;
    for (const side of [1, -1]) {
      for (const t of this.cannonTs()) {
        const y = this.cannonY(t);
        const z = s.z(t);
        const x = s.halfWidthAtY(t, y);
        const barrel = new THREE.CylinderGeometry(0.12 * k, 0.17 * k, 1.5 * k, 10);
        barrel.rotateZ((-side * Math.PI) / 2);
        barrel.translate(side * (x + 0.05 * k), y, z);
        this.ironParts.push(barrel);
        const ring = new THREE.CylinderGeometry(0.17 * k, 0.17 * k, 0.14 * k, 10);
        ring.rotateZ((-side * Math.PI) / 2);
        ring.translate(side * (x + 0.72 * k), y, z);
        this.ironParts.push(ring);
        this.muzzles.push({ pos: new THREE.Vector3(side * (x + 0.85 * k), y, z), dir: new THREE.Vector3(side, 0, 0), side });
      }
    }
    // stern chasers through the transom
    for (let i = 0; i < this.cls.chasers; i++) {
      const x = (i - (this.cls.chasers - 1) / 2) * 1.3;
      const t = 0.01;
      const y = this.shape.mainDeckY(0.05) + 0.4;
      const z = s.z(t);
      const barrel = new THREE.CylinderGeometry(0.11 * k, 0.15 * k, 1.2 * k, 10);
      barrel.rotateX(-Math.PI / 2);
      barrel.translate(x, y, z - 0.35);
      this.ironParts.push(barrel);
    }
  }

  // ---------------------------------------------------------------- rig

  private buildRig() {
    const s = this.shape;
    const c = this.cls;
    const woodCol = hexL(0x6a4a2e);
    const darkWood = hexL(0x3e2a1a);
    const B = c.beam;
    let maxMast = 0;
    let maxMastTop = new THREE.Vector3();
    const mastTops: THREE.Vector3[] = [];

    c.masts.forEach((m, mi) => {
      const z = s.z(m.t);
      const y0 = s.deckY(m.t);
      const H = m.height;
      const r0 = 0.12 + H * 0.0085;
      const mastG = new THREE.CylinderGeometry(r0 * 0.5, r0, H, 10);
      mastG.translate(0, y0 + H / 2, z);
      this.woodParts.push(colorize(mastG, woodCol));
      // mast cap + truck
      const cap = new THREE.SphereGeometry(r0 * 0.8, 10, 6);
      cap.translate(0, y0 + H + 0.05, z);
      this.trimParts.push(cap.toNonIndexed().deleteAttribute('uv'));
      const top = new THREE.Vector3(0, y0 + H, z);
      mastTops.push(top);
      if (H > maxMast) {
        maxMast = H;
        maxMastTop = top.clone();
      }
      if (m.top) {
        const plat = new THREE.CylinderGeometry(B * 0.16, B * 0.13, 0.18, 14);
        plat.translate(0, y0 + H * 0.6, z);
        this.woodParts.push(colorize(plat, darkWood));
      }

      // shrouds to the rail
      const railY = s.top(m.t);
      for (const side of [1, -1]) {
        for (const dt of [-0.05, -0.02, 0.012]) {
          const tt = clamp(m.t + dt, 0.02, 0.96);
          const rx = side * (s.halfWidthAtY(tt, railY) + 0.05);
          this.rope(new THREE.Vector3(0, y0 + H * 0.6, z), new THREE.Vector3(rx, s.top(tt), s.z(tt)));
        }
        this.rope(new THREE.Vector3(0, y0 + H * 0.93, z), new THREE.Vector3(side * B * 0.16, y0 + H * 0.6, z));
      }

      if (m.rig === 'square') {
        const pivot = new THREE.Group();
        pivot.position.set(0, 0, z);
        this.root.add(pivot);
        this.yardPivots.push(pivot);
        const fr = m.tiers === 1 ? [0.75] : m.tiers === 2 ? [0.5, 0.84] : [0.4, 0.66, 0.89];
        const widths = m.tiers === 1 ? [1.4] : m.tiers === 2 ? [1.6, 1.2] : [1.75, 1.35, 0.95];
        const yards: { y: number; half: number }[] = [];
        fr.forEach((f, i) => {
          const y = y0 + H * f;
          const half = (B * widths[i]) / 2;
          yards.push({ y, half });
          const yard = spar(new THREE.Vector3(-half, y, 0), new THREE.Vector3(half, y, 0), 0.09 + H * 0.002, 0.06, 8);
          const yardMesh = new THREE.Mesh(colorize(yard, darkWood), this.mats.wood);
          yardMesh.castShadow = true;
          pivot.add(yardMesh);
        });
        yards.forEach((yd, i) => {
          const bottomY = i === 0 ? Math.max(y0 + 2.1, yd.y - H * 0.38) : yards[i - 1].y + 0.2;
          const bottomHalf = i === 0 ? yd.half * 1.04 : yards[i - 1].half * 0.97;
          const h = yd.y - bottomY;
          const geo = sailGeometry(
            new THREE.Vector2(-yd.half * 0.95, 0),
            new THREE.Vector2(yd.half * 0.95, 0),
            new THREE.Vector2(-bottomHalf * 0.95, -h),
            new THREE.Vector2(bottomHalf * 0.95, -h),
            Math.min(yd.half * 0.32, 1.4),
          );
          const emblem = i === 0 && (mi === c.masts.length - 1 || c.masts.length === 1 || (c.masts.length === 3 && mi === 1));
          const sail = new THREE.Mesh(geo, emblem ? this.sailEmblemMaterial : this.sailMaterial);
          sail.position.set(0, yd.y - 0.12, 0.18);
          sail.castShadow = true;
          pivot.add(sail);
          this.sails.push({ mesh: sail, tier: i });
        });
      } else if (m.rig === 'gaff') {
        const pivot = new THREE.Group();
        pivot.position.set(0, 0, z);
        this.root.add(pivot);
        this.foreAftPivots.push(pivot);
        const footY = y0 + 1.9;
        const throatY = y0 + H * 0.78;
        const boomLen = c.length * 0.5;
        const gaffLen = c.length * 0.36;
        const peakY = throatY + gaffLen * 0.55;
        const peakA = gaffLen * 0.83;
        const boom = spar(new THREE.Vector3(0, footY, 0), new THREE.Vector3(0, footY, -boomLen), 0.13, 0.09);
        const gaff = spar(new THREE.Vector3(0, throatY, 0), new THREE.Vector3(0, peakY, -peakA), 0.11, 0.07);
        for (const sp of [boom, gaff]) {
          const mesh = new THREE.Mesh(colorize(sp, darkWood), this.mats.wood);
          mesh.castShadow = true;
          pivot.add(mesh);
        }
        // plane coords: x = aft distance, y = up from foot
        const geo = sailGeometry(
          new THREE.Vector2(0.15, throatY - footY),
          new THREE.Vector2(peakA, peakY - footY),
          new THREE.Vector2(0.15, 0.1),
          new THREE.Vector2(boomLen * 0.96, 0.1),
          1.2,
        );
        const sail = new THREE.Mesh(geo, this.sailEmblemMaterial);
        sail.position.set(0, footY, 0);
        sail.rotation.y = Math.PI / 2;
        sail.castShadow = true;
        pivot.add(sail);
        this.sails.push({ mesh: sail, tier: 0 });
        // a small square topsail above for charm
        const ty = y0 + H * 0.92;
        const half = B * 0.42;
        const tyard = spar(new THREE.Vector3(-half, ty, z), new THREE.Vector3(half, ty, z), 0.07, 0.05);
        this.woodParts.push(colorize(tyard, darkWood));
        const tgeo = sailGeometry(
          new THREE.Vector2(-half * 0.92, 0),
          new THREE.Vector2(half * 0.92, 0),
          new THREE.Vector2(-half * 1.05, -(ty - throatY - 0.4)),
          new THREE.Vector2(half * 1.05, -(ty - throatY - 0.4)),
          0.6,
        );
        const ts = new THREE.Mesh(tgeo, this.sailMaterial);
        ts.position.set(0, ty - 0.1, z + 0.18);
        ts.castShadow = true;
        this.root.add(ts);
        this.sails.push({ mesh: ts, tier: 1 });
      } else {
        // lateen: long slanted yard with a triangular sail
        const pivot = new THREE.Group();
        pivot.position.set(0, 0, z);
        this.root.add(pivot);
        this.foreAftPivots.push(pivot);
        const lowY = y0 + H * 0.3;
        const fwd = new THREE.Vector3(0, y0 + H * 0.42, c.length * 0.12);
        const aft = new THREE.Vector3(0, y0 + H * 1.0, -c.length * 0.2);
        const yard = spar(fwd, aft, 0.1, 0.06);
        const yardMesh = new THREE.Mesh(colorize(yard, darkWood), this.mats.wood);
        yardMesh.castShadow = true;
        pivot.add(yardMesh);
        const geo = sailGeometry(
          new THREE.Vector2(-fwd.z + 0.2, fwd.y - lowY - 0.1),
          new THREE.Vector2(-aft.z - 0.3, aft.y - lowY - 0.2),
          new THREE.Vector2(0.3, 0.05),
          new THREE.Vector2(-aft.z * 0.55, 0.05),
          0.9,
        );
        const sail = new THREE.Mesh(geo, this.sailMaterial);
        sail.position.set(0, lowY, 0);
        sail.rotation.y = Math.PI / 2;
        sail.castShadow = true;
        pivot.add(sail);
        this.sails.push({ mesh: sail, tier: 0 });
      }
    });

    // bowsprit + jib
    const bowT = 0.985;
    const bowTop = new THREE.Vector3(0, s.top(bowT) - 0.1, s.z(bowT));
    const ang = 0.32;
    const tip = bowTop.clone().add(new THREE.Vector3(0, Math.sin(ang) * c.bowsprit, Math.cos(ang) * c.bowsprit));
    this.woodParts.push(colorize(spar(bowTop.clone().add(new THREE.Vector3(0, -0.1, -1.6)), tip, 0.16, 0.08), woodCol));
    const fore = c.masts[c.masts.length - 1];
    const foreTop = mastTops[mastTops.length - 1];
    this.rope(foreTop, tip);
    this.rope(tip, new THREE.Vector3(0, -0.2, s.z(1) - 0.1)); // bobstay
    if (c.jib) {
      const pivot = new THREE.Group();
      pivot.position.set(0, 0, tip.z);
      this.root.add(pivot);
      this.foreAftPivots.push(pivot);
      const head = new THREE.Vector3(0, s.deckY(fore.t) + fore.height * 0.82, s.z(fore.t) + 0.3);
      const tack = tip.clone().add(new THREE.Vector3(0, 0.15, -0.4));
      const clew = new THREE.Vector3(0, s.top(0.9) + 1.0, s.z(fore.t) + (tip.z - s.z(fore.t)) * 0.32);
      const base = tack;
      // plane: x = aft distance from tip, y = up from tack
      const geo = sailGeometry(
        new THREE.Vector2(tip.z - head.z - 0.2, head.y - base.y),
        new THREE.Vector2(tip.z - head.z, head.y - base.y),
        new THREE.Vector2(0.4, 0.15),
        new THREE.Vector2(tip.z - clew.z, clew.y - base.y),
        0.8,
      );
      const sail = new THREE.Mesh(geo, this.sailMaterial);
      sail.position.set(0, base.y, 0);
      sail.rotation.y = Math.PI / 2;
      sail.castShadow = true;
      pivot.add(sail);
      this.sails.push({ mesh: sail, tier: 0 });
    }
    // stays between mastheads and to the stern
    for (let i = 0; i < mastTops.length - 1; i++) this.rope(mastTops[i], mastTops[i + 1].clone().add(new THREE.Vector3(0, -c.masts[i + 1].height * 0.35, 0)));
    this.rope(mastTops[0], new THREE.Vector3(0, s.top(0.02) + 0.1, s.z(0.02)));

    // pennant on the tallest mast
    this.flagPivot.position.copy(maxMastTop).add(new THREE.Vector3(0, 0.35, 0));
    const flagG = new THREE.PlaneGeometry(1, 1, 16, 1);
    // taper: shrink the fly end
    const fp = flagG.getAttribute('position');
    for (let i = 0; i < fp.count; i++) {
      const x = fp.getX(i) + 0.5;
      const y = fp.getY(i);
      fp.setXYZ(i, x * (2.4 + c.length * 0.06), y * (1 - x * 0.75) * 0.75, 0);
    }
    flagG.computeVertexNormals();
    const flag = new THREE.Mesh(flagG, this.mats.flag);
    flag.rotation.y = 0; // pennant extends along local +x, waving in z
    this.flagPivot.add(flag);
    this.root.add(this.flagPivot);
  }

  private rope(a: THREE.Vector3, b: THREE.Vector3) {
    this.ropes.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }

  // ---------------------------------------------------------------- details

  private buildDetails() {
    const s = this.shape;
    const c = this.cls;
    const barrelCol = hexL(0x8b5a33);
    const hoop = hexL(0x2f2a26);
    const crateCol = hexL(0xb08356);
    const grate = hexL(0x5a3e26);

    const barrelAt = (x: number, z: number) => {
      const t = z / c.length + 0.5;
      const y = s.deckY(t);
      const g = new THREE.CylinderGeometry(0.28, 0.28, 0.72, 10);
      g.translate(x, y + 0.36, z);
      this.woodParts.push(colorize(g, barrelCol));
      for (const hy of [0.12, 0.6]) {
        const h = new THREE.CylinderGeometry(0.295, 0.295, 0.06, 10);
        h.translate(x, y + hy, z);
        this.woodParts.push(colorize(h, hoop));
      }
    };
    const crateAt = (x: number, z: number, sz: number, rot: number) => {
      const t = z / c.length + 0.5;
      const y = s.deckY(t);
      const g = new THREE.BoxGeometry(sz, sz, sz);
      g.rotateY(rot);
      g.translate(x, y + sz / 2, z);
      this.woodParts.push(colorize(g, crateCol));
    };

    // hatch gratings on the main deck
    for (const t of [0.46, 0.6]) {
      if (c.masts.some((m) => Math.abs(m.t - t) < 0.05)) continue;
      const y = s.mainDeckY(t);
      const g = new THREE.BoxGeometry(c.beam * 0.28, 0.12, c.length * 0.07);
      g.translate(0, y + 0.06, s.z(t));
      this.woodParts.push(colorize(g, grate));
    }
    // barrels & crates clustered by the masts
    const B = c.beam;
    c.masts.forEach((m, i) => {
      const z = s.z(m.t);
      barrelAt(B * 0.26, z - 0.9);
      barrelAt(B * 0.3, z - 0.3);
      if (i % 2 === 0) crateAt(-B * 0.26, z - 0.8, 0.6, 0.3);
      else barrelAt(-B * 0.28, z + 0.7);
    });
    crateAt(B * 0.22, s.z(0.86), 0.5, 0.7);

    // ship's wheel near the stern
    const wt = c.sternCastle ? c.sternCastle.t * 0.55 : 0.16;
    const wy = s.deckY(wt);
    const wz = s.z(wt);
    const wheel = new THREE.TorusGeometry(0.42, 0.045, 6, 16);
    wheel.translate(0, wy + 1.05, wz);
    this.woodParts.push(colorize(wheel, barrelCol));
    for (let k = 0; k < 4; k++) {
      const sp = new THREE.CylinderGeometry(0.025, 0.025, 1.0, 5);
      sp.rotateZ((k / 4) * Math.PI);
      sp.translate(0, wy + 1.05, wz);
      this.woodParts.push(colorize(sp, barrelCol));
    }
    const post = new THREE.BoxGeometry(0.16, 1.0, 0.16);
    post.translate(0, wy + 0.5, wz - 0.12);
    this.woodParts.push(colorize(post, grate));

    // capstan
    const capT = 0.53;
    const cap = new THREE.CylinderGeometry(0.32, 0.4, 0.7, 10);
    cap.translate(0, s.mainDeckY(capT) + 0.35, s.z(capT) + (c.masts.some((m) => Math.abs(m.t - capT) < 0.05) ? 1.6 : 0));
    this.woodParts.push(colorize(cap, barrelCol));

    // ship's boat on the galleon
    if (c.id === 'galleon') {
      const boat = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
      boat.scale(0.9, 0.45, 2.1);
      boat.translate(-B * 0.18, s.mainDeckY(0.62) + 0.55, s.z(0.62));
      this.woodParts.push(colorize(boat, hexL(this.livery.strake).multiplyScalar(1.1)));
    }

    // stern lanterns
    const lanterns = c.sternCastle ? [-0.6, 0, 0.6] : [0];
    for (const lx of lanterns) {
      const ty = s.top(0.01);
      const x = lx * s.halfBeam(0.01);
      const pole = new THREE.CylinderGeometry(0.035, 0.035, 0.6, 5);
      pole.translate(x, ty + 0.3, s.z(0.01) - 0.05);
      this.ironParts.push(pole);
      const lamp = new THREE.OctahedronGeometry(0.22, 0);
      lamp.scale(1, 1.4, 1);
      lamp.translate(x, ty + 0.75, s.z(0.01) - 0.05);
      this.glowParts.push(lamp);
      const capg = new THREE.ConeGeometry(0.2, 0.18, 6);
      capg.translate(x, ty + 1.02, s.z(0.01) - 0.05);
      this.ironParts.push(capg);
    }

    // figurehead ornament
    const fh = new THREE.SphereGeometry(0.32, 10, 8);
    fh.scale(0.8, 1, 1.3);
    fh.translate(0, s.top(0.995) - 0.55, s.z(1) + 0.15);
    this.trimParts.push(fh.toNonIndexed().deleteAttribute('uv'));

    // anchors hanging at the bow
    for (const side of [1, -1]) {
      const t = 0.9;
      const y = s.top(t) - 0.8;
      const x = side * (s.halfWidthAtY(t, y) + 0.1);
      const shank = new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6);
      shank.translate(x, y - 0.3, s.z(t));
      this.ironParts.push(shank);
      const fluke = new THREE.TorusGeometry(0.35, 0.05, 5, 10, Math.PI);
      fluke.rotateZ(Math.PI);
      fluke.rotateY(Math.PI / 2);
      fluke.translate(x, y - 0.85, s.z(t));
      this.ironParts.push(fluke);
    }
  }

  // ---------------------------------------------------------------- merge

  private finish() {
    const strip = (g: THREE.BufferGeometry, keepColor: boolean) => {
      let out = g.index ? g.toNonIndexed() : g;
      for (const name of Object.keys(out.attributes)) {
        if (name !== 'position' && name !== 'normal' && !(keepColor && name === 'color')) out.deleteAttribute(name);
      }
      if (!out.getAttribute('normal')) out.computeVertexNormals();
      return out;
    };
    const mk = (parts: THREE.BufferGeometry[], mat: THREE.Material, keepColor: boolean, shadow = true) => {
      if (!parts.length) return;
      const merged = mergeGeometries(parts.map((p) => strip(p, keepColor)));
      if (!merged) return;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      this.root.add(mesh);
    };
    mk(this.woodParts, this.mats.wood, true);
    mk(this.ironParts, this.mats.iron, false);
    mk(this.trimParts, this.mats.trim, false);
    mk(this.glowParts, this.mats.glow, false, false);
    if (this.ropes.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.ropes, 3));
      this.root.add(new THREE.LineSegments(g, this.mats.rope));
    }
    this.root.traverse((o) => {
      o.matrixAutoUpdate = true;
    });
  }

  /** Visual sailing state: furl/brace/billow/flag. */
  updateRig(sailLevel: number, braceAngle: number, leeSide: number, windRelAngle: number, fill: number) {
    for (const s of this.sails) {
      const lvl = clamp(sailLevel * 1.15 - s.tier * 0.12, 0.08, 1);
      s.mesh.scale.y = lvl;
      s.mesh.visible = sailLevel > 0.02 || s.tier === 0;
    }
    for (const p of this.yardPivots) p.rotation.y = braceAngle;
    for (const p of this.foreAftPivots) {
      p.rotation.y = -leeSide * 0.35 * (0.4 + 0.6 * fill);
      for (const ch of p.children) if ((ch as THREE.Mesh).geometry?.getAttribute('aBillow')) ch.scale.z = leeSide;
    }
    this.flagPivot.rotation.y = windRelAngle;
    this.sailUniforms.uSailFill.value = fill * sailLevel;
  }
}
