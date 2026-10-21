import * as THREE from 'three';
import { lerp } from '../core/noise';
import { ball, colorize, hexL, lathe, spar, spiral, sweep } from './geo';
import { GLOW, merged, METAL, type PartKit, type Spinner } from './partModels';
import type { Part } from './parts';
import type { HullShape } from './shipModel';
import type { ShipClass } from './shipTypes';

// Figureheads and the carved head they ride on. Every hull grows a knee of
// the head: a deep, rounded timber bracket run out forward of the stem under
// the bowsprit, gilt-edged and carved with trailboards, and the figure sits
// on its tip, big enough to read from the helm view: about a fifth of the
// ship's length, leaning out over the cutwater as far as the bowsprit lets it.
//
// Figures are sculpted in their own frame: upright, facing +z, the knee and
// stem behind them (-z, -y), about 1.3 units tall from tail to crown, then
// placed by bowHead(). Heads are levelled with face() so they look ahead, not
// down at the sea. Everything goes into the ship's merged buckets (gilt,
// metal, wood and glow), so a figure costs triangles but no draw calls, no
// new materials and no new shaders.

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const Y = V(0, 1, 0);
const Z = V(0, 0, 1);

/** The bowsprit's rake (see ShipModel.buildRig). */
const SPRIT_ANGLE = 0.32;

export interface BowHead {
  /** The tip of the knee, where the figure's hips sit (hull-root space). */
  at: THREE.Vector3;
  /** Figure units to metres. */
  scale: number;
  /** How far the figure leans out from upright, radians. */
  lean: number;
  place: THREE.Matrix4;
  /** The middle of the figure, for cameras. */
  centre: THREE.Vector3;
  /** The figure's frame point (frame y up, frame z forward) in hull-root space. */
  P: (fy: number, fz: number, fx?: number) => THREE.Vector3;
  /** Front face of the stem post. */
  stem: number;
  /** Where the knee's lower edge meets the stem. */
  yLow: number;
  /** On the knee's cutwater, under the figure: where the bobstay is set up. */
  foot: THREE.Vector3;
}

/**
 * Where the figure goes on a hull, and how big: hips just under the rail line
 * on a knee run out ahead of the stem, leaning forward only as far as it must
 * to keep its crown clear of the bowsprit.
 */
export function bowHead(s: HullShape, c: ShipClass): BowHead {
  const L = c.length;
  const T = s.top(1);
  const B = s.bottom(1);
  const stem = s.z(1) + (0.11 + L * 0.003) * 1.4;
  // underside of the bowsprit, with room to spare
  const bz = s.z(0.985);
  const by = s.top(0.985) - 0.1 - 0.24;
  const under = (z: number) => by + Math.tan(SPRIT_ANGLE) * (z - bz) - 0.2;
  // crown and face must pass under the bowsprit, the tail's fluke must stay out of the sea
  const crown = [V(0, 1.34, 0.02), V(0, 1.27, 0.3), V(0, 1.18, 0.46)];
  const tail = [V(0, -0.68, 0.12), V(0, -0.6, 0.32)];
  const rot = (p: THREE.Vector3, a: number) => V(p.x, p.y * Math.cos(a) - p.z * Math.sin(a), p.y * Math.sin(a) + p.z * Math.cos(a));
  // the biggest figure that fits, as upright as it can stand
  const big = 1.75 + L * 0.04;
  let S = big;
  let lean = 0.62;
  let at = V(0, 0, 0);
  const fits = () => {
    const drop = Math.max(...tail.map((p) => -rot(p, lean).y));
    at = V(0, Math.max(lerp(B, T, 0.4), 0.5 + drop * S), stem + 0.3 * S);
    return crown.every((k) => {
      const p = rot(k, lean).multiplyScalar(S).add(at);
      return p.y < under(p.z);
    });
  };
  search: for (; S > big * 0.6; S -= 0.04) {
    for (lean = 0.62; lean <= 1.1; lean += 0.03) if (fits()) break search;
  }
  const place = new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromEuler(new THREE.Euler(lean, 0, 0)), V(S, S, S));
  const P = (fy: number, fz: number, fx = 0) => V(fx, fy, fz).applyMatrix4(place);
  const yLow = Math.max(B + 0.15, P(-0.62, -0.1).y - 0.35, 0.35);
  const foot = V(0, yLow + 0.12, stem).lerp(P(-0.55, -0.12), 0.4);
  return { at, scale: S, lean, place, centre: P(0.6, 0.05), P, stem, yLow, foot };
}

/**
 * The knee of the head: a deep bracket from the stem out to the figure's
 * hips, its front edge running down under the figure's tail to the
 * cutwater, gilt beading round its edges and a carved trailboard scroll on
 * each cheek.
 */
export function buildKnee(s: HullShape, c: ShipClass, h: BowHead, wood: THREE.BufferGeometry[], trim: THREE.BufferGeometry[], col: THREE.Color, detail: boolean) {
  const L = c.length;
  const T = s.top(1);
  const yLow = h.yLow;
  const back = h.stem - 0.35;
  const shoulder = h.P(0.3, -0.32);
  const yTop = Math.min(T - 0.5, shoulder.y - 0.15);
  const P = h.P;
  const v2 = (p: THREE.Vector3) => new THREE.Vector2(p.z, p.y);
  // lower edge: from the forefoot, sweeping out and up under the tail to the tip
  const low = [
    new THREE.Vector2(back, yLow),
    new THREE.Vector2(h.stem, yLow + 0.12),
    v2(P(-0.55, -0.12)),
    v2(P(-0.24, -0.06)),
    v2(P(0.02, -0.05)),
  ];
  // back over the hips and down along her back to the stem under the rail
  const top = [v2(P(0.2, -0.12)), v2(shoulder), new THREE.Vector2(lerp(h.stem, shoulder.z, 0.4), lerp(yTop, shoulder.y, 0.3)), new THREE.Vector2(back, yTop)];
  const sh = new THREE.Shape();
  sh.moveTo(low[0].x, low[0].y);
  sh.splineThru(low.slice(1));
  sh.splineThru(top);
  sh.lineTo(low[0].x, low[0].y);
  const th = 0.24 + L * 0.006;
  const bev = 0.07 + L * 0.0015;
  const knee = new THREE.ExtrudeGeometry(sh, { depth: th, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: detail ? 3 : 2, curveSegments: detail ? 14 : 8, steps: 1 });
  knee.applyMatrix4(new THREE.Matrix4().makeBasis(V(0, 0, 1), V(0, 1, 0), V(-1, 0, 0)).setPosition(th / 2, 0, 0));
  // thinning towards the tip, like a cutwater
  const tip = P(0.02, -0.05).z;
  const kp = knee.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < kp.count; i++) kp.setX(i, kp.getX(i) * lerp(1, 0.6, Math.min(1, Math.max(0, (kp.getZ(i) - h.stem) / (tip - h.stem)))));
  knee.computeVertexNormals();
  wood.push(colorize(knee, col, 0.02));

  // gilt beading along both cheeks of the lower edge, and a scrolled trailboard above it
  const edge = new THREE.SplineCurve(low.slice(1));
  const topC = new THREE.SplineCurve(top);
  const half = th / 2 + bev * 0.7;
  const r = 0.045 + L * 0.0012;
  for (const side of [1, -1]) {
    const bead: THREE.Vector3[] = [];
    for (let k = 0; k <= 10; k++) {
      const p = edge.getPoint(k / 10);
      const f = Math.min(1, Math.max(0, (p.x - h.stem) / (tip - h.stem)));
      bead.push(V(side * lerp(half, half * 0.6, f), p.y + 0.06, p.x - 0.05));
    }
    trim.push(sweep(bead, () => r, 5, 20));
    const crest: THREE.Vector3[] = [];
    for (let k = 0; k <= 10; k++) {
      const p = topC.getPoint(k / 10);
      const f = Math.min(1, Math.max(0, (p.x - h.stem) / (tip - h.stem)));
      crest.push(V(side * lerp(half, half * 0.6, f), p.y - 0.06, p.x));
    }
    trim.push(sweep(crest, () => r * 0.85, 5, 20));
    const board: THREE.Vector3[] = [];
    for (let k = 0; k <= 8; k++) {
      const u = k / 8;
      const a = edge.getPoint(lerp(0.15, 0.95, u));
      const b = topC.getPoint(lerp(0.85, 0.05, u));
      const m = new THREE.Vector2().lerpVectors(a, b, 0.45);
      const f = Math.min(1, Math.max(0, (m.x - h.stem) / (tip - h.stem)));
      board.push(V(side * (lerp(half, half * 0.6, f) + 0.01), m.y, m.x));
    }
    const end = board[board.length - 1];
    const prev = board[board.length - 2];
    const dir = end.clone().sub(prev).normalize();
    const curl = spiral(end.clone().addScaledVector(dir, 0.05).add(V(0, -0.16, 0)), Z, Y, 0.16 + L * 0.004, 0.9, Math.PI / 2, 10);
    trim.push(sweep([...board.slice(0, -1), ...curl], (u) => lerp(r * 1.5, r * 0.6, u), 6, 34));
    trim.push(ball(r * 1.4, curl[curl.length - 1], 6, 4));
    // a carved acanthus leaf at the start of the board
    trim.push(ball(r * 2.2, board[0], 8, 6));
  }
  return { top: topC, edge, half };
}

/** A figurehead's pieces go to the ship's buckets by material. */
type Bucket = 'wood' | 'iron' | 'glow' | 'trim';
type Add = (bucket: Bucket, g: THREE.BufferGeometry) => void;
type Face = (x: number, y: number, z: number, pitch?: number) => THREE.Matrix4;

interface Sculpt {
  add: Add;
  /** A head's frame: levelled so it looks ahead. */
  face: Face;
  /** A direction or offset given in ship axes (y up, z forward), in the figure frame. */
  ship: (x: number, y: number, z: number) => THREE.Vector3;
  spin: Spinner[];
  /** The ship's gilt (the standard figure is gilded in her trim colour). */
  gilt: THREE.Color;
  /** Segment multiplier: fewer on the low-detail hulls. */
  q: number;
}

/**
 * Builds a figure into the ship's buckets: the part's own, or the standard
 * gilded mermaid when no figurehead part is fitted.
 */
export function buildFigure(k: PartKit, p: Part | undefined, h: BowHead) {
  const parts: { g: THREE.BufferGeometry; bucket: Bucket }[] = [];
  const lean = h.lean;
  const c = Math.cos(lean);
  const s = Math.sin(lean);
  const sc: Sculpt = {
    add: (bucket, g) => parts.push({ g, bucket }),
    face: (x, y, z, pitch = -lean * 0.85) => new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, 0, 0)), V(1, 1, 1)),
    ship: (x, y, z) => V(x, y * c + z * s, -y * s + z * c),
    spin: [],
    gilt: hexL(k.livery.trim),
    q: k.detail ? 1 : 0.65,
  };
  switch (p?.id.split(':')[1]) {
    case 'lion':
      lion(sc);
      break;
    case 'eagle':
      eagle(sc);
      break;
    case 'kraken':
      kraken(sc);
      break;
    case 'dragon':
      dragon(sc);
      break;
    case 'seraph':
      seraph(sc);
      break;
    default:
      mermaid(sc);
  }
  for (const { g, bucket } of parts) {
    g.applyMatrix4(h.place);
    k[bucket].push(g);
  }
  const q = new THREE.Quaternion().setFromRotationMatrix(h.place);
  for (const sp of sc.spin) {
    sp.pos.applyMatrix4(h.place);
    sp.quat.premultiply(q);
    sp.geo.scale(h.scale, h.scale, h.scale);
    k.spinners.push(sp);
  }
}

const seg = (n: number, q: number) => Math.max(3, Math.round(n * q));

/** A ball squashed or stretched about its own centre. */
const egg = (r: number, at: THREE.Vector3, sx: number, sy: number, sz: number) => new THREE.SphereGeometry(r, 8, 6).scale(sx, sy, sz).translate(at.x, at.y, at.z);

/** One row of scales round a swept body: a short flared collar overlapping the next. */
function skirt(curve: THREE.Curve<THREE.Vector3>, u: number, du: number, r: (u: number) => number, q: number) {
  const a = curve.getPointAt(u);
  const b = curve.getPointAt(Math.min(1, u + du));
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r(u + du) * 1.16, r(u) * 0.98, len, seg(14, q), 1, true);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, b.clone().sub(a).normalize()));
  return g.translate(a.x, a.y, a.z);
}

/** A leaf or fin: a flattened, pointed blade from `a` towards `b`, its flat face across `n`. */
function blade(a: THREE.Vector3, b: THREE.Vector3, width: number, thick: number, n: THREE.Vector3, q: number) {
  const len = a.distanceTo(b);
  const g = new THREE.SphereGeometry(1, seg(8, q), seg(5, q));
  // a tapered leaf: fat near the root, pointed at the tip
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const taper = 1 - 0.55 * Math.max(0, y);
    pos.setXYZ(i, pos.getX(i) * width * taper, (y + 1) * 0.5 * len, pos.getZ(i) * thick * taper);
  }
  g.computeVertexNormals();
  const dir = b.clone().sub(a).normalize();
  const across = n.clone().cross(dir).normalize();
  const nn = dir.clone().cross(across).normalize();
  g.applyMatrix4(new THREE.Matrix4().makeBasis(across, dir, nn).setPosition(a));
  return g;
}

// ------------------------------------------------------------------ standard

/**
 * The standard fit: a gilded mermaid on the knee, one arm flung forward
 * holding up a pearl, the other swept back along her side, her hair
 * streaming over her shoulders and her scaled tail running down the knee to
 * a fluke flicked up over the cutwater.
 */
function mermaid(sc: Sculpt) {
  const { add, face, q } = sc;
  const g = sc.gilt;
  const deep = g.clone().multiplyScalar(0.72);
  const pale = g.clone().lerp(new THREE.Color(1, 0.97, 0.88), 0.35);
  const G = (geo: THREE.BufferGeometry, col = g, j = 0.02) => add('trim', colorize(geo, col, j));
  // torso: hips, a narrow waist, ribcage and shoulders
  G(lathe([[0, 0.18], [0.14, 0.2], [0.17, 0.3], [0.15, 0.42], [0.122, 0.52], [0.135, 0.6], [0.158, 0.68], [0.165, 0.76], [0.14, 0.83], [0.08, 0.88], [0, 0.895]], seg(18, q)).scale(1, 1, 0.74));
  for (const sx of [-1, 1]) {
    G(new THREE.SphereGeometry(0.06, seg(10, q), seg(7, q)).scale(1, 0.8, 0.85).translate(sx * 0.135, 0.79, -0.01));
  }
  // a sash of pearls across her breast
  G(sweep([V(0.15, 0.8, 0.04), V(0.06, 0.72, 0.13), V(-0.06, 0.62, 0.135), V(-0.15, 0.54, 0.06)], () => 0.016, 5, 14), pale);
  for (let i = 0; i < 6; i++) {
    const u = (i + 0.5) / 6;
    const p = new THREE.CatmullRomCurve3([V(0.15, 0.8, 0.05), V(0.06, 0.72, 0.14), V(-0.06, 0.62, 0.145), V(-0.15, 0.54, 0.07)]).getPointAt(u);
    G(ball(0.018, p, 6, 4), METAL.pearl);
  }
  // a girdle of scales where skin turns to tail, and a frill of fins round her hips
  G(new THREE.TorusGeometry(0.155, 0.02, 5, seg(18, q)).rotateX(Math.PI / 2).scale(1, 1, 0.76).translate(0, 0.27, 0), pale);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.2;
    const root = V(Math.sin(a) * 0.15, 0.26, Math.cos(a) * 0.11);
    G(blade(root, root.clone().add(V(Math.sin(a) * 0.1, -0.15, Math.cos(a) * 0.07)), 0.05, 0.012, V(Math.sin(a), 0, Math.cos(a)), q), deep);
  }
  // neck, necklace and pendant pearl
  G(spar(V(0, 0.86, 0), V(0, 0.99, 0.02), 0.048, 0.042, seg(8, q)));
  G(new THREE.TorusGeometry(0.06, 0.011, 4, seg(16, q)).rotateX(Math.PI / 2 - 0.35).translate(0, 0.885, 0.012), pale);
  G(ball(0.02, V(0, 0.855, 0.07), 6, 5), METAL.pearl);

  // head, levelled to look ahead and a touch up
  const h = face(0, 1.06, 0.03, undefined);
  const at = (x: THREE.BufferGeometry) => x.applyMatrix4(h);
  G(at(new THREE.SphereGeometry(0.105, seg(16, q), seg(12, q)).scale(0.9, 1.02, 1)));
  G(at(new THREE.SphereGeometry(0.07, seg(12, q), seg(8, q)).scale(0.95, 0.9, 1).translate(0, -0.05, 0.04)));
  G(at(new THREE.ConeGeometry(0.018, 0.05, 5).rotateX(1.2).translate(0, 0.0, 0.112)));
  G(at(ball(0.012, V(0, -0.052, 0.098), 5, 4)), deep);
  for (const sx of [-1, 1]) G(at(new THREE.SphereGeometry(0.018, 6, 4).scale(1.3, 0.55, 0.6).translate(sx * 0.037, 0.018, 0.088)), deep);
  // a crown of seven points, each tipped with a pearl
  G(at(new THREE.CylinderGeometry(0.09, 0.083, 0.045, seg(16, q), 1, true).translate(0, 0.085, -0.005)));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const p = V(Math.sin(a) * 0.09, 0.115, Math.cos(a) * 0.09 - 0.005);
    G(at(new THREE.ConeGeometry(0.02, 0.07, 4).translate(p.x, p.y + 0.03, p.z)));
    G(at(ball(0.013, p.clone().add(V(0, 0.07, 0)), 5, 4)), METAL.pearl);
  }
  // hair: long waved locks off the back of her head, streaming back over her shoulders and down her back
  const hp = (x: number, y: number, z: number) => V(x, y, z).applyMatrix4(h);
  for (let i = 0; i < 9; i++) {
    const u = i / 8;
    const a = lerp(-1.35, 1.35, u);
    const sx = Math.sin(a);
    const w = Math.sin(u * Math.PI * 3) * 0.03;
    const pts = [
      hp(sx * 0.085, 0.07 - Math.abs(sx) * 0.04, -0.01 - Math.cos(a) * 0.055),
      hp(sx * 0.11, -0.02, -0.08 - Math.cos(a) * 0.03),
      V(sx * 0.17 + w, 0.86 - Math.abs(sx) * 0.08, -0.17),
      V(sx * 0.2 - w, 0.68 - Math.abs(sx) * 0.06, -0.24),
      V(sx * 0.22 + w, 0.5, -0.27),
      V(sx * 0.2, 0.36 + Math.abs(sx) * 0.04, -0.33),
    ];
    const tip = pts[pts.length - 1];
    const curl = spiral(tip.clone().add(V(0, -0.035, 0.0)), V(0, 0, -1), Y, 0.035, 0.7, Math.PI / 2, 5);
    G(sweep([...pts, ...curl.slice(1)], (t) => lerp(0.05, 0.013, Math.pow(t, 0.8)), seg(6, q), seg(20, q)), i % 2 ? deep : g);
  }
  // arms: the right flung forward holding up a pearl, the left swept back along her side
  const shoulder = V(-0.15, 0.8, 0.0);
  const hand = shoulder.clone().add(sc.ship(-0.06, 0.14, 0.56));
  G(sweep([shoulder, shoulder.clone().add(sc.ship(-0.1, 0.04, 0.22)), shoulder.clone().add(sc.ship(-0.09, 0.1, 0.4)), hand], (t) => lerp(0.046, 0.032, t), seg(7, q), seg(14, q)));
  G(egg(0.042, hand, 1, 0.8, 1.2));
  G(ball(0.068, hand.clone().add(sc.ship(0, 0.075, 0.03)), seg(12, q), seg(9, q)), METAL.pearl);
  for (let f = 0; f < 4; f++) G(sweep([hand.clone().add(sc.ship(-0.03 + f * 0.02, 0.02, 0.02)), hand.clone().add(sc.ship(-0.035 + f * 0.023, 0.06, 0.07)), hand.clone().add(sc.ship(-0.025 + f * 0.017, 0.1, 0.08))], () => 0.009, 4, 4));
  const sweepBack = [V(0.15, 0.8, 0.0), V(0.24, 0.68, -0.06), V(0.23, 0.52, -0.17), V(0.15, 0.4, -0.26)];
  G(sweep(sweepBack, (t) => lerp(0.046, 0.032, t), seg(7, q), seg(14, q)));
  G(egg(0.04, V(0.13, 0.37, -0.28), 1, 1.2, 0.8));
  // the tail: down the front of the knee, banded in scales, ending in a fluke flicked up over the cutwater
  const tailPts = [V(0, 0.27, 0.0), V(0, 0.08, 0.06), V(0, -0.14, 0.07), V(0, -0.36, 0.03), V(0, -0.54, 0.03), V(0, -0.64, 0.13), V(0, -0.62, 0.26)];
  const tr = (u: number) => lerp(0.155, 0.035, Math.pow(u, 0.75));
  G(sweep(tailPts, tr, seg(10, q), seg(30, q)));
  const tail = new THREE.CatmullRomCurve3(tailPts, false, 'centripetal');
  for (let i = 0; i < 9; i++) G(skirt(tail, 0.05 + i * 0.075, 0.08, tr, q), g, 0.05);
  for (const sx of [-1, 1]) {
    // side fins half way down
    const fp = tail.getPointAt(0.45);
    G(blade(fp.clone().add(V(sx * 0.08, 0, 0)), fp.clone().add(V(sx * 0.22, -0.12, -0.05)), 0.06, 0.012, V(0, 0, 1), q), deep);
    // the fluke: two broad lobes splayed out
    const fe = tail.getPointAt(1);
    const lobe = blade(fe, fe.clone().add(V(sx * 0.28, 0.06, 0.12)), 0.11, 0.018, V(0, 1, -0.4).normalize(), q);
    G(lobe);
    for (let r = 0; r < 3; r++) G(sweep([fe.clone(), fe.clone().add(V(sx * (0.12 + r * 0.03), 0.03 + r * 0.02, 0.1 - r * 0.04)), fe.clone().add(V(sx * (0.24 + r * 0.02), 0.06 + r * 0.03, 0.14 - r * 0.07))], () => 0.008, 3, 5), deep);
  }
}

// ------------------------------------------------------------------ parts

/** Common: a carved oak lion, painted, his mane in rings of tufts, paws on a gilded shield. */
function lion(sc: Sculpt) {
  const { add, face, q } = sc;
  const mane = hexL(0x8f5a24);
  const maneDark = hexL(0x6e3f18);
  const fur = hexL(0xd0a45a);
  const dark = hexL(0x3a2618);
  const W = (geo: THREE.BufferGeometry, col: THREE.Color, j = 0.06) => add('wood', colorize(geo, col, j));
  // body: chest and haunches running back down the knee
  W(lathe([[0, -0.1], [0.15, -0.04], [0.21, 0.2], [0.2, 0.45], [0.23, 0.66], [0.18, 0.84], [0, 0.9]], seg(14, q)).scale(1, 1, 0.85), fur);
  W(sweep([V(0, 0.1, -0.05), V(0, -0.15, -0.12), V(0, -0.4, -0.08), ...spiral(V(0, -0.5, 0.06), V(0, 0, 1), Y, 0.1, 0.8, Math.PI, 7)], (u) => lerp(0.05, 0.02, u), seg(6, q), seg(16, q)), fur);
  W(egg(0.08, V(0, -0.47, 0.18), 1, 1.3, 1), maneDark);
  const h = face(0, 1.0, 0.06);
  const at = (g: THREE.BufferGeometry) => g.applyMatrix4(h);
  // the mane: three rings of tufts round the face, the outer ones longest
  for (const [rr, back, n, len] of [[0.19, -0.04, 15, 0.17], [0.25, -0.1, 17, 0.21], [0.31, -0.17, 19, 0.24]] as [number, number, number, number][]) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rr * 3;
      const d = V(Math.cos(a), Math.sin(a) * 1.05, -0.5).normalize();
      const root = V(d.x * rr * 0.62, d.y * rr * 0.62, back);
      const tipP = root.clone().addScaledVector(d, len).add(V(0, -0.04, -0.03));
      W(at(blade(root, tipP, 0.085, 0.05, V(-d.y, d.x, 0).cross(d), q)), i % 3 ? mane : maneDark, 0.1);
    }
  }
  W(at(new THREE.SphereGeometry(0.19, seg(14, q), seg(10, q)).scale(1, 0.98, 1)), fur);
  // muzzle, snarling: upper lip lobes, a dark open mouth with fangs, the jaw below
  W(at(new THREE.SphereGeometry(0.11, seg(10, q), 7).scale(1.15, 0.75, 1).translate(0, -0.05, 0.16)), fur.clone().multiplyScalar(1.12));
  W(at(new THREE.SphereGeometry(0.08, 8, 6).scale(1.1, 0.5, 0.9).translate(0, -0.14, 0.15)), dark);
  W(at(new THREE.SphereGeometry(0.07, 8, 6).scale(1.1, 0.5, 1).translate(0, -0.19, 0.13)), fur);
  for (const sx of [-1, 1]) {
    W(at(new THREE.ConeGeometry(0.014, 0.06, 4).rotateX(Math.PI).translate(sx * 0.045, -0.12, 0.22)), hexL(0xf3ead6));
    W(at(new THREE.ConeGeometry(0.012, 0.05, 4).translate(sx * 0.04, -0.17, 0.2)), hexL(0xf3ead6));
  }
  W(at(ball(0.045, V(0, 0.0, 0.25), 6, 4)), dark);
  for (const sx of [-1, 1]) {
    W(at(ball(0.032, V(sx * 0.075, 0.06, 0.16), 6, 4)), hexL(0xe7b13a));
    W(at(ball(0.016, V(sx * 0.077, 0.06, 0.188), 5, 3)), dark);
    W(at(new THREE.SphereGeometry(0.06, 6, 4).scale(1.4, 0.4, 0.8).translate(sx * 0.08, 0.11, 0.13)), maneDark);
    W(at(new THREE.SphereGeometry(0.055, 6, 4).scale(1, 1, 0.5).translate(sx * 0.15, 0.17, -0.02)), fur);
    // forelegs down the knee, paws curled over the shield's rim
    W(sweep([V(sx * 0.15, 0.72, 0.06), V(sx * 0.18, 0.52, 0.16), V(sx * 0.14, 0.3, 0.2)], () => 0.07, seg(7, q), 8), fur);
    W(egg(0.09, V(sx * 0.13, 0.27, 0.23), 1, 0.75, 1.15), fur.clone().multiplyScalar(1.05));
    for (let t = -1; t <= 1; t++) W(ball(0.028, V(sx * 0.13 + t * 0.04, 0.24, 0.31), 5, 4), dark);
  }
  // the shield: a gilded oval with a boss and a raised rim, between his paws
  const shield = new THREE.SphereGeometry(0.24, seg(16, q), seg(8, q), 0, Math.PI * 2, 0, Math.PI / 2);
  shield.scale(0.85, 1.1, 0.25).rotateX(Math.PI / 2).translate(0, 0.08, 0.2);
  add('iron', colorize(shield, METAL.gold));
  add('iron', colorize(new THREE.TorusGeometry(0.205, 0.022, 5, seg(22, q)).scale(1, 1.3, 1).translate(0, 0.08, 0.2), METAL.paleGold));
  add('iron', colorize(ball(0.06, V(0, 0.08, 0.26), 8, 6), METAL.paleGold));
  add('iron', colorize(new THREE.TorusGeometry(0.12, 0.012, 4, seg(18, q)).scale(1, 1.3, 1).translate(0, 0.08, 0.255), METAL.amber));
}

/** Rare: a sea eagle, white head and hooked gold beak, wings flung wide and back along the bows. */
function eagle(sc: Sculpt) {
  const { add, face, ship, q } = sc;
  const brown = hexL(0x5b3b22);
  const deep = hexL(0x3a2414);
  const tawny = hexL(0x7a5230);
  const white = hexL(0xf1ece0);
  const beak = hexL(0xe3a92b);
  const W = (geo: THREE.BufferGeometry, col: THREE.Color, j = 0.06) => add('wood', colorize(geo, col, j));
  W(lathe([[0, -0.05], [0.14, 0.04], [0.21, 0.28], [0.21, 0.55], [0.16, 0.78], [0.09, 0.9], [0, 0.92]], seg(14, q)).scale(1, 1, 0.92), brown);
  // breast feathers in overlapping rows
  for (let r = 0; r < 4; r++) {
    for (let i = -2; i <= 2; i++) {
      const p = V(i * 0.06, 0.66 - r * 0.12, 0.17 + 0.02 * (2 - Math.abs(i)) * 0.5);
      W(blade(p, p.clone().add(V(0, -0.1, 0.03)), 0.05, 0.015, Z, q), r % 2 ? tawny : brown, 0.06);
    }
  }
  // a ruff of white neck feathers
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const root = V(Math.sin(a) * 0.1, 0.9, Math.cos(a) * 0.09);
    W(blade(root, root.clone().add(V(Math.sin(a) * 0.08, -0.12, Math.cos(a) * 0.06)), 0.04, 0.012, V(Math.sin(a), 0, Math.cos(a)), q), white);
  }
  W(sweep([V(0, 0.9, -0.02), V(0, 0.98, 0.0), V(0, 1.04, 0.05)], () => 0.1, seg(8, q), 4), white);
  const h = face(0, 1.05, 0.08);
  const at = (g: THREE.BufferGeometry) => g.applyMatrix4(h);
  W(at(new THREE.SphereGeometry(0.13, seg(14, q), seg(10, q)).scale(0.88, 0.95, 1.15)), white);
  // a fierce brow over amber eyes
  for (const sx of [-1, 1]) {
    W(at(new THREE.SphereGeometry(0.05, 7, 5).scale(1.1, 0.4, 1).rotateZ(sx * -0.3).translate(sx * 0.06, 0.05, 0.09)), white);
    W(at(ball(0.024, V(sx * 0.07, 0.025, 0.1), 6, 4)), beak);
    W(at(ball(0.013, V(sx * 0.074, 0.025, 0.118), 5, 3)), deep);
  }
  W(at(new THREE.SphereGeometry(0.06, 8, 6).scale(0.8, 0.7, 1).translate(0, -0.005, 0.14)), beak);
  W(at(sweep([V(0, 0.02, 0.14), V(0, 0.02, 0.25), V(0, -0.04, 0.32), V(0, -0.11, 0.31)], (u) => lerp(0.055, 0.01, u), seg(7, q), 10)), beak);
  // wings flung wide: a leading edge out to the wrist, secondaries hanging back from it,
  // primaries fanned from the wrist, a row of coverts over the top
  for (const sx of [-1, 1]) {
    const root = V(sx * 0.17, 0.72, -0.08);
    const elbow = root.clone().add(ship(sx * 0.32, 0.2, -0.12));
    const wrist = root.clone().add(ship(sx * 0.62, 0.28, -0.02));
    W(ball(0.09, root, 8, 6), brown);
    const arm = new THREE.CatmullRomCurve3([root, elbow, wrist]);
    W(sweep([root, elbow, wrist], (u) => lerp(0.075, 0.04, u), seg(7, q), 14), brown);
    const up = ship(0, 1, 0);
    for (let f = 0; f < 9; f++) {
      const u = 0.08 + (f / 8) * 0.88;
      const a = arm.getPointAt(u);
      const dir = ship(sx * lerp(0.12, 0.35, u), -0.06, -1).normalize();
      W(blade(a, a.clone().addScaledVector(dir, lerp(0.42, 0.58, u)), 0.085, 0.02, up, q), f % 2 ? brown : deep, 0.08);
      W(blade(a.clone().addScaledVector(up, 0.025), a.clone().addScaledVector(dir, lerp(0.2, 0.3, u)).addScaledVector(up, 0.03), 0.09, 0.02, up, q), tawny, 0.08);
    }
    for (let f = 0; f < 7; f++) {
      const u = f / 6;
      const dir = ship(sx * lerp(1, 0.55, u), lerp(0.18, 0, u), lerp(0.25, -1, u)).normalize();
      W(blade(wrist, wrist.clone().addScaledVector(dir, lerp(0.62, 0.7, Math.sin(u * Math.PI))), 0.075, 0.02, up, q), deep, 0.08);
    }
    // talons gripping a gilded ball
    for (let t = -1; t <= 1; t++) W(sweep([V(sx * 0.1 + t * 0.03, 0.2, 0.08), V(sx * 0.11 + t * 0.035, 0.08, 0.17), V(sx * 0.08 + t * 0.03, -0.02, 0.19)], () => 0.022, 4, 6), beak);
  }
  add('iron', colorize(ball(0.14, V(0, -0.1, 0.14), seg(14, q), seg(10, q)), METAL.gold));
  add('iron', colorize(new THREE.TorusGeometry(0.14, 0.01, 4, seg(18, q)).rotateX(Math.PI / 2).translate(0, -0.1, 0.14), METAL.paleGold));
  // tail feathers fanned down the knee
  for (let i = -3; i <= 3; i++) {
    const a = V(i * 0.03, 0.0, -0.08);
    W(blade(a, a.clone().add(V(i * 0.06, -0.5, -0.12)), 0.05, 0.014, Z, q), i % 2 ? brown : white, 0.06);
  }
}

/** Epic: a golden kraken wrapped round the knee, its arms coiling down the cutwater and out along the bows. */
function kraken(sc: Sculpt) {
  const { add, ship, q } = sc;
  const g = METAL.gold;
  const pale = METAL.paleGold;
  const I = (geo: THREE.BufferGeometry, col: THREE.Color, j = 0.04) => add('iron', colorize(geo, col, j));
  // the mantle: a great ridged body thrust forward over the cutwater like a squid's, fins at its tip
  I(lathe([[0, 0.4], [0.2, 0.44], [0.26, 0.58], [0.25, 0.78], [0.19, 0.95], [0.1, 1.08], [0, 1.12]], seg(16, q)).scale(1, 1, 0.86), g);
  for (const sx of [-1, 0, 1]) I(sweep([V(sx * 0.13, 0.5, -0.22), V(sx * 0.14, 0.75, -0.22), V(sx * 0.09, 0.98, -0.14), V(sx * 0.03, 1.1, -0.04)], (u) => lerp(0.03, 0.012, u), 5, 14), pale);
  for (const sx of [-1, 1]) {
    I(blade(V(sx * 0.12, 0.9, -0.06), V(sx * 0.36, 1.0, -0.12), 0.1, 0.02, ship(0, 1, 0), q), pale);
    // eyes under heavy golden lids, rubies for pupils
    I(ball(0.085, V(sx * 0.2, 0.55, 0.12), 9, 7), pale);
    I(new THREE.TorusGeometry(0.08, 0.018, 4, seg(14, q)).rotateY(sx * 0.6).translate(sx * 0.21, 0.55, 0.14), g);
    I(new THREE.SphereGeometry(0.09, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1).translate(sx * 0.2, 0.58, 0.12), g);
    I(ball(0.042, V(sx * 0.23, 0.55, 0.18), 6, 4), METAL.ruby);
  }
  // eight arms: two curl forward over the cutwater, two fling out along each bow, the rest wrap the knee
  const arms: THREE.Vector3[][] = [];
  const o = V(0, 0.45, 0);
  for (const sx of [-1, 1]) {
    arms.push([V(sx * 0.1, 0.55, 0.1), V(sx * 0.2, 0.3, 0.26), V(sx * 0.22, 0.04, 0.24), ...spiral(V(sx * 0.22, -0.08, 0.08), Z, Y, 0.15, 0.85, -Math.PI / 2, 8)]);
    const out = (d: number, y: number, z: number) => o.clone().addScaledVector(ship(sx * d, y, z), 1);
    arms.push([V(sx * 0.18, 0.55, -0.02), out(0.45, -0.1, -0.15), out(0.62, -0.25, -0.45), out(0.62, -0.32, -0.8), ...spiral(out(0.55, -0.22, -0.98), ship(0, 1, 0), ship(0, 0, -1), 0.13, 0.85, Math.PI, 8)]);
    arms.push([V(sx * 0.12, 0.5, -0.1), V(sx * 0.2, 0.2, -0.2), V(sx * 0.18, -0.15, -0.22), V(sx * 0.2, -0.4, -0.28), ...spiral(V(sx * 0.26, -0.55, -0.2), V(sx, 0, 0), Y, 0.1, 0.8, Math.PI, 6)]);
    arms.push([V(sx * 0.06, 0.52, 0.05), V(sx * 0.07, 0.2, 0.12), V(sx * 0.05, -0.15, 0.1), V(sx * 0.03, -0.4, 0.06), ...spiral(V(0, -0.55, 0.12), V(sx, 0, 0), Y, 0.12, 0.8, Math.PI / 2, 7)]);
  }
  arms.forEach((pts, i) => {
    const r = (u: number) => lerp(0.09, 0.016, Math.pow(u, 0.7));
    I(sweep(pts, r, seg(7, q), seg(28, q)), i % 2 ? g : pale);
    // a row of suckers along the inner side of every arm
    const cv = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    for (let k = 1; k < 8; k++) {
      const u = k / 9;
      const p = cv.getPointAt(u);
      const n = cv.getTangentAt(u).cross(V(1, 0, 0)).normalize();
      I(ball(r(u) * 0.38, p.addScaledVector(n, r(u) * 0.85), 5, 3), pale);
    }
  });
}

/** Legendary: a horned golden dragon reaching out over the waves, jaws open, eyes like coals, wings half spread along the bows. */
function dragon(sc: Sculpt) {
  const { add, face, ship, q } = sc;
  const g = METAL.gold;
  const pale = METAL.paleGold;
  const wing = hexL(0x8a2018);
  const I = (geo: THREE.BufferGeometry, col: THREE.Color, j = 0.04) => add('iron', colorize(geo, col, j));
  // the neck: an S-curve up from the knee and out over the cutwater, banded in belly scales
  const neck = [V(0, -0.35, -0.1), V(0, -0.05, 0.02), V(0, 0.3, 0.0), V(0, 0.68, -0.02), V(0, 1.0, 0.12), V(0, 1.16, 0.3)];
  const nr = (u: number) => lerp(0.24, 0.12, u);
  I(sweep(neck, nr, seg(11, q), seg(28, q)), g);
  const curve = new THREE.CatmullRomCurve3(neck, false, 'centripetal');
  // belly plates down the front of the neck
  for (let i = 0; i < 11; i++) {
    const u = 0.1 + i * 0.075;
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    const front = V(1, 0, 0).cross(t).normalize();
    const plate = new THREE.SphereGeometry(1, seg(10, q), 5);
    plate.scale(nr(u) * 0.85, 0.06, nr(u) * 0.5);
    plate.applyMatrix4(new THREE.Matrix4().makeBasis(V(1, 0, 0), t, front).setPosition(p.clone().addScaledVector(front, nr(u) * 0.62)));
    I(plate, pale);
  }
  // spines down its back
  for (let i = 1; i < 12; i++) {
    const u = i / 12;
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    const back = t.clone().cross(V(1, 0, 0)).normalize();
    const sp = new THREE.ConeGeometry(0.05, 0.2 - u * 0.07, 4);
    sp.translate(0, 0.1, 0).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, back.clone().addScaledVector(t, -0.6).normalize()));
    I(sp.translate(p.x + back.x * nr(u) * 0.8, p.y + back.y * nr(u) * 0.8, p.z + back.z * nr(u) * 0.8), pale);
  }
  const h = face(0, 1.2, 0.36, -0.85 * 0.85 + 0.15);
  const at = (x: THREE.BufferGeometry) => x.applyMatrix4(h);
  // skull, long snout, open lower jaw with fangs, brow ridges and swept horns
  I(at(new THREE.SphereGeometry(0.15, seg(14, q), seg(10, q)).scale(1, 0.85, 1.2)), g);
  I(at(new THREE.SphereGeometry(0.11, seg(12, q), 8).scale(0.85, 0.5, 1.75).translate(0, 0.0, 0.22)), g);
  I(at(new THREE.SphereGeometry(0.09, seg(10, q), 7).scale(0.8, 0.35, 1.7).rotateX(0.38).translate(0, -0.11, 0.17)), METAL.amber);
  I(at(new THREE.SphereGeometry(0.07, 8, 6).scale(0.7, 0.25, 1.5).rotateX(0.2).translate(0, -0.06, 0.2)), METAL.ruby);
  for (const sx of [-1, 1]) {
    I(at(sweep([V(sx * 0.07, 0.08, -0.05), V(sx * 0.13, 0.2, -0.2), V(sx * 0.12, 0.25, -0.4), V(sx * 0.06, 0.2, -0.55)], (u) => lerp(0.045, 0.008, u), 6, 12)), pale);
    I(at(sweep([V(sx * 0.1, 0.0, -0.06), V(sx * 0.2, 0.02, -0.18), V(sx * 0.24, -0.04, -0.3)], (u) => lerp(0.03, 0.006, u), 5, 8)), g);
    I(at(new THREE.SphereGeometry(0.05, 6, 4).scale(1.3, 0.4, 1.2).translate(sx * 0.07, 0.085, 0.08)), pale);
    add('glow', colorize(at(ball(0.028, V(sx * 0.078, 0.045, 0.11), 6, 4)), GLOW.ember, 0));
    add('glow', colorize(at(ball(0.013, V(sx * 0.03, 0.03, 0.39), 4, 3)), GLOW.ember, 0));
    for (const z of [0.14, 0.22, 0.3]) I(at(new THREE.ConeGeometry(0.014, 0.055, 3).rotateX(Math.PI).translate(sx * 0.06, -0.05, z)), METAL.pearl);
    for (const z of [0.12, 0.2]) I(at(new THREE.ConeGeometry(0.012, 0.045, 3).translate(sx * 0.05, -0.12, z)), METAL.pearl);
    // whiskers trailing from the snout
    I(at(sweep([V(sx * 0.06, -0.02, 0.33), V(sx * 0.14, -0.06, 0.3), V(sx * 0.2, -0.14, 0.18), V(sx * 0.22, -0.24, 0.06)], (u) => lerp(0.012, 0.004, u), 4, 10)), pale);
    // forelegs clawing the knee
    I(sweep([V(sx * 0.17, 0.3, 0.06), V(sx * 0.24, 0.12, 0.16), V(sx * 0.18, -0.06, 0.2)], () => 0.06, seg(6, q), 8), g);
    for (let t = -1; t <= 1; t++) I(new THREE.ConeGeometry(0.018, 0.09, 4).rotateX(Math.PI * 0.75).translate(sx * 0.18 + t * 0.035, -0.1, 0.25), METAL.pearl);
    // wings half spread back along the bows: gilded fingers, crimson membrane between
    const root = V(sx * 0.22, 0.5, -0.06);
    const tipDir = [ship(sx * 0.7, 0.9, -0.1), ship(sx * 1.1, 0.45, -0.35), ship(sx * 1.0, 0.1, -0.85), ship(sx * 0.45, -0.05, -1.05)];
    const tips = tipDir.map((d, i) => root.clone().addScaledVector(d.normalize(), [0.95, 1.05, 0.95, 0.7][i]));
    for (const tp of tips) {
      const mid = root.clone().lerp(tp, 0.45).addScaledVector(ship(0, 1, 0), 0.08);
      I(sweep([root, mid, tp], (u) => lerp(0.05, 0.012, u), 5, 12), g);
      I(new THREE.ConeGeometry(0.022, 0.1, 4).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, tp.clone().sub(mid).normalize())).translate(tp.x, tp.y, tp.z), pale);
    }
    for (let i = 0; i < tips.length - 1; i++) {
      // membrane: a thin scalloped sheet between two fingers
      const a = tips[i];
      const b = tips[i + 1];
      const pos: number[] = [];
      const n = seg(8, q);
      for (let k = 0; k <= n; k++) {
        const u = k / n;
        const e = a.clone().lerp(b, u).lerp(root, Math.sin(u * Math.PI) * 0.22);
        pos.push(root.x, root.y, root.z, e.x, e.y, e.z);
      }
      const idx: number[] = [];
      for (let k = 0; k < n; k++) {
        const j = k * 2;
        idx.push(j, j + 1, j + 3, j, j + 3, j + 2);
        idx.push(j, j + 3, j + 1, j, j + 2, j + 3);
      }
      const m = new THREE.BufferGeometry();
      m.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      m.setIndex(idx);
      m.computeVertexNormals();
      add('wood', colorize(m, wing, 0.08));
    }
  }
  // the tail coils down the knee
  I(sweep([V(0, -0.35, -0.1), V(0, -0.55, -0.05), ...spiral(V(0, -0.62, 0.12), V(1, 0, 0).cross(Y).negate(), Y, 0.14, 1.1, Math.PI / 2, 10)], (u) => lerp(0.11, 0.02, u), seg(7, q), seg(22, q)), g);
}

/** Mythic: a pearl seraph holding up a star, crystal wings raised and spread, a turning halo of light. */
function seraph(sc: Sculpt) {
  const { add, face, q } = sc;
  const pearl = METAL.pearl;
  const silver = METAL.silver;
  const I = (geo: THREE.BufferGeometry, col: THREE.Color, j = 0.04) => add('iron', colorize(geo, col, j));
  // robes flowing down into a long trailing hem down the knee, with folds
  I(lathe([[0, 0.1], [0.21, 0.14], [0.25, 0.3], [0.18, 0.5], [0.145, 0.64], [0.17, 0.77], [0.13, 0.87], [0.05, 0.92], [0, 0.93]], seg(16, q)).scale(1, 1, 0.8), pearl);
  const hem = [V(0, 0.16, 0), V(0, -0.06, 0.03), V(0, -0.3, 0.0), V(0, -0.5, -0.05), V(0, -0.62, 0.05), V(0, -0.6, 0.2)];
  I(sweep(hem, (u) => lerp(0.22, 0.04, Math.pow(u, 0.8)), seg(10, q), seg(22, q)), silver);
  const hc = new THREE.CatmullRomCurve3(hem, false, 'centripetal');
  for (let f = 0; f < 6; f++) {
    const a = (f / 6) * Math.PI * 2 + 0.3;
    const pts = [0.02, 0.2, 0.4, 0.6].map((u) => {
      const p = hc.getPointAt(u);
      const r = lerp(0.22, 0.04, Math.pow(u, 0.8));
      return p.add(V(Math.sin(a) * r * 0.95, 0, Math.cos(a) * r * 0.95));
    });
    I(sweep(pts, (u) => lerp(0.03, 0.01, u), 4, 10), pearl);
  }
  I(new THREE.TorusGeometry(0.16, 0.022, 5, seg(18, q)).rotateX(Math.PI / 2).scale(1, 1, 0.8).translate(0, 0.52, 0), METAL.gold);
  I(spar(V(0, 0.88, 0), V(0, 1.0, 0.01), 0.052, 0.047, 8), pearl);
  const h = face(0, 1.07, 0.03, -0.85 * 0.5);
  const at = (x: THREE.BufferGeometry) => x.applyMatrix4(h);
  I(at(new THREE.SphereGeometry(0.11, seg(14, q), seg(11, q)).scale(0.9, 1.03, 1)), pearl);
  I(at(new THREE.SphereGeometry(0.07, 10, 7).scale(0.95, 0.9, 1).translate(0, -0.05, 0.04)), pearl);
  I(at(new THREE.ConeGeometry(0.017, 0.05, 5).rotateX(1.2).translate(0, 0.0, 0.11)), pearl);
  // long hair in silver locks down the back
  for (let i = 0; i < 7; i++) {
    const a = lerp(-1.1, 1.1, i / 6);
    I(at(sweep([V(Math.sin(a) * 0.09, 0.07, -0.03), V(Math.sin(a) * 0.12, -0.04, -0.13), V(Math.sin(a) * 0.15, -0.22, -0.18), V(Math.sin(a) * 0.16, -0.42, -0.16)], (u) => lerp(0.04, 0.014, u), 5, 12)), silver);
  }
  for (const sx of [-1, 1]) add('glow', colorize(at(ball(0.016, V(sx * 0.04, 0.015, 0.1), 4, 3)), GLOW.aether, 0));
  // arms raised forward, cupping a star
  const star = V(0, 1.13, 0.44);
  for (const sx of [-1, 1]) {
    I(sweep([V(sx * 0.16, 0.82, 0), V(sx * 0.21, 0.93, 0.18), V(sx * 0.09, 1.07, 0.38)], (u) => lerp(0.05, 0.03, u), seg(6, q), 12), pearl);
    // sleeves hanging from the forearms
    I(blade(V(sx * 0.2, 0.92, 0.16), V(sx * 0.22, 0.78, 0.22), 0.07, 0.02, V(sx, 0, 0), q), silver);
  }
  add('glow', colorize(new THREE.OctahedronGeometry(0.1, 0).translate(star.x, star.y, star.z), GLOW.star));
  for (let i = 0; i < 8; i++) add('glow', colorize(new THREE.ConeGeometry(0.016, i % 2 ? 0.1 : 0.18, 3).translate(0, i % 2 ? 0.1 : 0.14, 0).rotateZ((i * Math.PI) / 4).translate(star.x, star.y, star.z), GLOW.star));
  // wings of crystal: three rows of shards from the shoulder blades, raised and spread
  for (const sx of [-1, 1]) {
    for (const [row, n, k] of [[0, 10, 1.1], [1, 8, 0.7], [2, 6, 0.42]] as [number, number, number][]) {
      for (let f = 0; f < n; f++) {
        const u = f / (n - 1);
        const dir = sc.ship(sx * lerp(0.45, 1.0, u) * (1 - row * 0.1), lerp(1.0, 0.2, u), lerp(-0.35, -0.75, u)).normalize();
        const len = (0.55 + Math.sin(u * Math.PI) * 0.45 + (1 - u) * 0.4) * k;
        const sh = new THREE.OctahedronGeometry(1, 0);
        sh.scale(0.065 * (row ? 1.3 : 1), len * 0.5, 0.024).translate(0, len * 0.5, 0);
        sh.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, dir)).translate(sx * 0.13, 0.78 - row * 0.03, -0.14 + row * 0.03);
        // pearl feathers with lit tips over rows of blued steel, so the wings read as wings, not a flare
        if (row === 2) I(sh, silver);
        else if (row === 1) I(sh, METAL.blued);
        else {
          I(sh, f % 2 ? pearl : silver);
          add('glow', colorize(ball(0.032, V(sx * 0.13, 0.78, -0.14).addScaledVector(dir, len), 4, 3), f % 2 ? GLOW.star : GLOW.aether));
        }
      }
    }
    I(ball(0.065, V(sx * 0.13, 0.78, -0.13), 7, 5), silver);
  }
  // the halo turns on its own
  const glowC = (g: THREE.BufferGeometry, c: THREE.Color) => colorize(g, c, 0);
  const halo = merged([glowC(new THREE.TorusGeometry(0.16, 0.015, 3, 32).rotateX(Math.PI / 2), GLOW.star), glowC(new THREE.TorusGeometry(0.115, 0.008, 3, 6).rotateX(Math.PI / 2), GLOW.aether)]);
  // level over her head, whatever her lean
  const lean = Math.atan2(sc.ship(0, 0, 1).y, sc.ship(0, 0, 1).z);
  const haloAt = V(0, 1.07, 0.03).add(sc.ship(0, 0.24, -0.06));
  sc.spin.push({ geo: halo, mat: 'glow', pos: haloAt, quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(-lean - 0.3, 0, 0)), axis: Y, spin: 0.9, bob: 0.025, rate: 1.6, phase: 0 });
}
