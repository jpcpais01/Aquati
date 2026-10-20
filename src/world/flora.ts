import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32, Simplex2, smoothstep, lerp } from '../core/noise';

// Procedural tropical flora, built once at load. Everything is a vertex
// coloured triangle soup, so a whole species draws in one instanced call.
//
// The toy-smooth look comes from two tricks: canopies are clusters of lumpy
// puffs whose normals are bent toward the canopy centre, so a tree shades as
// one soft lit volume instead of a pile of balls; and colour carries baked
// light (sunny tops, darker hollows, per-puff hue) so even the cheap far LODs
// read as rounded and alive. Every species has a `lod` 1 build for distant
// islands that keeps the silhouette and palette at a fraction of the cost.

type Geo = THREE.BufferGeometry;
const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _n = new THREE.Vector3();
const _col = new THREE.Color();

/**
 * Bark is flagged by painting it with negative colour: the plant materials
 * built with `bark` (see patchMaterial) read the sign as "this is wood", take
 * the colour's size and carve fissures or ring scars into it up close. Only
 * the island planting asks for it; any other material would draw it black.
 */
const barkSign = (mark: boolean) => (mark ? -1 : 1);

export function lin(hex: number): THREE.Color {
  return new THREE.Color(hex).convertSRGBToLinear();
}

/** Non-indexed, with exactly position / normal / color, ready to merge. */
function finish(g: Geo): Geo {
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  if (!g.getAttribute('color')) paint(g, (_p, _nn, c) => c.setRGB(1, 1, 1));
  return g;
}

export function mergeParts(parts: Geo[]): Geo {
  const m = mergeGeometries(parts.map(finish));
  m.computeBoundingSphere();
  return m;
}

export function paint(geo: Geo, fn: (p: THREE.Vector3, n: THREE.Vector3, out: THREE.Color) => void) {
  const pos = geo.getAttribute('position');
  const nrm = geo.getAttribute('normal');
  const col = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3(0, 1, 0);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    if (nrm) n.fromBufferAttribute(nrm, i);
    fn(p, n, c);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

/** Grows a triangle soup; triangles can be flipped to face the sky so up-bent normals light correctly. */
class Soup {
  pos: number[] = [];
  nrm: number[] = [];
  col: number[] = [];

  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, ca: THREE.Color, cb: THREE.Color, cc: THREE.Color, skyward = false) {
    if (skyward) {
      _a.subVectors(b, a);
      _b.subVectors(c, a);
      if (_a.cross(_b).y < 0) {
        const t = b;
        b = c;
        c = t;
        const tc = cb;
        cb = cc;
        cc = tc;
      }
    }
    _a.subVectors(b, a);
    _b.subVectors(c, a);
    _n.crossVectors(_a, _b).normalize();
    for (const [p, k] of [[a, ca], [b, cb], [c, cc]] as const) {
      this.pos.push(p.x, p.y, p.z);
      this.nrm.push(_n.x, _n.y, _n.z);
      this.col.push(k.r, k.g, k.b);
    }
  }

  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, ca: THREE.Color, cb: THREE.Color, cc: THREE.Color, cd: THREE.Color, skyward = false) {
    this.tri(a, b, c, ca, cb, cc, skyward);
    this.tri(a, c, d, ca, cc, cd, skyward);
  }

  geometry(): Geo {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    return g;
  }
}

/** Bends every normal toward the direction away from `center` (soft, volumetric foliage shading). */
function bendNormals(g: Geo, center: THREE.Vector3, blend: number, upBias = 0) {
  const pos = g.getAttribute('position');
  const nrm = g.getAttribute('normal');
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const r = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nrm, i);
    r.subVectors(p, center).normalize();
    n.lerp(r, blend).addScaledVector(UP, upBias).normalize();
    nrm.setXYZ(i, n.x, n.y, n.z);
  }
}

/** A tube along a polyline: trunks, limbs, stems. Smooth normals. */
function tube(path: THREE.Vector3[], radius: (t: number) => number, radial: number, color: (t: number, a: number, out: THREE.Color) => void): Geo {
  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const axis = _c.subVectors(path[path.length - 1], path[0]).normalize();
  const ref = Math.abs(axis.x) < 0.8 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
  const tan = new THREE.Vector3();
  const u = new THREE.Vector3();
  const w = new THREE.Vector3();
  const d = new THREE.Vector3();
  const n = path.length;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    tan.subVectors(path[Math.min(n - 1, i + 1)], path[Math.max(0, i - 1)]).normalize();
    u.crossVectors(tan, ref).normalize();
    w.crossVectors(tan, u);
    const r = radius(t);
    for (let s = 0; s < radial; s++) {
      const a = (s / radial) * Math.PI * 2;
      d.copy(u).multiplyScalar(Math.cos(a)).addScaledVector(w, Math.sin(a));
      pos.push(path[i].x + d.x * r, path[i].y + d.y * r, path[i].z + d.z * r);
      nrm.push(d.x, d.y, d.z);
      color(t, a, _col);
      col.push(_col.r, _col.g, _col.b);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let s = 0; s < radial; s++) {
      const a = i * radial + s;
      const b = i * radial + ((s + 1) % radial);
      idx.push(a, b, a + radial, b, b + radial, a + radial);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

/** A lumpy, smooth-shaded ball (canopy puff, bush, coconut). */
function puff(r: number, detail: number, seed: number, squash = 1, lump = 0.12): Geo {
  const s = new Simplex2(seed);
  let g: Geo = new THREE.IcosahedronGeometry(r, detail);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g);
  const p = g.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 1 + s.noise(v.x * 1.7 / r + seed, v.y * 1.7 / r + v.z * 1.3 / r) * lump;
    p.setXYZ(i, v.x * k, v.y * k * squash, v.z * k);
  }
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ palms

/** A serrated frond: leaflets hang off a curving spine like the teeth of a comb. */
function sawFrond(
  soup: Soup, origin: THREE.Vector3, dir: THREE.Vector3, L: number, lift: number, droop: number, width: number, segs: number,
  base: THREE.Color, tip: THREE.Color, rnd: () => number, filled = false,
) {
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const spine = (t: number, out: THREE.Vector3) =>
    out.copy(origin).addScaledVector(dir, t * L).addScaledVector(UP, Math.sin(t * Math.PI * 0.55) * lift - t * t * droop);
  const w = (t: number) => width * Math.pow(Math.sin(Math.min(1, t * 1.08) * Math.PI), 0.6) + 0.03;
  const s0 = new THREE.Vector3();
  const s1 = new THREE.Vector3();
  const sm = new THREE.Vector3();
  const e0 = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const tip3 = new THREE.Vector3();
  const c0 = new THREE.Color();
  const c1 = new THREE.Color();
  const ce = new THREE.Color();
  for (let s = 0; s < segs; s++) {
    const t0 = s / segs;
    const t1 = (s + 1) / segs;
    spine(t0, s0);
    spine(t1, s1);
    c0.copy(base).lerp(tip, t0 * 0.9);
    c1.copy(base).lerp(tip, t1 * 0.9);
    for (const sg of [-1, 1]) {
      if (filled) {
        const wa = w(t0);
        const wb = w(t1);
        e0.copy(s0).addScaledVector(side, wa * sg).addScaledVector(UP, -wa * 0.32);
        e1.copy(s1).addScaledVector(side, wb * sg).addScaledVector(UP, -wb * 0.32);
        ce.copy(c1).multiplyScalar(0.84);
        soup.quad(s0, s1, e1, e0, c0, c1, ce, ce, true);
      } else {
        const tm = (s + 0.75) / segs;
        const wm = w(tm) * (0.9 + rnd() * 0.2);
        spine(tm, sm);
        tip3.copy(sm).addScaledVector(side, wm * sg).addScaledVector(dir, wm * 0.32).addScaledVector(UP, -wm * 0.42);
        ce.copy(base).lerp(tip, Math.min(1, tm * 0.9 + 0.15)).multiplyScalar(0.9);
        soup.tri(s0, s1, tip3, c0, c1, ce, true);
      }
    }
  }
}

/**
 * Coconut palm: a ringed, gently S-curved trunk with a flared foot, a crown
 * of comb-toothed fronds (young ones bright and upright, old ones dark and
 * drooping, now and then a dried one hanging) and a cluster of nuts.
 */
export function palmGeometry(height: number, lean: number, seed: number, lod = 0, shadow = false, mark = false): Geo {
  const rnd = mulberry32(seed);
  const sg = barkSign(mark);
  const parts: Geo[] = [];
  const sway = (rnd() - 0.5) * 0.9;
  const curve = (t: number) => new THREE.Vector3(lean * t * t, height * t, sway * Math.sin(t * Math.PI) * 0.5);
  // the shadow caster keeps every frond (they draw the shadow) on a plain trunk
  const rings = lod ? 5 : shadow ? 6 : 18;
  const path: THREE.Vector3[] = [];
  for (let i = 0; i <= rings; i++) path.push(curve(i / rings));
  const trunkLight = lin(0x9c7c58);
  const trunkDark = lin(0x5a4330);
  const foot = lin(0x6e6050);
  parts.push(
    tube(
      path,
      (t) => 0.34 * (1 - t * 0.42) * (1 + 0.6 * Math.pow(1 - t, 9)) * (lod || shadow ? 1 : 1 + 0.06 * Math.cos(t * rings * Math.PI)),
      lod || shadow ? 5 : 8,
      (t, _a2, out) => {
        const band = lod ? 1 : Math.cos(t * rings * Math.PI) > 0 ? 1 : 0.8;
        out.copy(trunkDark).lerp(trunkLight, (0.3 + t * 0.7) * band);
        out.lerp(foot, Math.pow(1 - t, 12) * 0.6).multiplyScalar(sg);
      },
    ),
  );

  // crown
  const top = curve(1);
  const soup = new Soup();
  const fronds = lod ? 7 : 11;
  const young = [lin(0x7ec443), lin(0xc4e070)];
  const mature = [lin(0x2c7330), lin(0x6db446)];
  const dried = [lin(0x8f7a3c), lin(0xc9ad62)];
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * Math.PI * 2 + rnd() * 0.5;
    const age = (f * 0.618 + rnd() * 0.4) % 1;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const dead = !lod && age > 0.9 && rnd() < 0.55;
    const pal = dead ? dried : age < 0.3 ? young : mature;
    const base = pal[0].clone().lerp(mature[0], age < 0.3 ? 0.3 : 0);
    const L = (dead ? 3.0 : 3.6 + rnd() * 1.1) * (age < 0.3 ? 0.88 : 1);
    const lift = dead ? -0.6 : lerp(1.7, 0.3, age);
    const droop = dead ? 3.4 : lerp(1.4, 3.2, age);
    const o = top.clone().addScaledVector(UP, 0.15 - age * 0.25);
    sawFrond(soup, o, dir, L, lift, droop, dead ? 0.6 : 0.95, lod ? 4 : 11, base, pal[1], rnd, !!lod);
  }
  const crown = soup.geometry();
  // shade the crown as one soft dome
  bendNormals(crown, top.clone().addScaledVector(UP, -1.4), 0.6, 0.35);
  parts.push(crown);

  if (!lod && !shadow) {
    const nutA = lin(0x4f6a22);
    const nutB = lin(0x7a5428);
    const n = 3 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const g = puff(0.24 + rnd() * 0.05, 1, seed + i, 1.1, 0.04);
      const a = (i / n) * Math.PI * 2 + rnd();
      g.translate(top.x + Math.cos(a) * 0.3, top.y - 0.28 - rnd() * 0.15, top.z + Math.sin(a) * 0.3);
      const c = rnd() < 0.6 ? nutA : nutB;
      paint(g, (_p, nn, out) => out.copy(c).multiplyScalar(0.75 + Math.max(nn.y, 0) * 0.4));
      parts.push(g);
    }
  }
  return mergeParts(parts);
}

// ------------------------------------------------------------------ broadleaf trees

export type TreeStyle = 'round' | 'flame' | 'blossom' | 'tall';

interface PuffSpec {
  x: number;
  y: number;
  z: number;
  r: number;
  sq: number;
}

/**
 * Broadleaf trees in four characters: a rounded rain-tree, the scarlet
 * umbrella of a flame tree, a lilac/pink blossom tree and a tall two-tiered
 * jungle emergent. Visible limbs fork from the trunk into the canopy puffs.
 */
export function broadleafGeometry(seed: number, style: TreeStyle, lod = 0, shadow = false, mark = false): Geo {
  const rnd = mulberry32(seed * 31 + 7);
  const s = new Simplex2(seed + 3);
  const parts: Geo[] = [];
  const H = style === 'tall' ? 6.4 : style === 'flame' ? 2.9 : 3.3;
  const puffs: PuffSpec[] = [];
  const P = (x: number, y: number, z: number, r: number, sq = 0.85) => puffs.push({ x, y, z, r, sq });
  if (style === 'flame') {
    const n = lod ? 4 : 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.4;
      P(Math.cos(a) * 2.5, H + 1.0 + rnd() * 0.3, Math.sin(a) * 2.5, (lod ? 1.9 : 1.45) + rnd() * 0.3, 0.55);
    }
    P(0, H + 1.45, 0, 2.2, 0.5);
    if (!lod) for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      P(Math.cos(a) * 1.2, H + 1.75, Math.sin(a) * 1.2, 1.3, 0.6);
    }
  } else if (style === 'tall') {
    if (!lod) for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + rnd() * 0.5;
      P(Math.cos(a) * 2.0, H - 0.7 + rnd() * 0.4, Math.sin(a) * 2.0, 1.2 + rnd() * 0.3);
    }
    P(0, H + 1.1, 0, lod ? 2.5 : 1.9);
    if (!lod) {
      P(0.9, H + 2.3, -0.4, 1.3);
      P(-1.1, H + 1.6, 0.8, 1.35);
    } else P(0, H - 0.4, 0, 2.3, 0.6);
  } else {
    const big = style === 'blossom' ? 1.75 : 2.05;
    P(0, H + 1.3, 0, lod ? big * 1.2 : big);
    const n = lod ? 1 : style === 'blossom' ? 6 : 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.6;
      const rr = lod ? 1.2 : 1.55 + rnd() * 0.25;
      P(Math.cos(a) * rr, H + 0.6 + rnd() * 0.8, Math.sin(a) * rr, (lod ? 1.7 : 1.25) + rnd() * 0.45);
    }
    if (!lod) P((rnd() - 0.5) * 0.8, H + 2.55, (rnd() - 0.5) * 0.8, 1.3);
  }

  // trunk + limbs
  const barkDark = lin(0x4a3627);
  const barkLight = lin(0x7d6047);
  const sg = barkSign(mark);
  const bark = (t: number, a: number, out: THREE.Color) => out.copy(barkDark).lerp(barkLight, 0.35 + t * 0.5 + Math.sin(a * 3) * 0.08).multiplyScalar(sg);
  const trunkTop = new THREE.Vector3((rnd() - 0.5) * 0.4, H + 0.3, (rnd() - 0.5) * 0.4);
  const tr = style === 'tall' ? 0.42 : 0.34;
  const tp: THREE.Vector3[] = [];
  const tn = lod || shadow ? 2 : 5;
  for (let i = 0; i <= tn; i++) {
    const t = i / tn;
    tp.push(new THREE.Vector3(trunkTop.x * t * t, H * 0.92 * t, trunkTop.z * t * t));
  }
  parts.push(tube(tp, (t) => tr * (1 - t * 0.45) * (1 + 0.7 * Math.pow(1 - t, 7)), lod || shadow ? 5 : 7, bark));
  if (!lod && !shadow) {
    // limbs fork out to the outer puffs (only the ones you can glimpse)
    const limbs = puffs.filter((p) => Math.hypot(p.x, p.z) > 0.8).slice(0, style === 'flame' ? 5 : 3);
    for (const p of limbs) {
      const from = new THREE.Vector3(0, H * (style === 'flame' ? 0.75 : 0.62), 0);
      const to = new THREE.Vector3(p.x * 0.75, p.y - p.r * 0.35, p.z * 0.75);
      const mid = from.clone().lerp(to, 0.5).addScaledVector(UP, 0.25);
      parts.push(tube([from, mid, to], (t) => lerp(tr * 0.55, 0.07, t), 5, bark));
    }
  }

  // canopy
  const canopyParts: Geo[] = [];
  let cy = 0;
  let R = 0;
  puffs.forEach((p, i) => {
    // hi canopies are finely tessellated so the crowns stay round and smooth up
    // close; the shadow caster keeps every puff, just more coarsely cut
    const g = puff(p.r, lod || shadow ? 1 : 2, seed * 13 + i, p.sq);
    g.translate(p.x, p.y, p.z);
    canopyParts.push(finish(g));
    cy += p.y;
  });
  cy /= puffs.length;
  for (const p of puffs) R = Math.max(R, Math.hypot(p.x, p.y - cy, p.z) + p.r);
  const canopy = mergeGeometries(canopyParts);
  const center = new THREE.Vector3(0, cy - (style === 'flame' ? 0.6 : 0.2), 0);
  bendNormals(canopy, center, 0.62, 0.1);

  const pal = {
    dark: lin(style === 'tall' ? 0x234f2b : 0x28552a),
    mid: lin(style === 'tall' ? 0x3b7a3a : 0x46843a),
    light: lin(style === 'tall' ? 0x86b85a : 0x9cc860),
  };
  const pinkish = seed % 2 === 0;
  const bloomA = style === 'flame' ? lin(0xc9261a) : pinkish ? lin(0xe07ab4) : lin(0xc07ed6);
  const bloomB = style === 'flame' ? lin(0xff7a2a) : pinkish ? lin(0xffc6de) : lin(0xf2d2f2);
  const hue = new THREE.Color();
  const fine = new Simplex2(seed + 99);
  paint(canopy, (p, n, out) => {
    const ao = smoothstep(0.25, 1.0, _a.set(p.x, p.y - center.y, p.z).length() / R);
    const top = smoothstep(-0.1, 0.95, n.y);
    out.copy(pal.dark).lerp(pal.mid, ao);
    out.lerp(pal.light, top * ao * 0.75);
    const sp = s.noise(p.x * 1.3 + p.y * 0.7, p.z * 1.3 - p.y * 0.5);
    hue.setRGB(1 + sp * 0.06, 1 + sp * 0.04, 1 - sp * 0.08);
    out.multiply(hue);
    // leaf clusters: sunlit sprays and shadowy pockets across each puff
    const lc = fine.noise(p.x * 2.4 - p.y * 0.8, p.z * 2.4 + p.y * 1.2);
    out.multiplyScalar(0.9 + smoothstep(-0.4, 0.6, lc) * 0.2 * (0.5 + top * 0.5));
    if (style === 'flame' || style === 'blossom') {
      // a crown smothered in florets, the odd fleck of leaf showing through
      // and green underneath where the sun never reaches
      const fl = fine.noise(p.x * 3.2 + p.y * 1.1, p.z * 3.2 - p.y * 0.9);
      const bloom = smoothstep(-0.8, -0.3, n.y + sp * 0.2) * smoothstep(-0.62, -0.38, fl) * (0.7 + ao * 0.3);
      const b = _col.copy(bloomA).lerp(bloomB, smoothstep(0.3, 1.0, top * ao + sp * 0.3));
      out.lerp(b.multiplyScalar(0.7 + ao * 0.4), bloom);
    }
  });
  parts.push(canopy);
  return mergeParts(parts);
}

// ------------------------------------------------------------------ tree fern

/**
 * Tree fern, the emblem of a tropical cloud forest: a slender, shaggy trunk
 * scarred by old frond bases, under a parasol of long lacy fronds (bright
 * young ones arching up, old ones sagging), a skirt of dead fronds hanging
 * against the trunk and a knot of curled fiddleheads at the heart.
 */
export function treeFernGeometry(seed: number, lod = 0, mark = false): Geo {
  const rnd = mulberry32(seed * 23 + 11);
  const sg = barkSign(mark);
  const H = 3.8 + rnd() * 1.8;
  const lean = (rnd() - 0.5) * 0.7;
  const wob = (rnd() - 0.5) * 0.5;
  const curve = (t: number) => new THREE.Vector3(lean * t * t, H * t, wob * Math.sin(t * Math.PI));
  const parts: Geo[] = [];
  const rings = lod ? 3 : 10;
  const path: THREE.Vector3[] = [];
  for (let i = 0; i <= rings; i++) path.push(curve(i / rings));
  const fibre = lin(0x3a2a20);
  const scar = lin(0x6a5238);
  parts.push(
    tube(
      path,
      // a flared, rooty foot and a crown a touch thicker than the waist
      (t) => 0.19 * (1 + 0.9 * Math.pow(1 - t, 7) + 0.25 * t * t) * (lod ? 1 : 1 + 0.07 * Math.cos(t * rings * 2 * Math.PI)),
      lod ? 4 : 7,
      (t, a, out) => {
        out.copy(fibre).lerp(scar, lod ? 0.3 : (0.5 + 0.5 * Math.cos(t * rings * 2 * Math.PI + a * 2)) * 0.45 + t * 0.2).multiplyScalar(sg);
      },
    ),
  );
  const top = curve(1);
  const soup = new Soup();
  const fronds = lod ? 7 : 13;
  const young = [lin(0x5d9a34), lin(0xb6dc6a)];
  const mature = [lin(0x24582a), lin(0x6aa846)];
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * Math.PI * 2 + rnd() * 0.4;
    const age = (f * 0.618 + rnd() * 0.3) % 1;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const pal = age < 0.3 ? young : mature;
    const L = (2.7 + rnd() * 0.9) * (age < 0.3 ? 0.85 : 1);
    sawFrond(soup, top.clone().addScaledVector(UP, 0.12 - age * 0.15), dir, L, lerp(1.25, 0.35, age), lerp(0.9, 2.3, age), 0.62, lod ? 4 : 13, pal[0], pal[1], rnd, !!lod);
  }
  if (!lod) {
    // the skirt: dead fronds hanging down against the trunk
    const dead = [lin(0x5a4026), lin(0x9a7a48)];
    const n = 4 + Math.floor(rnd() * 3);
    for (let f = 0; f < n; f++) {
      const a = (f / n) * Math.PI * 2 + rnd();
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      sawFrond(soup, top.clone().addScaledVector(UP, -0.15), dir, 1.5 + rnd() * 0.5, -0.1, 2.0, 0.38, 6, dead[0], dead[1], rnd);
    }
  }
  const crown = soup.geometry();
  bendNormals(crown, top.clone().addScaledVector(UP, -1.1), 0.55, 0.35);
  parts.push(crown);
  if (!lod) {
    // fiddleheads, tightly curled, at the heart of the crown
    const fid = lin(0x9cc456);
    for (let i = 0; i < 3; i++) {
      const g = puff(0.13, 1, seed * 5 + i, 1.2, 0.1);
      const a = (i / 3) * Math.PI * 2 + rnd();
      g.translate(top.x + Math.cos(a) * 0.14, top.y + 0.32 + rnd() * 0.12, top.z + Math.sin(a) * 0.14);
      paint(g, (_p, nn, out) => out.copy(fid).multiplyScalar(0.75 + Math.max(nn.y, 0) * 0.4));
      parts.push(g);
    }
  }
  return mergeParts(parts);
}

// ------------------------------------------------------------------ understory

/** Banana plant: a soft pseudostem under big arching paddle leaves. */
export function bananaGeometry(seed: number, lod = 0): Geo {
  const rnd = mulberry32(seed * 7 + 1);
  const parts: Geo[] = [];
  const stemH = 1.5 + rnd() * 0.4;
  const sB = lin(0x6c6a35);
  const sT = lin(0x8db352);
  parts.push(
    tube([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.05, stemH * 0.5, 0), new THREE.Vector3(0.1, stemH, 0)], (t) => lerp(0.17, 0.11, t), lod ? 4 : 6, (t, _a2, o) => o.copy(sB).lerp(sT, t)),
  );
  const soup = new Soup();
  const top = new THREE.Vector3(0.1, stemH, 0);
  const n = lod ? 4 : 7;
  const rib = lin(0xb8d870);
  const blade = lin(0x5fae38);
  const edge = lin(0x8ccf4c);
  const torn = lin(0xa0904a);
  const s0 = new THREE.Vector3();
  const s1 = new THREE.Vector3();
  const e0 = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.5;
    const age = rnd();
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const L = 1.9 + rnd() * 0.7;
    const lift = lerp(1.3, 0.5, age);
    const droop = lerp(0.6, 2.0, age);
    const segs = lod ? 3 : 6;
    const spine = (t: number, o: THREE.Vector3) => o.copy(top).addScaledVector(dir, t * L).addScaledVector(UP, Math.sin(t * Math.PI * 0.6) * lift - t * t * droop + 0.2);
    const w = (t: number) => 0.44 * Math.pow(Math.sin(Math.min(1, t * 1.02) * Math.PI), 0.7) * (t < 0.12 ? t / 0.12 : 1) + 0.01;
    const old = age > 0.7;
    for (let s = 0; s < segs; s++) {
      const t0 = s / segs;
      const t1 = (s + 1) / segs;
      spine(t0, s0);
      spine(t1, s1);
      for (const sg of [-1, 1]) {
        const wa = w(t0);
        const wb = w(t1);
        e0.copy(s0).addScaledVector(side, wa * sg).addScaledVector(UP, -wa * 0.25);
        e1.copy(s1).addScaledVector(side, wb * sg).addScaledVector(UP, -wb * 0.25);
        const ec = old && sg > 0 && t1 > 0.5 ? torn : edge;
        soup.quad(s0, s1, e1, e0, rib, rib, ec, blade, true);
      }
    }
  }
  const leaves = soup.geometry();
  bendNormals(leaves, top.clone().addScaledVector(UP, -0.8), 0.35, 0.4);
  parts.push(leaves);
  return mergeParts(parts);
}

/** A rosette of arching, toothed fern fronds for the forest floor. */
export function fernGeometry(seed: number): Geo {
  const rnd = mulberry32(seed * 11 + 3);
  const soup = new Soup();
  const n = 8;
  const base = lin(0x24602a);
  const tip = lin(0x74b648);
  const o = new THREE.Vector3(0, 0.05, 0);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.5;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    sawFrond(soup, o, dir, 0.95 + rnd() * 0.45, 0.7 + rnd() * 0.3, 0.6 + rnd() * 0.3, 0.26, 7, base, tip, rnd);
  }
  const g = soup.geometry();
  bendNormals(g, new THREE.Vector3(0, -0.6, 0), 0.4, 0.5);
  g.computeBoundingSphere();
  return g;
}

/** A rounded shrub of two or three puffs. Palettes: leafy green, or variegated croton. */
export function bushGeometry(seed: number, kind: 'green' | 'croton' | 'dark' = 'green', lod = 0): Geo {
  const rnd = mulberry32(seed * 5 + 9);
  const s = new Simplex2(seed);
  const parts: Geo[] = [];
  const n = lod ? 1 : 3;
  for (let i = 0; i < n; i++) {
    const r = i === 0 ? 1 : 0.6 + rnd() * 0.2;
    const g = puff(r, 1, seed * 3 + i, 0.75, 0.14);
    const a = rnd() * Math.PI * 2;
    g.translate(i === 0 ? 0 : Math.cos(a) * 0.75, i === 0 ? 0.45 : 0.32, i === 0 ? 0 : Math.sin(a) * 0.75);
    parts.push(finish(g));
  }
  const g = mergeGeometries(parts);
  bendNormals(g, new THREE.Vector3(0, -0.1, 0), 0.5, 0.1);
  const dark = lin(kind === 'dark' ? 0x1e4f2a : 0x2a6229);
  const light = lin(kind === 'dark' ? 0x4f8f45 : 0x7fbf4c);
  const cA = lin(0xe8c23a);
  const cB = lin(0xcf4a2a);
  paint(g, (p, nn, out) => {
    const ao = smoothstep(-0.1, 1.1, p.y);
    out.copy(dark).lerp(light, ao * smoothstep(-0.3, 1, nn.y));
    if (kind === 'croton') {
      const v = s.noise(p.x * 3.1 + p.y, p.z * 3.1 - p.y);
      out.lerp(cA, smoothstep(0.1, 0.4, v) * 0.8);
      out.lerp(cB, smoothstep(0.35, 0.6, -v) * 0.75);
    }
  });
  g.computeBoundingSphere();
  return g;
}

/** A flat flower facing `dir`: notched petals around a contrasting heart. */
function blossom(soup: Soup, c: THREE.Vector3, dir: THREE.Vector3, r: number, petals: number, petal: THREE.Color, heart: THREE.Color, cup = 0.18) {
  const ref = Math.abs(dir.y) < 0.9 ? UP : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(dir, ref).normalize();
  const w = new THREE.Vector3().crossVectors(dir, u);
  const rim: THREE.Vector3[] = [];
  const rc: THREE.Color[] = [];
  const notchC = petal.clone().lerp(heart, 0.25);
  for (let p = 0; p < petals; p++) {
    const a0 = (p / petals) * Math.PI * 2;
    const span = (Math.PI * 2) / petals;
    for (const [f, rr, isN] of [[0, 0.4, true], [0.28, 1, false], [0.72, 1, false]] as const) {
      const a = a0 + span * f;
      rim.push(c.clone().addScaledVector(u, Math.cos(a) * r * rr).addScaledVector(w, Math.sin(a) * r * rr).addScaledVector(dir, r * cup * rr));
      rc.push(isN ? notchC : petal);
    }
  }
  for (let k = 0; k < rim.length; k++) {
    const k2 = (k + 1) % rim.length;
    soup.tri(c, rim[k], rim[k2], heart, rc[k], rc[k2]);
  }
}

/** Flowering shrub (hibiscus): a leafy bush studded with big five-petal blooms. */
export function flowerBushGeometry(seed: number, bloom: number, heart: number, lod = 0): Geo {
  const rnd = mulberry32(seed * 3 + 1);
  const bush = bushGeometry(seed + 40, 'green', lod);
  if (lod) {
    // far away the blooms are just warm dabs on the crown
    const b = lin(bloom);
    const s = new Simplex2(seed);
    const col = bush.getAttribute('color');
    const pos = bush.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const v = s.noise(pos.getX(i) * 2.4, pos.getZ(i) * 2.4 + pos.getY(i));
      const k = smoothstep(0.1, 0.5, v) * smoothstep(0.2, 0.8, pos.getY(i));
      col.setXYZ(i, lerp(col.getX(i), b.r, k), lerp(col.getY(i), b.g, k), lerp(col.getZ(i), b.b, k));
    }
    return bush;
  }
  const soup = new Soup();
  const pc = lin(bloom);
  const hc = lin(heart);
  const v = new THREE.Vector3();
  const d = new THREE.Vector3();
  for (let i = 0; i < 13; i++) {
    const a = rnd() * Math.PI * 2;
    const el = 0.2 + rnd() * 1.15;
    d.set(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el));
    v.set(d.x * 1.02, 0.45 + d.y * 0.78, d.z * 1.02);
    d.y += 0.5;
    d.normalize();
    blossom(soup, v, d, 0.19 + rnd() * 0.06, 5, pc.clone().multiplyScalar(0.9 + rnd() * 0.15), hc);
  }
  const fl = soup.geometry();
  bendNormals(fl, new THREE.Vector3(0, 0, 0), 0.3, 0.6);
  return mergeParts([bush, fl]);
}

/** A clump of wildflowers on thin stems; `petals` lists the colours mixed in it. */
export function wildflowerGeometry(seed: number, petals: number[], heart: number, count = 7, petalsPer = 5): Geo {
  const rnd = mulberry32(seed * 19 + 2);
  const soup = new Soup();
  const stem = lin(0x3f7a2c);
  const leaf = lin(0x5a9a3a);
  const hc = lin(heart);
  const pcs = petals.map(lin);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const d = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const ang = rnd() * Math.PI * 2;
    const rr = Math.sqrt(rnd()) * 0.32;
    const x = Math.cos(ang) * rr;
    const z = Math.sin(ang) * rr;
    const h = 0.25 + rnd() * 0.45;
    const tx = x + (rnd() - 0.5) * 0.12;
    const tz = z + (rnd() - 0.5) * 0.12;
    // a thin stem ribbon, and a leaf at its foot
    const sw = 0.018;
    a.set(x - sw, 0, z);
    b.set(x + sw, 0, z);
    c.set(tx + sw * 0.6, h, tz);
    d.set(tx - sw * 0.6, h, tz);
    soup.quad(a, b, c, d, stem, stem, stem, stem);
    const la = ang + 1.3;
    a.set(x, 0, z);
    b.set(x + Math.cos(la) * 0.16 + 0.03, 0.12, z + Math.sin(la) * 0.16);
    c.set(x + Math.cos(la) * 0.2, 0.07, z + Math.sin(la) * 0.2 + 0.04);
    soup.tri(a, b, c, stem, leaf, leaf, true);
    const dir = new THREE.Vector3((rnd() - 0.5) * 0.7, 1, (rnd() - 0.5) * 0.7).normalize();
    const pc = pcs[Math.floor(rnd() * pcs.length)].clone().multiplyScalar(0.9 + rnd() * 0.2);
    blossom(soup, new THREE.Vector3(tx, h, tz), dir, 0.12 + rnd() * 0.06, petalsPer, pc, hc, 0.12);
  }
  const g = soup.geometry();
  bendNormals(g, new THREE.Vector3(0, -0.4, 0), 0.25, 0.8);
  g.computeBoundingSphere();
  return g;
}

/** A clump of tapered grass blades that bend outward; tips catch the light. */
export function tuftGeometry(seed: number, blades: number, o: { h?: number; bend?: number; w?: number; base?: number; tip?: number } = {}): Geo {
  const rnd = mulberry32(seed);
  const pos: number[] = [];
  const col: number[] = [];
  const base = lin(o.base ?? 0x2f6b2a);
  const tip = lin(o.tip ?? 0xa6d860);
  const H = o.h ?? 0.45;
  const B = o.bend ?? 0.18;
  const W = o.w ?? 0.05;
  const c = new THREE.Color();
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + rnd() * 0.8;
    const r0 = rnd() * 0.12;
    const bx = Math.cos(a) * r0;
    const bz = Math.sin(a) * r0;
    const hgt = H + rnd() * H * 0.9;
    const bend = B + rnd() * B * 1.4;
    const w = W + rnd() * W * 0.6;
    const sx = -Math.sin(a) * w;
    const sz = Math.cos(a) * w;
    const mx = bx + Math.cos(a) * bend * 0.4;
    const mz = bz + Math.sin(a) * bend * 0.4;
    const tx = bx + Math.cos(a) * bend;
    const tz = bz + Math.sin(a) * bend;
    const tint = rnd() * 0.3;
    const pts = [
      [bx - sx, 0, bz - sz, 0], [bx + sx, 0, bz + sz, 0], [mx + sx * 0.7, hgt * 0.55, mz + sz * 0.7, 0.55],
      [bx - sx, 0, bz - sz, 0], [mx + sx * 0.7, hgt * 0.55, mz + sz * 0.7, 0.55], [mx - sx * 0.7, hgt * 0.55, mz - sz * 0.7, 0.55],
      [mx - sx * 0.7, hgt * 0.55, mz - sz * 0.7, 0.55], [mx + sx * 0.7, hgt * 0.55, mz + sz * 0.7, 0.55], [tx, hgt, tz, 1],
    ];
    for (const [x, y, z, t] of pts) {
      pos.push(x, y, z);
      c.copy(base).lerp(tip, Math.min(1, t * 0.9 + tint));
      col.push(c.r, c.g, c.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  // blades read best lit like the ground beneath them
  const n = g.getAttribute('normal');
  for (let i = 0; i < n.count; i++) {
    const ny = Math.abs(n.getY(i));
    n.setXYZ(i, n.getX(i) * 0.35, 0.8 + ny * 0.2, n.getZ(i) * 0.35);
  }
  g.normalizeNormals();
  g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------------------ stone & shore

export function rockGeometry(seed: number, mossy = false, detail = 2): Geo {
  const s = new Simplex2(seed);
  let g: Geo = new THREE.IcosahedronGeometry(1, detail);
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
  const a = lin(0x6f6a62);
  const b = lin(0xa7a097);
  const moss = lin(0x5f9a3e);
  paint(g, (pp, nn, c) => {
    c.copy(a).lerp(b, smoothstep(-0.6, 0.8, pp.y));
    if (mossy) {
      // a soft cap of moss on the sun-facing top
      const m = smoothstep(0.45, 0.8, nn.y + s.noise(pp.x * 2.2, pp.z * 2.2) * 0.25) * smoothstep(0.0, 0.35, pp.y);
      c.lerp(moss, m * 0.85);
    }
  });
  return g;
}

/** Five-armed sea star, slightly domed. */
export function starfishGeometry(): Geo {
  const pos: number[] = [];
  const arms = 5;
  const R = 0.32;
  const r = 0.11;
  const ring: [number, number][] = [];
  for (let i = 0; i < arms * 2; i++) {
    const a = (i / (arms * 2)) * Math.PI * 2;
    const rad = i % 2 === 0 ? R : r;
    ring.push([Math.cos(a) * rad, Math.sin(a) * rad]);
  }
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[(i + 1) % ring.length];
    pos.push(0, 0.07, 0, bx, 0.01, bz, ax, 0.01, az);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const orange = lin(0xff8a4a);
  const tip = lin(0xffc07a);
  paint(g, (p, _nn, c) => c.copy(orange).lerp(tip, smoothstep(0.12, 0.3, Math.hypot(p.x, p.z))));
  return g;
}

/** A ribbed scallop shell lying open on the sand. */
export function shellGeometry(seed: number): Geo {
  const rnd = mulberry32(seed);
  const soup = new Soup();
  const ribs = 9;
  const R = 0.17;
  const cA = lin(rnd() < 0.5 ? 0xf6e4cf : 0xf8d2c2);
  const cB = lin(rnd() < 0.5 ? 0xe9a68e : 0xd9b48a);
  const hinge = new THREE.Vector3(0, 0.01, -R * 0.4);
  const p0 = new THREE.Vector3();
  const p1 = new THREE.Vector3();
  for (let i = 0; i < ribs; i++) {
    const a0 = -1.25 + (i / ribs) * 2.5;
    const a1 = -1.25 + ((i + 1) / ribs) * 2.5;
    const dome = (a: number) => 0.05 * Math.cos(a * 0.9);
    p0.set(Math.sin(a0) * R, 0.01 + dome(a0), hinge.z + Math.cos(a0) * R);
    p1.set(Math.sin(a1) * R, 0.01 + dome(a1), hinge.z + Math.cos(a1) * R);
    const k = i % 2 ? cA : cB;
    soup.tri(hinge, p0, p1, cA, k, k, true);
  }
  const g = soup.geometry();
  bendNormals(g, new THREE.Vector3(0, -0.3, 0), 0.5, 0.3);
  return g;
}

/** Two or three fallen coconuts. */
export function coconutsGeometry(seed: number): Geo {
  const rnd = mulberry32(seed);
  const parts: Geo[] = [];
  const n = 2 + Math.floor(rnd() * 2);
  const A = lin(0x6b4a26);
  const B = lin(0x5b6e2a);
  for (let i = 0; i < n; i++) {
    const g = puff(0.2, 1, seed + i * 5, 0.85, 0.05);
    g.translate((rnd() - 0.5) * 0.9, 0.15, (rnd() - 0.5) * 0.9);
    const c = rnd() < 0.7 ? A : B;
    paint(g, (_p, nn, o) => o.copy(c).multiplyScalar(0.7 + Math.max(nn.y, 0) * 0.45));
    parts.push(g);
  }
  return mergeParts(parts);
}

/** A sun-bleached, gently bent driftwood log with a stub branch. */
export function driftwoodGeometry(seed: number): Geo {
  const rnd = mulberry32(seed);
  const log = new THREE.CylinderGeometry(0.16, 0.22, 3.4, 6, 4);
  log.deleteAttribute('uv');
  log.rotateZ(Math.PI / 2);
  const p = log.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    p.setY(i, p.getY(i) + Math.sin(x * 0.9 + seed) * 0.12);
    p.setZ(i, p.getZ(i) + Math.sin(x * 0.6) * 0.18);
  }
  log.translate(0, 0.16, 0);
  const branch = new THREE.CylinderGeometry(0.05, 0.09, 0.9, 5, 1);
  branch.deleteAttribute('uv');
  branch.rotateZ(-0.9 - rnd() * 0.4);
  branch.rotateY(0.6);
  branch.translate(0.6, 0.38, 0.12);
  const parts = [log, branch].map((g) => {
    g.computeVertexNormals();
    return g.toNonIndexed();
  });
  const merged = mergeGeometries(parts);
  const a = lin(0x9c8c78);
  const b = lin(0xd8cdbb);
  paint(merged, (pp, _nn, c) => c.copy(a).lerp(b, smoothstep(0.05, 0.36, pp.y)));
  merged.computeBoundingSphere();
  return merged;
}
