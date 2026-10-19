import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { patchMaterial } from '../render/environment';
import { clamp, damp, mulberry32, smoothstep } from '../core/noise';
import { palmGeometry } from '../world/vegetation';
import { deckTexture } from '../ships/shipTextures';
import { drawFlag } from '../ships/heraldry';
import { PRESETS, ShipLook } from '../ships/look';
import type { Ship } from '../ships/ship';
import type { World } from '../game/world';
import { Crowd, Figure, HIP, PirateStyle, PropGeo } from './pirates';
import { FLAG, P, PROP } from '../ships/crewModel';
import { PortSite, PORT_HALF_WIDTH } from './site';

// Puerto: a stilt-town harbour on a sunny beach. A plank quay on pilings, a
// tavern, a sail loft that flies your colours, a cargo shed, a lookout tower,
// a working crane and a dozen pirates busy with their day. Everything is built
// in a local frame (+x along the shore, +z out to sea, quay edge at z = 0) and
// merged into a handful of meshes.

export const DECK = 1.8;
const SHIP_X = -3;
const TAU = Math.PI * 2;

const lin = (hex: number) => new THREE.Color(hex).convertSRGBToLinear();

type Bucket = 'wood' | 'iron' | 'glow' | 'gold';
type Paint = THREE.Color | ((p: THREE.Vector3) => THREE.Color);
interface Xf {
  rx?: number;
  ry?: number;
  rz?: number;
  b?: Bucket;
  flat?: boolean;
}

function colorize(geo: THREE.BufferGeometry, paint: Paint): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const c = typeof paint === 'function' ? paint(p) : paint;
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

class Builder {
  readonly parts: Record<Bucket, THREE.BufferGeometry[]> = { wood: [], iron: [], glow: [], gold: [] };

  add(geo: THREE.BufferGeometry, pos: [number, number, number], paint: Paint, o: Xf = {}) {
    if (o.rx) geo.rotateX(o.rx);
    if (o.rz) geo.rotateZ(o.rz);
    if (o.ry) geo.rotateY(o.ry);
    geo.translate(pos[0], pos[1], pos[2]);
    const g = colorize(geo, paint);
    if (o.flat) g.computeVertexNormals();
    this.parts[o.b ?? 'wood'].push(g);
    return g;
  }

  box(w: number, h: number, d: number, pos: [number, number, number], paint: Paint, o: Xf & { r?: number } = {}) {
    const r = o.r ?? 0;
    const g = r > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, Math.min(w, h, d) / 2 - 1e-3)) : new THREE.BoxGeometry(w, h, d);
    return this.add(g, pos, paint, o);
  }

  cyl(rt: number, rb: number, h: number, pos: [number, number, number], paint: Paint, o: Xf & { seg?: number } = {}) {
    return this.add(new THREE.CylinderGeometry(rt, rb, h, o.seg ?? 8), pos, paint, o);
  }

  ball(r: number, pos: [number, number, number], paint: Paint, o: Xf & { s?: [number, number, number] } = {}) {
    const g = new THREE.SphereGeometry(r, 10, 7);
    if (o.s) g.scale(o.s[0], o.s[1], o.s[2]);
    return this.add(g, pos, paint, o);
  }

  /** A beam between two points. */
  beam(a: THREE.Vector3, b: THREE.Vector3, r: number, paint: Paint, bucket: Bucket = 'wood', seg = 6) {
    const len = a.distanceTo(b);
    const g = new THREE.CylinderGeometry(r, r, len, seg);
    g.translate(0, len / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    g.applyMatrix4(new THREE.Matrix4().compose(a, q, new THREE.Vector3(1, 1, 1)));
    this.parts[bucket].push(colorize(g, paint));
  }

  /** Triangular gable prism: base on y = 0, apex at `rise`, spanning `span` across, `len` along the ridge. */
  gable(span: number, rise: number, len: number, pos: [number, number, number], paint: Paint, ridgeAlongX: boolean) {
    const g = new THREE.CylinderGeometry(1, 1, len, 3);
    if (ridgeAlongX) {
      g.rotateZ(Math.PI / 2).rotateX(-Math.PI / 2);
      g.scale(1, rise / 1.5, span / 1.732);
    } else {
      g.rotateX(Math.PI / 2).rotateZ(Math.PI);
      g.scale(span / 1.732, rise / 1.5, 1);
    }
    g.translate(0, rise / 3, 0);
    return this.add(g, pos, paint, { flat: true });
  }

  finish(group: THREE.Group, mats: Record<Bucket, THREE.Material>) {
    for (const k of Object.keys(this.parts) as Bucket[]) {
      if (!this.parts[k].length) continue;
      const m = new THREE.Mesh(mergeGeometries(this.parts[k])!, mats[k]);
      m.castShadow = k !== 'glow';
      m.receiveShadow = true;
      group.add(m);
    }
  }
}

const C = {
  timber: lin(0x5a3d26),
  timberDark: lin(0x3e2a1a),
  pile: lin(0x5b4330),
  algae: lin(0x2f3d2a),
  cream: lin(0xf3e6c8),
  ochre: lin(0xe9b864),
  teal: lin(0x3f9c98),
  terracotta: lin(0xc2583f),
  slate: lin(0x4a5560),
  shedBlue: lin(0x7c9bad),
  coral: lin(0xe48a70),
  moss: lin(0x2f7d6e),
  stone: lin(0x9a8f84),
  iron: lin(0x2a2c30),
  glass: new THREE.Color(2.6, 1.7, 0.75),
  lamp: new THREE.Color(5.5, 3.6, 1.5),
  gold: lin(0xf2c45a),
  red: lin(0xb8352b),
  shutterBlue: lin(0x2f6f9a),
  shutterGreen: lin(0x3f8a4a),
  door: lin(0x7a3626),
};

const shade = (c: THREE.Color, f: number) => c.clone().multiplyScalar(f);

// ------------------------------------------------------------------ sign atlas

const SIGN_ROWS = ['The Salty Gull', 'Flags & Sails', 'Cargo & Rum'];

function signAtlas(): THREE.CanvasTexture {
  const W = 512;
  const RH = 96;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = RH * 4;
  const g = c.getContext('2d')!;
  SIGN_ROWS.forEach((text, r) => {
    const y = r * RH;
    const grad = g.createLinearGradient(0, y, 0, y + RH);
    grad.addColorStop(0, '#6d4628');
    grad.addColorStop(1, '#4a2e18');
    g.fillStyle = grad;
    g.fillRect(0, y, W, RH);
    g.globalAlpha = 0.18;
    g.fillStyle = '#000';
    for (let i = 1; i < 4; i++) g.fillRect(0, y + (i * RH) / 4, W, 2);
    g.globalAlpha = 1;
    g.strokeStyle = '#e2b552';
    g.lineWidth = 5;
    g.strokeRect(6, y + 6, W - 12, RH - 12);
    g.font = '700 50px Cinzel, Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 6;
    g.strokeStyle = 'rgba(30,16,6,0.8)';
    g.strokeText(text.toUpperCase(), W / 2, y + RH / 2 + 3);
    g.fillStyle = '#f7e2a8';
    g.fillText(text.toUpperCase(), W / 2, y + RH / 2 + 3);
  });
  // a wall of flags for the loft, drawn from the presets
  const y = RH * 3;
  g.fillStyle = '#4a2e18';
  g.fillRect(0, y, W, RH);
  [1, 3, 5, 2].forEach((pi, i) => {
    g.save();
    g.translate(14 + i * 125, y + 10);
    drawFlag(g, 110, 72, PRESETS[pi].look.flag);
    g.restore();
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function signGeo(w: number, h: number, row: number) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.getAttribute('uv');
  const v0 = 1 - (row + 1) / 4;
  const v1 = 1 - row / 4;
  for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) > 0.5 ? v1 : v0);
  return g;
}

// ------------------------------------------------------------------ text sprites

function glyphTexture(ch: string, color: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.font = '700 54px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 7;
  g.strokeStyle = 'rgba(20,12,6,0.85)';
  g.strokeText(ch, 32, 34);
  g.fillStyle = color;
  g.fillText(ch, 32, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------ the crowd

const CAST: PirateStyle[] = [
  // 0 barrel roller
  { shirt: 0xf1ead9, pants: 0x2d3f66, skin: 0xf0c39a, hat: 'bandana', hatColor: 0xc8352b, beard: null, patch: false, boots: 0x3a2618 },
  // 1 crate carrier
  { shirt: 0x5b8fb5, pants: 0x6b4a2b, skin: 0x8d5a3b, hat: 'none', hatColor: 0, beard: 0x1c1410, patch: false, boots: 0x2a1c12, girth: 1.12 },
  // 2 fisherman
  { shirt: 0xd9a441, pants: 0x3b4c3a, skin: 0xe8b48c, hat: 'tricorn', hatColor: 0x5a3a22, beard: 0xd8d0c4, patch: false, boots: 0x3a2618 },
  // 3 musician
  { shirt: 0x9c2a2a, pants: 0x262a36, skin: 0xc68a5e, hat: 'tricorn', hatColor: 0x1f1b1a, beard: 0x3a2416, patch: true, boots: 0x1d1612 },
  // 4 dancer
  { shirt: 0xf1ead9, pants: 0x7a3a8a, skin: 0xf3c9a5, hat: 'bandana', hatColor: 0x2f8ad8, beard: null, patch: false, boots: 0x3a2618 },
  // 5 drinker A
  { shirt: 0x2f6b47, pants: 0x4a3a2a, skin: 0xd59a6e, hat: 'none', hatColor: 0, beard: 0xa0461f, patch: false, boots: 0x2a1c12, girth: 1.18 },
  // 6 drinker B
  { shirt: 0xe9dcc0, pants: 0x1f3550, skin: 0x6e4630, hat: 'bandana', hatColor: 0xe0a13a, beard: null, patch: true, boots: 0x2a1c12 },
  // 7 painter
  { shirt: 0xf1ead9, pants: 0x3a5f8a, skin: 0xefc2a0, hat: 'bandana', hatColor: 0x2f6b47, beard: 0x5a3a22, patch: false, boots: 0x3a2618 },
  // 8 lookout
  { shirt: 0x27407a, pants: 0xd8c8a6, skin: 0xe2a77c, hat: 'tricorn', hatColor: 0x27407a, beard: null, patch: false, boots: 0x1d1612 },
  // 9 swabbie
  { shirt: 0xc8d6d2, pants: 0x8a5a32, skin: 0xa86e48, hat: 'bandana', hatColor: 0x9c2a2a, beard: null, patch: false, boots: 0x3a2618 },
  // 10 captain
  { shirt: 0x7a1f2b, pants: 0x1f1b1a, skin: 0xf0c7a4, hat: 'tricorn', hatColor: 0x141212, beard: 0x141212, patch: false, boots: 0x141212, girth: 1.08, flags: FLAG.coat | FLAG.parrot | FLAG.plume },
  // 11 sleeper
  { shirt: 0xe9a23b, pants: 0x3a3634, skin: 0xd8a07a, hat: 'none', hatColor: 0, beard: 0x6b4a2b, patch: false, boots: 0x3a2618, girth: 1.22 },
];

interface Loop {
  curve: THREE.CatmullRomCurve3;
  len: number;
}

function loop(pts: [number, number][]): Loop {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, DECK, z)), true, 'centripetal');
  return { curve, len: curve.getLength() };
}

// ------------------------------------------------------------------ port

export type PortFocus = 'overview' | 'flag' | 'sails' | 'hull';

export class Port {
  /** Everything (static town in the local frame + world-space crowd). */
  readonly root = new THREE.Group();
  readonly group = new THREE.Group();
  readonly name: string;
  private crowd!: Crowd;
  private f!: Figure[];
  private ship: Ship | null = null;
  private zShip = 4;
  private time = 0;
  private flagTex!: THREE.CanvasTexture;
  private flagPivot = new THREE.Group();
  private awning!: THREE.Mesh;
  private bunting!: THREE.Mesh;
  private buntingSlots: number[] = [];
  private paintMat!: THREE.MeshStandardMaterial;
  private propMat!: THREE.MeshStandardMaterial;
  // animated bits
  private rollBarrel = new THREE.Group();
  private rollSpin = new THREE.Group();
  private craneBoom = new THREE.Group();
  private craneLoad = new THREE.Group();
  private craneRope!: THREE.Line;
  private fishLine!: THREE.Line;
  private bobber!: THREE.Mesh;
  private rod = new THREE.Group();
  private accordion!: THREE.Mesh;
  private hammock = new THREE.Group();
  private rowboat = new THREE.Group();
  private ropes!: THREE.LineSegments;
  private gangplank!: THREE.Mesh;
  private notes: THREE.Sprite[] = [];
  private zzz: THREE.Sprite[] = [];
  private loops!: { roll: Loop; carry: Loop };
  private walk = { roll: 0, carry: 0, swab: 0, swabYaw: 0 };
  private smokeT = 0;
  private chimney = new THREE.Vector3();
  private local = new THREE.Vector3();
  private tmpQ = new THREE.Quaternion();

  constructor(
    readonly site: PortSite,
    private heightAt: (x: number, z: number) => number,
  ) {
    this.name = 'Puerto ' + site.island.name.replace(/^(Isla|Cayo|Punta|Bahía|Roca del|Arrecife)\s+/, '');
    this.group.position.set(site.x, 0, site.z);
    this.group.rotation.y = Math.atan2(site.nx, site.nz);
    this.group.updateMatrixWorld(true);
    this.root.add(this.group);
    this.root.visible = false;
    this.root.name = 'port';
  }

  get visible() {
    return this.root.visible;
  }

  set visible(v: boolean) {
    this.root.visible = v;
  }

  /** Local frame helpers. */
  toWorld(x: number, y: number, z: number, out = new THREE.Vector3()) {
    return out.set(x, y, z).applyMatrix4(this.group.matrixWorld);
  }

  private localHeight(x: number, z: number) {
    const w = this.toWorld(x, 0, z, this.local);
    return this.heightAt(w.x, w.z);
  }

  /** Unit vector of local +x (along the quay, towards the tavern) in world space. */
  get along() {
    return new THREE.Vector3(this.site.nz, 0, -this.site.nx);
  }

  get outward() {
    return new THREE.Vector3(this.site.nx, 0, this.site.nz);
  }

  async build(look: ShipLook) {
    try {
      await Promise.race([document.fonts.load('700 50px Cinzel'), new Promise((r) => setTimeout(r, 1200))]);
    } catch {
      // fall back to Georgia
    }
    const b = new Builder();
    const wood = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, envMapIntensity: 0.8 }), { clouds: true, caustics: true });
    const iron = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.7, envMapIntensity: 1.2 }), { clouds: true });
    const gold = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 1, envMapIntensity: 1.6, emissive: new THREE.Color(0.35, 0.22, 0.03) }), { clouds: true });
    const glow = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.propMat = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, envMapIntensity: 0.9 }), { clouds: true });
    this.paintMat = patchMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, envMapIntensity: 1 }), { clouds: true });

    this.buildDeck(b);
    this.buildTavern(b, 19, -14.5);
    this.buildLoft(b, 3, -13.5);
    this.buildWarehouse(b, -18.5, -14.5);
    this.buildTower(b, 28.6, -3.2);
    this.buildProps(b);
    b.finish(this.group, { wood, iron, glow, gold });

    this.buildSigns();
    this.buildFlag();
    this.buildAwning(3, -13.5);
    this.buildBunting();
    this.buildPalms();
    this.buildCrane(-28, -1.8);
    this.buildCrowd();
    this.setLook(look);
    this.group.updateMatrixWorld(true);
  }

  // ---------------------------------------------------------------- quay

  private buildDeck(b: Builder) {
    const D = this.site.depth;
    const W = PORT_HALF_WIDTH * 2;
    const tex = deckTexture(41);
    tex.repeat.set(W / 4.2, D / 4.2);
    const deckMat = patchMaterial(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82, color: new THREE.Color(1.0, 0.94, 0.88) }), { clouds: true });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(W, 0.32, D), deckMat);
    slab.position.set(0, DECK - 0.16, -D / 2);
    slab.receiveShadow = true;
    slab.castShadow = true;
    this.group.add(slab);

    const rnd = mulberry32(17);
    // pilings with a weedy tide line, cross-braced along the front
    const pilePaint = (p: THREE.Vector3) => (p.y < 0.35 ? C.algae.clone().lerp(C.pile, smoothstep(-1.5, 0.35, p.y) * 0.4) : shade(C.pile, 0.9 + ((p.y * 3) % 1) * 0.04));
    const pile = (x: number, z: number) => {
      const lean = (rnd() - 0.5) * 0.05;
      b.cyl(0.21, 0.25, DECK + 9, [x, (DECK - 9) / 2 + 0.05, z], pilePaint, { rz: lean, seg: 7 });
      b.cyl(0.25, 0.25, 0.12, [x, DECK + 0.02, z], C.timberDark, { seg: 7 });
    };
    for (let x = -W / 2 + 0.3; x <= W / 2; x += 4) pile(x, -0.25);
    for (let z = -4; z > -D; z -= 4) {
      pile(-W / 2 + 0.3, z);
      pile(W / 2 - 0.3, z);
    }
    for (let z = -8; z > -D + 2; z -= 8) for (let x = -W / 2 + 6; x < W / 2 - 4; x += 8) pile(x + (rnd() - 0.5), z);
    for (let x = -W / 2 + 0.3; x < W / 2 - 4; x += 4) {
      const a = new THREE.Vector3(x, DECK - 0.45, -0.1);
      const c2 = new THREE.Vector3(x + 4, -0.9, -0.1);
      b.beam(a, c2, 0.07, C.pile);
      b.beam(new THREE.Vector3(x, -0.9, -0.1), new THREE.Vector3(x + 4, DECK - 0.45, -0.1), 0.07, C.pile);
    }
    // fender beam & cap rail along the front, kerbs along the sides
    b.box(W + 0.4, 0.5, 0.34, [0, DECK - 0.3, 0.08], C.timberDark, { r: 0.08 });
    b.box(W + 0.4, 0.14, 0.4, [0, DECK + 0.07, 0.05], shade(C.timber, 1.15), { r: 0.05 });
    for (const s of [-1, 1]) b.box(0.4, 0.14, D, [s * (W / 2 + 0.05), DECK + 0.07, -D / 2], shade(C.timber, 1.15), { r: 0.05 });
    // old tyres... no, rope fenders hanging on the front
    for (let x = -W / 2 + 2; x < W / 2; x += 6.5) b.add(new THREE.TorusGeometry(0.26, 0.11, 6, 12), [x, DECK - 0.55, 0.32], lin(0xc9b38a));
    // bollards
    for (const x of this.bollards()) {
      const prof: [number, number][] = [[0.24, 0], [0.22, 0.3], [0.16, 0.42], [0.2, 0.55], [0.26, 0.62], [0.01, 0.66]];
      b.add(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 10), [x, DECK + 0.08, -0.35], C.iron, { b: 'iron' });
    }
    // lantern posts
    for (const [x, z] of [[-10.5, -1.1], [9.5, -1.1], [24.2, -8.2], [-31, -8.5], [12.6, -9.6]] as [number, number][]) this.lantern(b, x, z, 3.3);
    // stairs down to the beach at the back
    const back = -D;
    for (let i = 0; i < 5; i++) b.box(3, 0.16, 0.5, [-4, DECK - 0.36 * i - 0.1, back - 0.25 - i * 0.48], shade(C.timber, 1.05 - i * 0.03), { r: 0.04 });
  }

  bollards() {
    return [-27, -19, -11, -3, 5, 13, 20.5];
  }

  private lantern(b: Builder, x: number, z: number, h: number) {
    b.cyl(0.09, 0.12, h, [x, DECK + h / 2, z], C.timberDark, { seg: 6 });
    b.box(0.08, 0.08, 0.7, [x, DECK + h - 0.1, z + 0.3], C.timberDark);
    const ly = DECK + h - 0.55;
    b.ball(0.17, [x, ly, z + 0.6], C.lamp, { b: 'glow', s: [1, 1.3, 1] });
    b.add(new THREE.ConeGeometry(0.24, 0.24, 6), [x, ly + 0.3, z + 0.6], C.iron, { b: 'iron' });
    b.cyl(0.14, 0.11, 0.08, [x, ly - 0.24, z + 0.6], C.iron, { b: 'iron' });
    b.cyl(0.01, 0.01, 0.2, [x, ly + 0.5, z + 0.6], C.iron, { b: 'iron' });
  }

  private siding(b: Builder, w: number, h: number, x: number, y0: number, z: number, col: THREE.Color, rows?: number) {
    const n = rows ?? Math.floor(h / 0.32);
    for (let i = 0; i < n; i++) b.box(w, 0.3, 0.06, [x, y0 + 0.16 + i * (h / n), z], shade(col, i % 2 ? 0.94 : 1.03));
  }

  private window(b: Builder, x: number, y: number, z: number, w: number, h: number, shutter: THREE.Color, flowers = false) {
    b.box(w + 0.26, h + 0.26, 0.14, [x, y, z], C.cream, { r: 0.05 });
    b.box(w, h, 0.06, [x, y, z + 0.05], C.glass, { b: 'glow' });
    b.box(0.07, h, 0.06, [x, y, z + 0.1], C.cream);
    b.box(w, 0.07, 0.06, [x, y, z + 0.1], C.cream);
    for (const s of [-1, 1]) {
      const g = new THREE.BoxGeometry(w * 0.5, h + 0.1, 0.06);
      g.translate((s * w * 0.25), 0, 0);
      g.rotateY(-s * 1.15);
      b.add(g, [x + s * (w / 2 + 0.13), y, z + 0.08], shutter);
    }
    if (flowers) {
      b.box(w + 0.3, 0.28, 0.34, [x, y - h / 2 - 0.26, z + 0.2], C.timber, { r: 0.05 });
      const cols = [lin(0xe8455a), lin(0xf5c542), lin(0xf08fb8), lin(0xffffff)];
      for (let i = 0; i < 7; i++) {
        b.ball(0.11, [x - w / 2 + 0.05 + (i / 6) * (w - 0.1), y - h / 2 - 0.06, z + 0.22 + (i % 2) * 0.06], i % 3 === 1 ? lin(0x3f8a3a) : cols[i % 4]);
      }
    }
  }

  private roofSlabs(b: Builder, w: number, span: number, rise: number, x: number, top: number, z: number, col: THREE.Color, ridgeAlongX: boolean) {
    const half = span / 2;
    const a = Math.atan2(rise, half);
    const len = (half + 0.55) / Math.cos(a);
    const shingle = (p: THREE.Vector3) => shade(col, Math.floor(p.y * 2.8) % 2 ? 0.9 : 1.05);
    for (const s of [-1, 1]) {
      const cx = (len / 2) * Math.cos(a) * s;
      const cy = top + rise - (len / 2) * Math.sin(a) + 0.14;
      if (ridgeAlongX) {
        const g = new RoundedBoxGeometry(w + 1.1, 0.26, len, 2, 0.1);
        g.rotateX(s * a);
        b.add(g, [x, cy, z + cx], shingle);
      } else {
        const g = new RoundedBoxGeometry(len, 0.26, w + 1.1, 2, 0.1);
        g.rotateZ(-s * a);
        b.add(g, [x + cx, cy, z], shingle);
      }
    }
    if (ridgeAlongX) b.cyl(0.18, 0.18, w + 1.3, [x, top + rise + 0.2, z], shade(col, 0.75), { rz: Math.PI / 2 });
    else b.cyl(0.18, 0.18, w + 1.3, [x, top + rise + 0.2, z], shade(col, 0.75), { rx: Math.PI / 2 });
  }

  // ---------------------------------------------------------------- buildings

  private buildTavern(b: Builder, cx: number, cz: number) {
    const W = 11;
    const D = 8;
    const y0 = DECK;
    const front = cz + D / 2;
    b.box(W, 3.6, D, [cx, y0 + 1.8, cz], C.ochre, { r: 0.1 });
    this.siding(b, W - 0.5, 3.4, cx, y0, front + 0.02, C.ochre);
    b.box(W + 0.8, 0.32, D + 0.8, [cx, y0 + 3.7, cz], C.timberDark, { r: 0.08 });
    b.box(W + 0.5, 3.0, D + 0.5, [cx, y0 + 5.35, cz], C.teal, { r: 0.1 });
    this.siding(b, W, 2.9, cx, y0 + 3.86, front + 0.28, C.teal);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.42, 6.9, 0.42, [cx + sx * (W / 2 + 0.05), y0 + 3.45, cz + sz * (D / 2 + 0.05)], C.timber, { r: 0.08 });
    const top = y0 + 6.85;
    b.gable(D + 0.5, 2.7, W + 0.5, [cx, top, cz], C.teal, true);
    this.roofSlabs(b, W, D + 0.5, 2.7, cx, top, cz, C.terracotta, true);
    // chimney
    b.box(1.0, 3.4, 1.0, [cx + 3.4, top + 2.0, cz - 1.6], (p) => shade(C.stone, 0.85 + ((Math.floor(p.y * 3) + Math.floor(p.x * 2)) % 2) * 0.12), { r: 0.08 });
    b.box(1.25, 0.22, 1.25, [cx + 3.4, top + 3.75, cz - 1.6], C.timberDark, { r: 0.05 });
    this.chimney.set(cx + 3.4, top + 4.0, cz - 1.6);
    // door, windows, sign
    b.box(1.8, 2.7, 0.18, [cx, y0 + 1.35, front + 0.06], C.cream, { r: 0.05 });
    b.box(1.45, 2.45, 0.12, [cx, y0 + 1.25, front + 0.1], C.door, { r: 0.04 });
    b.box(0.5, 0.42, 0.06, [cx, y0 + 1.9, front + 0.17], C.glass, { b: 'glow' });
    b.ball(0.07, [cx + 0.5, y0 + 1.2, front + 0.2], C.gold, { b: 'gold' });
    this.window(b, cx - 3.4, y0 + 1.75, front + 0.08, 1.3, 1.1, C.shutterBlue, true);
    this.window(b, cx + 3.4, y0 + 1.75, front + 0.08, 1.3, 1.1, C.shutterBlue, true);
    for (const wx of [-3.6, 0, 3.6]) this.window(b, cx + wx, y0 + 5.3, front + 0.32, 1.0, 1.0, C.shutterGreen, wx !== 0);
    // porch bench & barrels
    b.box(2.4, 0.12, 0.5, [cx - 3.4, y0 + 0.5, front + 0.6], C.timber, { r: 0.04 });
    for (const sx of [-1, 1]) b.box(0.12, 0.5, 0.45, [cx - 3.4 + sx * 1.05, y0 + 0.25, front + 0.6], C.timberDark);
  }

  private buildLoft(b: Builder, cx: number, cz: number) {
    const W = 9;
    const D = 7;
    const y0 = DECK;
    const back = cz - D / 2;
    b.box(W, 5.0, 0.4, [cx, y0 + 2.5, back], C.coral, { r: 0.08 });
    for (const s of [-1, 1]) {
      b.box(0.4, 4.7, D, [cx + s * (W / 2), y0 + 2.35, cz], C.coral, { r: 0.08 });
      b.box(0.5, 4.8, 0.5, [cx + s * (W / 2), y0 + 2.4, cz + D / 2], C.timber, { r: 0.08 });
    }
    this.siding(b, W - 0.6, 4.8, cx, y0, back + 0.22, C.coral);
    const slope = Math.atan2(1.3, D + 1);
    const len = Math.hypot(D + 1.4, 1.3);
    const shingle = (p: THREE.Vector3) => shade(C.moss, Math.floor(p.z * 1.6) % 2 ? 0.9 : 1.04);
    b.add(new RoundedBoxGeometry(W + 1.2, 0.26, len, 2, 0.1).rotateX(slope), [cx, y0 + 4.95, cz + 0.2], shingle);
    // workbench with paint pots, bolts of cloth on racks
    b.box(3.4, 0.14, 1.1, [cx - 1.0, y0 + 0.95, cz + 1.2], C.timber, { r: 0.04 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.12, 0.9, 0.12, [cx - 1.0 + sx * 1.5, y0 + 0.45, cz + 1.2 + sz * 0.42], C.timberDark);
    const pots = [0xc8352b, 0x2f8ad8, 0xf2c45a, 0x2f7d3a, 0xf3ecdc];
    pots.forEach((c, i) => {
      b.cyl(0.13, 0.12, 0.24, [cx - 2.2 + i * 0.5, y0 + 1.14, cz + 1.25 + (i % 2) * 0.2], C.iron, { b: 'iron' });
      b.cyl(0.115, 0.115, 0.02, [cx - 2.2 + i * 0.5, y0 + 1.265, cz + 1.25 + (i % 2) * 0.2], lin(c));
    });
    for (const [sy, cols] of [[1.4, [0xc8352b, 0xf3ecdc, 0x27407a, 0xf2c45a, 0x141212]], [2.7, [0x2f7d3a, 0xe98fb0, 0xf3ecdc, 0x1fa3a0, 0xe86a2c]]] as [number, number[]][]) {
      b.box(W - 1.4, 0.1, 0.8, [cx, y0 + sy, back + 0.65], C.timber);
      cols.forEach((c, i) => b.cyl(0.22, 0.22, 1.3, [cx - 3.0 + i * 1.5, y0 + sy + 0.27, back + 0.65], (p) => shade(lin(c), 0.92 + Math.abs(Math.sin(p.y * 40)) * 0.1), { rz: Math.PI / 2, seg: 10 }));
    }
    // treasure chest by the door, brimming
    const tx = cx + 5.6;
    const tz = cz + D / 2 + 1.7;
    b.box(1.2, 0.6, 0.75, [tx, y0 + 0.3, tz], C.door, { r: 0.06 });
    for (const sx of [-0.45, 0.45]) b.box(0.1, 0.64, 0.8, [tx + sx, y0 + 0.32, tz], C.gold, { b: 'gold' });
    const lid = new THREE.CylinderGeometry(0.38, 0.38, 1.2, 10, 1, false, 0, Math.PI);
    lid.rotateZ(Math.PI / 2);
    lid.translate(0, 0.0, 0.38);
    lid.rotateX(-1.9);
    b.add(lid, [tx, y0 + 0.62, tz - 0.38], C.door);
    b.ball(0.5, [tx, y0 + 0.6, tz], C.gold, { b: 'gold', s: [1.1, 0.42, 0.68] });
    const rnd = mulberry32(9);
    for (let i = 0; i < 9; i++) {
      const a = rnd() * TAU;
      b.cyl(0.1, 0.1, 0.03, [tx + Math.cos(a) * (0.8 + rnd() * 0.6), y0 + 0.02, tz + Math.sin(a) * (0.5 + rnd() * 0.5)], C.gold, { b: 'gold', rx: (rnd() - 0.5) * 0.4, seg: 10 });
    }
    // sign posts on the roof edge
    for (const sx of [-1.7, 1.7]) b.box(0.12, 1.5, 0.12, [cx + sx, y0 + 5.0, cz + D / 2 + 0.45], C.timberDark);
    // the shop flagpole on the roof
    const px = cx - W / 2 + 0.9;
    const pz = back + 0.6;
    b.cyl(0.07, 0.11, 7.2, [px, y0 + 5 + 3.6, pz], C.timberDark, { seg: 6 });
    b.ball(0.16, [px, y0 + 12.3, pz], C.gold, { b: 'gold' });
    this.flagPivot.position.set(px, y0 + 12.05, pz);
  }

  private buildWarehouse(b: Builder, cx: number, cz: number) {
    const W = 11;
    const D = 9;
    const y0 = DECK;
    const front = cz + D / 2;
    const H = 5.4;
    b.box(W, H, D, [cx, y0 + H / 2, cz], C.shedBlue, { r: 0.1 });
    this.siding(b, W - 0.5, H - 0.1, cx, y0, front + 0.02, C.shedBlue);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.4, H + 0.1, 0.4, [cx + sx * (W / 2 + 0.02), y0 + H / 2, cz + sz * (D / 2 + 0.02)], C.cream, { r: 0.08 });
    b.gable(W + 0.2, 3.0, D + 0.2, [cx, y0 + H, cz], C.shedBlue, false);
    this.roofSlabs(b, D, W + 0.2, 3.0, cx, y0 + H, cz, C.slate, false);
    // big doors, one ajar, a dark hold behind
    b.box(4.4, 4.0, 0.2, [cx, y0 + 2.0, front + 0.08], C.cream, { r: 0.05 });
    b.box(3.8, 3.7, 0.1, [cx, y0 + 1.85, front + 0.06], lin(0x0c0a08));
    const leaf = (s: number, open: number) => {
      const g = new THREE.BoxGeometry(1.9, 3.7, 0.12);
      g.translate(-s * 0.95, 0, 0);
      g.rotateY(s * open);
      b.add(g, [cx + s * 1.9, y0 + 1.85, front + 0.16], (p) => shade(C.door, Math.abs(Math.sin(p.x * 9)) > 0.9 ? 0.75 : 1));
    };
    leaf(-1, 0.12);
    leaf(1, 1.25);
    // porthole in the gable & hoist beam
    b.add(new THREE.TorusGeometry(0.5, 0.1, 6, 16), [cx, y0 + H + 1.65, front + 0.22], C.cream);
    b.cyl(0.45, 0.45, 0.06, [cx, y0 + H + 1.65, front + 0.18], lin(0x18222a), { rx: Math.PI / 2, seg: 16 });
    b.box(0.32, 0.32, 2.4, [cx, y0 + H + 2.45, front + 1.0], C.timber);
    b.add(new THREE.TorusGeometry(0.2, 0.06, 6, 12), [cx, y0 + H + 2.1, front + 2.0], C.iron, { b: 'iron', ry: Math.PI / 2 });
    b.cyl(0.025, 0.025, 2.5, [cx, y0 + H + 0.85, front + 2.0], lin(0xb79a6a), { seg: 4 });
    b.add(new THREE.TorusGeometry(0.12, 0.03, 4, 10, Math.PI * 1.4), [cx, y0 + H - 0.5, front + 2.0], C.iron, { b: 'iron' });
    // anchor leaning on the wall
    const ax = cx + W / 2 + 0.6;
    const az = front - 1.5;
    b.box(0.16, 2.4, 0.16, [ax, y0 + 1.2, az], C.iron, { b: 'iron', rz: 0.2 });
    b.box(1.2, 0.14, 0.14, [ax - 0.38, y0 + 2.0, az], C.iron, { b: 'iron', rz: 0.2 });
    b.add(new THREE.TorusGeometry(0.75, 0.09, 6, 16, Math.PI), [ax + 0.22, y0 + 0.62, az], C.iron, { b: 'iron', rz: Math.PI + 0.2 });
  }

  private buildTower(b: Builder, cx: number, cz: number) {
    const H = 9;
    const y0 = DECK;
    const lo = 1.5;
    const hi = 1.2;
    const corners: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [sx, sz] of corners) b.beam(new THREE.Vector3(cx + sx * lo, y0, cz + sz * lo), new THREE.Vector3(cx + sx * hi, y0 + H, cz + sz * hi), 0.17, C.timber);
    for (let i = 0; i < 4; i++) {
      const [ax, az] = corners[i];
      const [bx, bz] = corners[(i + 1) % 4];
      for (const [ya, yb] of [[0.6, 4.6], [4.6, 8.6]]) {
        const ka = lo + (hi - lo) * (ya / H);
        const kb = lo + (hi - lo) * (yb / H);
        b.beam(new THREE.Vector3(cx + ax * ka, y0 + ya, cz + az * ka), new THREE.Vector3(cx + bx * kb, y0 + yb, cz + bz * kb), 0.06, C.timberDark);
        b.beam(new THREE.Vector3(cx + bx * ka, y0 + ya, cz + bz * ka), new THREE.Vector3(cx + ax * kb, y0 + yb, cz + az * kb), 0.06, C.timberDark);
      }
    }
    const py = y0 + H;
    b.box(3.6, 0.3, 3.6, [cx, py, cz], C.timber, { r: 0.08 });
    for (const [sx, sz] of corners) {
      b.box(0.14, 1.1, 0.14, [cx + sx * 1.7, py + 0.6, cz + sz * 1.7], C.timberDark);
      b.box(0.14, 2.3, 0.14, [cx + sx * 1.55, py + 1.3, cz + sz * 1.55], C.timberDark);
    }
    for (const s of [-1, 1]) {
      b.box(3.5, 0.1, 0.1, [cx, py + 1.1, cz + s * 1.7], C.timber);
      b.box(0.1, 0.1, 3.5, [cx + s * 1.7, py + 1.1, cz], C.timber);
    }
    b.add(new THREE.ConeGeometry(2.9, 1.7, 4).rotateY(Math.PI / 4), [cx, py + 2.4 + 0.85, cz], (p) => shade(C.terracotta, Math.floor(p.y * 2.5) % 2 ? 0.9 : 1.05), { flat: true });
    b.ball(0.18, [cx, py + 4.25, cz], C.gold, { b: 'gold' });
    b.ball(0.24, [cx, py + 1.85, cz], C.lamp, { b: 'glow', s: [1, 1.25, 1] });
    b.add(new THREE.ConeGeometry(0.3, 0.26, 6), [cx, py + 2.2, cz], C.iron, { b: 'iron' });
    // ladder on the front
    for (const s of [-1, 1]) b.beam(new THREE.Vector3(cx + s * 0.32, y0, cz + lo + 0.1), new THREE.Vector3(cx + s * 0.32, py + 0.2, cz + hi + 0.16), 0.045, C.timberDark);
    for (let y = 0.3; y < H; y += 0.36) {
      const k = lo + 0.1 + (hi + 0.06 - lo) * (y / H);
      b.box(0.64, 0.05, 0.05, [cx, y0 + y, cz + k], C.timber);
    }
    // a cannon guarding the harbour mouth, and its shot
    const gx = cx - 3.6;
    const gz = -1.6;
    b.box(1.0, 0.36, 1.5, [gx, y0 + 0.28, gz], C.door, { r: 0.06 });
    for (const s of [-1, 1]) b.cyl(0.24, 0.24, 0.12, [gx + s * 0.55, y0 + 0.24, gz + (s > 0 ? 0.45 : -0.45) * 0], C.timberDark, { rz: Math.PI / 2, seg: 10 });
    b.add(new THREE.LatheGeometry([[0.22, 0], [0.2, 0.5], [0.16, 1.4], [0.19, 1.5], [0.19, 1.56], [0.01, 1.58]].map(([r, y]) => new THREE.Vector2(r, y)), 10).rotateX(Math.PI / 2 - 0.12), [gx, y0 + 0.62, gz - 0.55], C.iron, { b: 'iron' });
    let k = 0;
    for (let lvl = 0; lvl < 3; lvl++) {
      const n = 3 - lvl;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        b.ball(0.16, [gx - 1.6 + (i - (n - 1) / 2) * 0.33, y0 + 0.16 + lvl * 0.27, gz - 0.2 + (j - (n - 1) / 2) * 0.33], C.iron, { b: 'iron' });
        k++;
      }
    }
  }

  private buildProps(b: Builder) {
    const barrel = (x: number, z: number, h = 0.95, tilt = 0, ry = 0) => {
      const g = PropGeo.barrel(h, 0.37);
      g.rotateZ(tilt);
      g.rotateY(ry);
      g.translate(x, DECK + (tilt ? 0.37 : h / 2), z);
      b.parts.wood.push(g);
    };
    const crate = (x: number, y: number, z: number, s = 0.9, ry = 0) => {
      const g = PropGeo.crate(s);
      g.rotateY(ry);
      g.translate(x, DECK + y + s / 2, z);
      b.parts.wood.push(g);
    };
    // warehouse yard
    crate(-24.6, 0, -9.0, 1.1, 0.1);
    crate(-23.4, 0, -9.3, 1.0, -0.2);
    crate(-24.1, 1.1, -9.1, 0.9, 0.3);
    crate(-14.2, 0, -8.6, 0.9, 0.5);
    barrel(-12.8, -8.9);
    barrel(-13.4, -7.9, 0.95, Math.PI / 2, 0.4);
    // the barrel-roller's island of crates
    crate(-8.6, 0, -5.2, 1.0, 0.2);
    crate(-7.4, 0, -5.0, 0.9, -0.15);
    crate(-8.0, 0.95, -5.1, 0.8, 0.5);
    barrel(-6.3, -5.4, 0.9);
    // tavern porch
    barrel(14.6, -9.3);
    barrel(15.4, -9.6, 0.9);
    barrel(23.6, -9.4, 0.95, Math.PI / 2, 1.2);
    barrel(13.2, -6.4, 0.9); // the musician's seat
    // table & stools
    b.cyl(0.65, 0.65, 0.1, [21, DECK + 0.85, -5.6], C.timber, { seg: 14 });
    b.cyl(0.1, 0.16, 0.85, [21, DECK + 0.42, -5.6], C.timberDark);
    b.cyl(0.32, 0.36, 0.06, [21, DECK + 0.03, -5.6], C.timberDark, { seg: 10 });
    for (const sx of [-1.2, 1.2]) {
      b.cyl(0.27, 0.27, 0.08, [21 + sx, DECK + 0.5, -5.6], C.timber, { seg: 10 });
      b.cyl(0.07, 0.12, 0.5, [21 + sx, DECK + 0.25, -5.6], C.timberDark);
    }
    b.cyl(0.06, 0.08, 0.28, [21.1, DECK + 1.04, -5.4], lin(0x2d6b3a), { seg: 8 });
    b.cyl(0.025, 0.03, 0.12, [21.1, DECK + 1.24, -5.4], lin(0x2d6b3a), { seg: 6 });
    // rope coils by the bollards
    for (const x of [-19.8, 5.8, 13.8]) {
      for (let i = 0; i < 3; i++) b.add(new THREE.TorusGeometry(0.42 - i * 0.07, 0.07, 5, 14), [x, DECK + 0.06 + i * 0.12, -1.2], lin(0xc9a97a), { rx: Math.PI / 2 });
    }
    // planter rings for the deck palms
    for (const [x, z] of [[-11, -14], [-5.2, -14.4], [11.2, -19.5]]) {
      b.cyl(0.95, 1.05, 0.5, [x, DECK + 0.25, z], C.timber, { seg: 12 });
      b.cyl(0.85, 0.85, 0.05, [x, DECK + 0.47, z], lin(0xd8c49a), { seg: 12 });
    }
    // signpost
    b.cyl(0.08, 0.1, 2.6, [-0.2, DECK + 1.3, -7.6], C.timberDark, { seg: 6 });
    for (const [y, ry, c] of [[2.2, 0.3, C.cream], [1.85, -0.5, lin(0xe7b866)], [1.5, 2.6, lin(0x9fd3d0)]] as [number, number, THREE.Color][]) {
      const g = new THREE.BoxGeometry(1.1, 0.24, 0.06);
      g.translate(0.5, 0, 0);
      b.add(g, [-0.2, DECK + y, -7.6], c, { ry });
    }
  }

  private buildSigns() {
    const tex = signAtlas();
    const mat = patchMaterial(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, envMapIntensity: 0.6 }), { clouds: true });
    const add = (w: number, h: number, row: number, x: number, y: number, z: number, ry = 0) => {
      const m = new THREE.Mesh(signGeo(w, h, row), mat);
      m.position.set(x, y, z);
      m.rotation.y = ry;
      m.castShadow = true;
      this.group.add(m);
    };
    add(4.6, 0.86, 0, 19, DECK + 3.05, -10.28);
    add(4.4, 0.83, 1, 3, DECK + 5.55, -10.0 + 0.52);
    add(4.6, 0.86, 2, -18.5, DECK + 5.85, -10.0 + 0.24);
    add(4.6, 0.86, 3, 3, DECK + 3.95, -16.7);
  }

  private buildFlag() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 159;
    this.flagTex = new THREE.CanvasTexture(c);
    this.flagTex.colorSpace = THREE.SRGBColorSpace;
    this.flagTex.anisotropy = 4;
    const mat = patchMaterial(new THREE.MeshStandardMaterial({ map: this.flagTex, side: THREE.DoubleSide, roughness: 0.8, alphaTest: 0.5 }), { flag: true });
    const w = 4.6;
    const h = w * 0.62;
    const g = new THREE.PlaneGeometry(w, h, 18, 5);
    g.translate(w / 2, -h / 2, 0);
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true;
    this.flagPivot.add(m);
    this.group.add(this.flagPivot);
  }

  private buildAwning(cx: number, cz: number) {
    const W = 9.6;
    const g = new THREE.PlaneGeometry(W, 2.4, 24, 4);
    g.rotateX(-Math.PI / 2 + 0.42);
    // scalloped valance along the front edge
    const parts: THREE.BufferGeometry[] = [g.toNonIndexed()];
    for (let i = 0; i < 12; i++) {
      const d = new THREE.CircleGeometry(0.4, 10, Math.PI, Math.PI);
      d.translate(-W / 2 + 0.4 + i * (W - 0.8) / 11, -0.47, 1.1);
      parts.push(d.toNonIndexed());
    }
    for (const p of parts) for (const k of Object.keys(p.attributes)) if (k !== 'position' && k !== 'normal') p.deleteAttribute(k);
    const geo = mergeGeometries(parts)!;
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.getAttribute('position').count * 3), 3));
    const mat = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.85 }), { clouds: true });
    this.awning = new THREE.Mesh(geo, mat);
    this.awning.position.set(cx, DECK + 3.85, cz + 3.5 + 1.1);
    this.awning.castShadow = true;
    this.awning.receiveShadow = true;
    this.group.add(this.awning);
    // posts holding it up
    const post = patchMaterial(new THREE.MeshStandardMaterial({ color: C.timberDark, roughness: 0.8 }), { clouds: true });
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 3.4, 6), post);
      p.position.set(cx + s * 4.6, DECK + 1.7, cz + 3.5 + 2.1);
      p.castShadow = true;
      this.group.add(p);
    }
  }

  private buildBunting() {
    const lines: [THREE.Vector3, THREE.Vector3][] = [
      [new THREE.Vector3(13.4, DECK + 6.6, -10.2), new THREE.Vector3(27.3, DECK + 6.4, -1.9)],
      [new THREE.Vector3(7.5, DECK + 4.8, -10.0), new THREE.Vector3(13.4, DECK + 5.6, -10.2)],
      [new THREE.Vector3(-12.9, DECK + 5.7, -9.8), new THREE.Vector3(-1.6, DECK + 5.0, -9.6)],
      [new THREE.Vector3(-1.5, DECK + 4.4, -10.0), new THREE.Vector3(-10.5, DECK + 3.25, -0.6)],
    ];
    const pos: number[] = [];
    const rope: number[] = [];
    this.buntingSlots = [];
    const pt = (a: THREE.Vector3, c: THREE.Vector3, t: number) => a.clone().lerp(c, t).add(new THREE.Vector3(0, -Math.sin(t * Math.PI) * a.distanceTo(c) * 0.07, 0));
    let slot = 0;
    for (const [a, c] of lines) {
      const n = Math.floor(a.distanceTo(c) / 0.62);
      for (let i = 0; i <= n * 4; i++) {
        const p0 = pt(a, c, i / (n * 4));
        const p1 = pt(a, c, (i + 1) / (n * 4));
        if (i < n * 4) rope.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
      }
      for (let i = 0; i < n; i++) {
        const t0 = (i + 0.15) / n;
        const t1 = (i + 0.85) / n;
        const p0 = pt(a, c, t0);
        const p1 = pt(a, c, t1);
        const tip = pt(a, c, (t0 + t1) / 2).add(new THREE.Vector3(0, -0.5, 0));
        pos.push(p0.x, p0.y, p0.z, tip.x, tip.y, tip.z, p1.x, p1.y, p1.z);
        this.buntingSlots.push(slot++ % 4);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
    g.computeVertexNormals();
    const mat = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.85 }), { clouds: true });
    this.bunting = new THREE.Mesh(g, mat);
    this.bunting.castShadow = true;
    this.group.add(this.bunting);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(rope, 3));
    this.group.add(new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0x3a2a1c, transparent: true, opacity: 0.8 })));
  }

  private buildPalms() {
    const mat = patchMaterial(
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, side: THREE.DoubleSide, envMapIntensity: 0.8 }),
      { clouds: true, sway: 0.0028 },
    );
    const D = this.site.depth;
    const spots: [number, number, number, number, number][] = [
      // x, z, height, lean, rotY
      [-11, -14, 7.5, 1.4, 2.6],
      [-5.2, -14.4, 8.5, 1.8, 0.4],
      [11.2, -19.5, 9.5, 2.2, -0.6],
      [-30, -D - 4, 9, 2.0, 2.2],
      [-15, -D - 5, 10.5, 2.4, 1.2],
      [16, -D - 4.5, 8.5, 1.6, -1.0],
      [29, -D - 3, 9.5, 2.0, -0.4],
      [33.5, -12, 8, 1.5, -1.6],
    ];
    spots.forEach(([x, z, h, lean, ry], i) => {
      const onDeck = z > -D;
      const y = onDeck ? DECK + 0.45 : Math.max(this.localHeight(x, z), 0.2) - 0.2;
      const m = new THREE.Mesh(palmGeometry(h, lean, 31 + i * 7), mat);
      m.position.set(x, y, z);
      m.rotation.y = ry;
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
    });
  }

  private buildCrane(cx: number, cz: number) {
    const b = new Builder();
    const y0 = DECK;
    b.cyl(0.32, 0.4, 6.2, [cx, y0 + 3.1, cz], C.timber, { seg: 8 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      b.beam(new THREE.Vector3(cx + Math.cos(a) * 1.5, y0, cz + Math.sin(a) * 1.5), new THREE.Vector3(cx, y0 + 2.4, cz), 0.09, C.timberDark);
    }
    b.cyl(0.55, 0.55, 0.35, [cx, y0 + 0.18, cz], C.timberDark, { seg: 10 });
    const wood = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78 }), { clouds: true });
    const iron = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.7 }), { clouds: true });
    const glow = new THREE.MeshBasicMaterial({ vertexColors: true });
    const gold = iron;
    b.finish(this.group, { wood, iron, glow, gold });
    // the slewing boom
    const bb = new Builder();
    bb.beam(new THREE.Vector3(0, 0, -1.2), new THREE.Vector3(0, 2.6, 6.6), 0.15, C.timber);
    bb.beam(new THREE.Vector3(0, -0.6, 0), new THREE.Vector3(0, 2.4, 6.0), 0.07, C.timberDark);
    bb.box(1.0, 0.8, 0.9, [0, -0.1, -1.4], C.stone, { r: 0.1 });
    bb.cyl(0.42, 0.42, 0.5, [0, 0.3, 0], C.timberDark, { seg: 10 });
    bb.add(new THREE.TorusGeometry(0.22, 0.06, 6, 12), [0, 2.55, 6.6], C.iron, { b: 'iron', ry: Math.PI / 2 });
    bb.finish(this.craneBoom, { wood, iron, glow, gold });
    this.craneBoom.position.set(cx, y0 + 6.1, cz);
    this.group.add(this.craneBoom);
    const load = new THREE.Mesh(
      mergeGeometries([PropGeo.crate(0.95).translate(0, -0.6, 0), PropGeo.barrel(0.8, 0.3).rotateZ(Math.PI / 2).translate(0, -1.28, 0.25), PropGeo.barrel(0.8, 0.3).rotateZ(Math.PI / 2).translate(0, -1.28, -0.38)])!,
      this.propMat,
    );
    load.castShadow = true;
    this.craneLoad.add(load);
    this.craneBoom.add(this.craneLoad);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(15 * 3), 3));
    this.craneRope = new THREE.Line(rg, new THREE.LineBasicMaterial({ color: 0x3a2a1c }));
    this.craneRope.frustumCulled = false;
    this.craneBoom.add(this.craneRope);
  }

  // ---------------------------------------------------------------- crowd

  private prop(geo: THREE.BufferGeometry, parent: THREE.Object3D, mat: THREE.Material = this.propMat) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    parent.add(m);
    return m;
  }

  private buildCrowd() {
    this.crowd = new Crowd(CAST);
    this.root.add(this.crowd.group);
    const f = (this.f = this.crowd.figures);
    for (const fig of f) this.group.add(fig.root);
    this.loops = {
      roll: loop([[-11.5, -3.6], [-7.6, -2.6], [-3.6, -3.4], [-3.0, -6.0], [-6.5, -7.2], [-10.8, -6.8]]),
      carry: loop([[-25.2, -6.4], [-21.5, -3.4], [-16.2, -4.0], [-14.8, -6.4], [-18.6, -8.2]]),
    };
    // barrel being rolled
    this.prop(PropGeo.barrel(0.9, 0.36).rotateZ(Math.PI / 2), this.rollSpin);
    this.rollBarrel.add(this.rollSpin);
    this.group.add(this.rollBarrel);
    // crate overhead
    this.prop(PropGeo.crate(0.62).translate(0, 1.43, 0.05), f[1].hips);
    // fisherman's rod & line
    this.prop(PropGeo.rod(), this.rod);
    this.rod.position.set(0, 0.36, 0.38);
    this.rod.rotation.x = 0.95;
    f[2].hips.add(this.rod);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(10 * 3), 3));
    this.fishLine = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xf3ecdc, transparent: true, opacity: 0.7 }));
    this.fishLine.frustumCulled = false;
    this.group.add(this.fishLine);
    this.bobber = new THREE.Mesh(
      mergeGeometries([
        new THREE.SphereGeometry(0.11, 10, 8, 0, TAU, 0, Math.PI / 2).toNonIndexed(),
        new THREE.SphereGeometry(0.11, 10, 8, 0, TAU, Math.PI / 2, Math.PI / 2).toNonIndexed(),
      ].map((g, i) => {
        for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
        return colorize(g, i ? lin(0xf3ecdc) : lin(0xd8322a));
      }))!,
      this.propMat,
    );
    this.group.add(this.bobber);
    // accordion
    this.accordion = this.prop(PropGeo.accordion(), f[3].hips);
    this.accordion.position.set(0, 0.36, 0.42);
    // tankards
    for (const i of [5, 6]) f[i].prop = PROP.mug;
    // painter's brush: the tip takes your topsides colour
    const brush = new THREE.Group();
    this.prop(PropGeo.brush(1.7), brush);
    this.prop(PropGeo.brushTip(1.7), brush, this.paintMat);
    f[7].handR.add(brush);
    // lookout's spyglass
    f[8].prop = PROP.spyglass;
    // swabbie's mop
    const mop = this.prop(PropGeo.mop(), f[9].hips);
    mop.position.set(0, 0.32, 0.36);
    mop.rotation.x = 0.55;
    // rowboat for the painter, with a paint bucket
    this.buildRowboat();
    this.rowboat.add(f[7].root);
    f[7].root.position.set(0.15, -0.15, 0);
    // hammock between the deck palms
    this.buildHammock();
    // notes & snores
    const noteTex = glyphTexture('♪', '#ffe6a6');
    const zTex = glyphTexture('z', '#e8f4ff');
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: noteTex, alphaTest: 0.4, fog: true }));
      this.notes.push(s);
      this.group.add(s);
    }
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: zTex, alphaTest: 0.4, fog: true }));
      this.zzz.push(s);
      this.group.add(s);
    }
    // mooring lines & gangplank (follow the moored ship)
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(4 * 10 * 2 * 3), 3));
    this.ropes = new THREE.LineSegments(mg, new THREE.LineBasicMaterial({ color: 0x4a3626 }));
    this.ropes.frustumCulled = false;
    this.group.add(this.ropes);
    const plank = new THREE.BoxGeometry(0.9, 0.1, 1);
    plank.translate(0, 0, 0.5);
    const rails: THREE.BufferGeometry[] = [plank.toNonIndexed()];
    for (let i = 1; i < 6; i++) rails.push(new THREE.BoxGeometry(0.8, 0.05, 0.06).translate(0, 0.07, i / 6).toNonIndexed());
    const pg = mergeGeometries(rails.map((g) => colorize(g, C.timber)))!;
    this.gangplank = new THREE.Mesh(pg, this.propMat);
    this.gangplank.castShadow = true;
    this.group.add(this.gangplank);
  }

  private buildRowboat() {
    const parts: THREE.BufferGeometry[] = [];
    const hull = new THREE.SphereGeometry(1, 16, 6, 0, TAU, Math.PI / 2, Math.PI / 2);
    hull.scale(0.85, 0.5, 1.7);
    parts.push(colorize(hull, (p) => (p.y < -0.32 ? lin(0xf3ecdc) : lin(0x2f6f9a))));
    const rim: THREE.Vector3[] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      rim.push(new THREE.Vector3(Math.cos(a) * 0.83, 0.02, Math.sin(a) * 1.66));
    }
    parts.push(colorize(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim, true), 32, 0.06, 5, true), C.timberDark));
    parts.push(colorize(new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2).scale(0.72, 1, 1.5).translate(0, -0.24, 0), lin(0xa9814f)));
    for (const z of [-0.8, 0.85]) parts.push(colorize(new THREE.BoxGeometry(1.5, 0.06, 0.28).translate(0, -0.08, z), C.timber));
    // oars shipped along the sides
    for (const s of [-1, 1]) parts.push(colorize(new THREE.CylinderGeometry(0.03, 0.03, 2.6, 5).rotateX(Math.PI / 2).translate(s * 0.55, 0.05, 0), lin(0xc9a97a)));
    const m = new THREE.Mesh(mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!, this.propMat);
    m.castShadow = true;
    m.receiveShadow = true;
    this.rowboat.add(m);
    const bucket = new THREE.Mesh(colorize(new THREE.CylinderGeometry(0.17, 0.14, 0.3, 10).translate(-0.3, -0.08, -0.95), C.iron), this.propMat);
    this.rowboat.add(bucket);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.02, 10).translate(-0.3, 0.06, -0.95), this.paintMat);
    this.rowboat.add(top);
    this.group.add(this.rowboat);
  }

  private buildHammock() {
    const g = new THREE.PlaneGeometry(2.6, 1.0, 14, 5);
    g.rotateX(-Math.PI / 2);
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const u = x / 1.3;
      p.setY(i, -0.42 * (1 - u * u) + (z * 2) ** 2 * 0.22 * (1 - u * u * 0.6));
      p.setZ(i, z * (0.55 + 0.45 * Math.abs(u)));
    }
    g.computeVertexNormals();
    const cloth = colorize(g, (q) => (Math.floor((q.x + 1.3) * 2.3) % 2 ? lin(0xc8352b) : lin(0xf3ecdc)));
    const mat = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 }), { clouds: true });
    const m = new THREE.Mesh(cloth, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    this.hammock.add(m);
    // ropes to the trunks
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute([-1.3, 0, -0.25, -2.75, 0.55, 0, -1.3, 0, 0.25, -2.75, 0.55, 0, 1.3, 0, -0.25, 2.75, 0.55, 0, 1.3, 0, 0.25, 2.75, 0.55, 0], 3));
    this.hammock.add(new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0x5a4632 })));
    this.hammock.position.set(-8.1, DECK + 1.75, -14.2);
    this.hammock.rotation.y = -0.07;
    this.group.add(this.hammock);
    const s = this.f[11];
    this.hammock.add(s.root);
    // lying on his back, head towards +x
    s.root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)));
    s.root.position.set(-0.95, -0.2, 0);
  }

  // ---------------------------------------------------------------- look & ship

  setLook(look: ShipLook) {
    const g = this.flagTex.image as HTMLCanvasElement;
    drawFlag(g.getContext('2d')!, g.width, g.height, look.flag);
    this.flagTex.needsUpdate = true;
    this.paintMat.color.set(look.hull.topsides).convertSRGBToLinear();
    // awning: stripes in your sail colours
    const a = this.awning.geometry;
    const pos = a.getAttribute('position');
    const col = a.getAttribute('color') as THREE.BufferAttribute;
    const c0 = new THREE.Color(look.sail.cloth).convertSRGBToLinear();
    const c1 = new THREE.Color(look.sail.accent === look.sail.cloth ? look.flag.bg : look.sail.accent).convertSRGBToLinear();
    for (let i = 0; i < pos.count; i++) {
      const stripe = Math.floor((pos.getX(i) + 4.8) / 0.8 + 1e-4) % 2;
      const c = stripe ? c1 : c0;
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
    // bunting in your flag colours
    const bc = [look.flag.bg, look.flag.emblemColor, look.flag.patternColor, look.sail.accent].map((h) => new THREE.Color(h).convertSRGBToLinear());
    const bcol = this.bunting.geometry.getAttribute('color') as THREE.BufferAttribute;
    this.buntingSlots.forEach((s, i) => {
      for (let k = 0; k < 3; k++) bcol.setXYZ(i * 3 + k, bc[s].r, bc[s].g, bc[s].b);
    });
    bcol.needsUpdate = true;
  }

  /** Where a ship of this class ties up, in world space. */
  berth(beam: number) {
    const z = beam / 2 + 1.15;
    const p = this.toWorld(SHIP_X, 0, z);
    return { x: p.x, z: p.z, heading: Math.atan2(this.site.nz, -this.site.nx) };
  }

  setShip(ship: Ship | null) {
    this.ship = ship;
    if (!ship) return;
    const c = ship.cls;
    this.zShip = c.beam / 2 + 1.15;
    // painter's boat on the seaward side, near the bow quarter
    this.rowboat.position.set(SHIP_X + c.length * 0.12, 0, this.zShip + c.beam / 2 + 1.8);
    this.rowboat.rotation.y = Math.PI / 2;
  }

  /** Pins the moored ship to its berth. */
  pin(ship: Ship) {
    const b = this.berth(ship.cls.beam);
    ship.pos.set(b.x, 0, b.z);
    ship.heading = b.heading;
    ship.speed = 0;
  }

  // ---------------------------------------------------------------- update

  update(dt: number, world: World) {
    if (!this.root.visible || !this.crowd) return;
    this.time += dt;
    const t = this.time;
    const f = this.f;
    for (const fig of f) fig.rest();

    // -- 0: rolling a barrel round the crates
    {
      const L = this.loops.roll;
      this.walk.roll += dt * 1.05;
      const u = (this.walk.roll / L.len) % 1;
      const p = L.curve.getPointAt(u);
      const tan = L.curve.getTangentAt(u);
      const fig = f[0];
      fig.root.position.copy(p);
      fig.root.rotation.y = Math.atan2(tan.x, tan.z);
      fig.walk(this.walk.roll * 5.4, 0.8);
      fig.hips.rotation.x = 0.22;
      fig.armL.rotation.set(-1.25 + Math.sin(t * 5) * 0.05, 0, -0.15);
      fig.armR.rotation.set(-1.25 - Math.sin(t * 5) * 0.05, 0, 0.15);
      const ub = (u + 0.95 / L.len) % 1;
      const bp = L.curve.getPointAt(ub);
      const bt = L.curve.getTangentAt(ub);
      this.rollBarrel.position.set(bp.x, DECK + 0.38, bp.z);
      this.rollBarrel.rotation.y = Math.atan2(bt.x, bt.z);
      this.rollSpin.rotation.x = this.walk.roll / 0.38;
    }
    // -- 1: hauling a crate between the shed and the crane
    {
      const L = this.loops.carry;
      this.walk.carry += dt * 1.15;
      const u = (this.walk.carry / L.len) % 1;
      const p = L.curve.getPointAt(u);
      const tan = L.curve.getTangentAt(u);
      const fig = f[1];
      fig.root.position.copy(p);
      fig.root.rotation.y = Math.atan2(tan.x, tan.z);
      fig.walk(this.walk.carry * 5.2, 0.85);
      fig.armL.rotation.set(-2.85, 0, 0.32);
      fig.armR.rotation.set(-2.85, 0, -0.32);
      fig.head.rotation.x = 0.1;
    }
    // -- 2: fishing off the quay edge
    {
      const fig = f[2];
      fig.root.position.set(21.6, DECK + 0.02, 0.32);
      fig.root.rotation.y = 0.15;
      fig.hips.position.y = 0.12;
      fig.hips.rotation.x = -0.12;
      fig.legL.rotation.x = -0.25 + Math.sin(t * 1.6) * 0.28;
      fig.legR.rotation.x = -0.25 + Math.sin(t * 1.6 + 2.2) * 0.28;
      const cycle = t % 9;
      const bite = cycle > 7.2 ? Math.sin(((cycle - 7.2) / 1.8) * Math.PI) : 0;
      fig.armL.rotation.set(-1.0 - bite * 0.5, 0, -0.35);
      fig.armR.rotation.set(-1.0 - bite * 0.5, 0, 0.35);
      fig.head.rotation.x = 0.25 - bite * 0.3;
      fig.head.rotation.y = Math.sin(t * 0.3) * 0.2;
      this.rod.rotation.x = 0.95 - bite * 0.45;
      // bobber floats out front and dips on a bite
      const bx = 22.2;
      const bz = 6.2;
      const wy = world.waterHeight(...this.worldXZ(bx, bz));
      const dip = cycle > 6.6 && cycle < 7.2 ? Math.sin(((cycle - 6.6) / 0.6) * Math.PI * 3) * 0.12 : 0;
      this.bobber.position.set(bx, wy + 0.02 - dip, bz);
    }
    // -- 3: squeezebox on a barrel
    {
      const fig = f[3];
      fig.root.position.set(13.2, DECK, -6.4);
      fig.root.rotation.y = 0.55;
      fig.sit(0.9);
      fig.legR.rotation.x = -1.2 + Math.max(0, Math.sin(t * 8)) * 0.2;
      fig.legL.rotation.x = -1.1;
      const sq = Math.sin(t * 2.4);
      fig.armL.rotation.set(-0.95, 0, 0.42 + sq * 0.22);
      fig.armR.rotation.set(-0.95, 0, -0.42 - sq * 0.22);
      fig.hips.rotation.z = sq * 0.07;
      fig.head.rotation.z = Math.sin(t * 4) * 0.13;
      fig.head.rotation.x = -0.12;
      this.accordion.scale.x = 1 + sq * 0.28;
      this.notes.forEach((s, i) => {
        const ph = (t * 0.42 + i / 3) % 1;
        s.position.set(13.2 + Math.sin(ph * 6 + i * 2) * 0.35 + ph * 0.5, DECK + 2.2 + ph * 1.8, -6.2 + ph * 0.4);
        s.scale.setScalar(0.42 * Math.sin(Math.min(1, ph * 1.3) * Math.PI));
      });
    }
    // -- 4: dancing a jig to it
    {
      const fig = f[4];
      const hop = Math.abs(Math.sin(t * 5.2));
      fig.root.position.set(15.4 + Math.sin(t * 0.7) * 0.5, DECK, -4.6 + Math.cos(t * 0.7) * 0.3);
      fig.root.rotation.y = -1.2 + Math.sin(t * 0.9) * 1.1;
      fig.hips.position.y = HIP + hop * 0.16;
      fig.legL.rotation.x = Math.sin(t * 5.2) * 0.7;
      fig.legR.rotation.x = -Math.sin(t * 5.2) * 0.4;
      fig.legL.rotation.z = 0.1;
      fig.armL.rotation.set(0, 0, 2.5 + Math.sin(t * 5.2) * 0.35);
      fig.armR.rotation.set(-0.3, 0, -0.7 - Math.cos(t * 5.2) * 0.4);
      fig.head.rotation.z = Math.sin(t * 5.2) * 0.15;
    }
    // -- 5 & 6: a round at the tavern table
    for (const [i, x, ry, off] of [[5, 19.8, Math.PI / 2, 0], [6, 22.2, -Math.PI / 2, 1.9]] as [number, number, number, number][]) {
      const fig = f[i];
      fig.root.position.set(x, DECK, -5.6);
      fig.root.rotation.y = ry;
      fig.sit(0.5);
      const cyc = (t + off) % 4.4;
      const cheers = Math.floor((t + 0.5) / 13.2) % 1 === 0 && ((t + 0.5) % 13.2) < 1.6;
      let raise = cyc < 1.5 ? Math.sin((cyc / 1.5) * Math.PI) : 0;
      if (cheers) raise = 0;
      const clink = cheers ? Math.sin((((t + 0.5) % 13.2) / 1.6) * Math.PI) : 0;
      fig.armR.rotation.set(-0.75 - raise * 1.55 - clink * 1.1, 0, raise * 0.3 + clink * 0.35);
      fig.armL.rotation.set(-0.7, 0, 0.12);
      fig.head.rotation.x = -raise * 0.42;
      fig.hips.rotation.x = -raise * 0.08 + clink * 0.1;
      fig.hips.rotation.z = Math.sin(t * 1.3 + off) * 0.04;
    }
    // -- 7: touching up your topsides from a rowboat
    {
      const rb = this.rowboat;
      const [wx, wz] = this.worldXZ(rb.position.x, rb.position.z);
      rb.position.y = world.waterHeight(wx, wz) + 0.12;
      rb.rotation.z = Math.sin(t * 1.3) * 0.06;
      rb.rotation.x = Math.sin(t * 0.9 + 1) * 0.04;
      const fig = f[7];
      fig.root.rotation.y = Math.PI / 2; // facing the hull (towards -z in port space)
      const stroke = Math.sin(t * 1.7);
      fig.armR.rotation.set(-2.05 + stroke * 0.3, 0, 0.12);
      fig.armL.rotation.set(-1.75 + stroke * 0.3, 0, -0.18);
      fig.hips.rotation.x = -0.1 + stroke * 0.05;
      fig.head.rotation.x = -0.25;
    }
    // -- 8: lookout scanning the horizon
    {
      const fig = f[8];
      fig.root.position.set(28.6, DECK + 9.15, -3.2);
      fig.root.rotation.y = 0.6 + Math.sin(t * 0.22) * 1.1;
      // glass to the eye, the off hand steadying the draw tube
      fig.reach(false, 1.62, 0.32, 1.52);
      fig.reach(true, 1.25, 0.3, 1.55);
      fig.pose[P.handL] = 0.85;
      fig.pose[P.brow] = -0.35;
      fig.head.rotation.x = -0.05;
    }
    // -- 9: swabbing the deck
    {
      const fig = f[9];
      const span = 5.5;
      this.walk.swab += dt * 0.55;
      const s = this.walk.swab % (span * 2);
      const dir = s < span ? 1 : -1;
      const x = 0.5 + (s < span ? s : span * 2 - s);
      fig.root.position.set(x, DECK, -4.2);
      const target = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      this.walk.swabYaw += Math.atan2(Math.sin(target - this.walk.swabYaw), Math.cos(target - this.walk.swabYaw)) * damp(4, dt);
      fig.root.rotation.y = this.walk.swabYaw;
      fig.walk(this.walk.swab * 6, 0.45);
      const sw = Math.sin(t * 3.2);
      fig.hips.rotation.y = sw * 0.4;
      fig.hips.rotation.x = 0.25;
      fig.armL.rotation.set(-0.75, 0, -0.25);
      fig.armR.rotation.set(-0.85, 0, 0.25);
    }
    // -- 10: the harbourmaster, parrot and all
    {
      const fig = f[10];
      fig.root.position.set(7.4, DECK, -6.6);
      fig.root.rotation.y = 0.35;
      const cyc = t % 10;
      const point = cyc > 6.5 && cyc < 9.3 ? Math.sin(((cyc - 6.5) / 2.8) * Math.PI) : 0;
      fig.armL.rotation.set(0.35, 0, 0.75);
      fig.armR.rotation.set(0.35 * (1 - point) - point * 1.55, -point * 0.3, -0.75 * (1 - point) - point * 0.1);
      fig.head.rotation.y = -0.3 + Math.sin(t * 0.5) * 0.35 - point * 0.25;
      fig.hips.rotation.x = -0.05;
    }
    // -- 11: napping in the hammock
    {
      this.hammock.rotation.x = Math.sin(t * 0.85) * 0.12;
      const fig = f[11];
      fig.armL.rotation.set(-0.45, 0, -0.35);
      fig.armR.rotation.set(-0.45, 0, 0.35);
      fig.hips.position.y = HIP;
      fig.chest.scale.z = (fig.style.girth ?? 1) * (1 + Math.sin(t * 1.4) * 0.04);
      fig.head.rotation.x = -0.2;
      fig.head.rotation.y = 0.3;
      fig.root.updateMatrixWorld(true);
      const hp = fig.head.getWorldPosition(this.local);
      this.group.worldToLocal(hp);
      this.zzz.forEach((s, i) => {
        const ph = (t * 0.3 + i / 3) % 1;
        s.position.set(hp.x + ph * 0.6, hp.y + 0.3 + ph * 1.4, hp.z + Math.sin(ph * 5 + i) * 0.25);
        s.scale.setScalar((0.16 + ph * 0.3) * Math.sin(Math.min(1, ph * 1.2) * Math.PI));
      });
    }
    this.group.updateMatrixWorld(true);
    this.crowd.sync();

    // fishing line from rod tip to bobber
    {
      const tip = this.rod.localToWorld(this.local.set(0, 3.2, 0));
      this.group.worldToLocal(tip);
      const bp = this.bobber.position;
      const arr = this.fishLine.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < 10; i++) {
        const k = i / 9;
        arr.setXYZ(i, tip.x + (bp.x - tip.x) * k, tip.y + (bp.y + 0.08 - tip.y) * k - Math.sin(k * Math.PI) * 0.4, tip.z + (bp.z - tip.z) * k);
      }
      arr.needsUpdate = true;
    }

    // crane: swing out over the water, lower, haul up, swing back
    {
      const cyc = (t % 18) / 18;
      const swing = smoothstep(0.08, 0.32, cyc) - smoothstep(0.62, 0.86, cyc);
      const yaw = -2.3 + swing * 2.5;
      const prevYaw = this.craneBoom.rotation.y;
      this.craneBoom.rotation.y = yaw;
      const drop = smoothstep(0.34, 0.46, cyc) - smoothstep(0.48, 0.6, cyc);
      const low = cyc < 0.06 || cyc > 0.9 ? 1 - smoothstep(0, 0.06, cyc) + smoothstep(0.9, 1, cyc) : 0;
      const ropeLen = 2.4 + drop * 4.4 + low * 4.5;
      const sway = (yaw - prevYaw) / Math.max(dt, 1e-3);
      this.craneLoad.position.set(Math.sin(t * 2.1) * 0.05 + clamp(sway, -1, 1) * 0.25, 2.5 - ropeLen, 6.6);
      const arr = this.craneRope.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < 15; i++) {
        const k = i / 14;
        arr.setXYZ(i, this.craneLoad.position.x * k, 2.5 + (this.craneLoad.position.y - 2.5) * k, 6.6);
      }
      arr.needsUpdate = true;
    }

    // the shop flag flies downwind
    {
      const inv = this.tmpQ.copy(this.group.quaternion).invert();
      const wd = this.local.set(world.wind.dirX, 0, world.wind.dirZ).applyQuaternion(inv);
      this.flagPivot.rotation.y = Math.atan2(-wd.z, wd.x);
    }

    // chimney smoke
    this.smokeT += dt;
    if (this.smokeT > 0.28) {
      this.smokeT = 0;
      const p = this.toWorld(this.chimney.x, this.chimney.y, this.chimney.z);
      world.particles.emit({
        x: p.x + (Math.random() - 0.5) * 0.3, y: p.y, z: p.z + (Math.random() - 0.5) * 0.3,
        vx: world.wind.dirX * 1.1, vy: 1.3 + Math.random() * 0.5, vz: world.wind.dirZ * 1.1,
        life: 5 + Math.random() * 2, size: 0.7, sizeEnd: 3.4, color: [1.0, 0.98, 0.96], colorEnd: [0.9, 0.9, 0.92], alpha: 0.32, drag: 0.25, kind: 1, spin: (Math.random() - 0.5) * 0.3, fadeIn: 0.5,
      });
    }

    this.updateMooring();
  }

  private worldXZ(x: number, z: number): [number, number] {
    const p = this.toWorld(x, 0, z, this.local);
    return [p.x, p.z];
  }

  private updateMooring() {
    const ship = this.ship;
    const arr = this.ropes.geometry.getAttribute('position') as THREE.BufferAttribute;
    if (!ship) {
      this.ropes.visible = false;
      this.gangplank.visible = false;
      return;
    }
    this.ropes.visible = true;
    this.gangplank.visible = true;
    const s = ship.model.shape;
    const L = ship.cls.length;
    const m = ship.model.root.matrixWorld;
    const inv = new THREE.Matrix4().copy(this.group.matrixWorld).invert();
    const onShip = (t: number, up = 0.2) => new THREE.Vector3(s.halfBeam(t) * 0.8, s.top(t) + up, s.z(t)).applyMatrix4(m).applyMatrix4(inv);
    const bol = this.bollards();
    const nearest = (x: number) => bol.reduce((a, b2) => (Math.abs(b2 - x) < Math.abs(a - x) ? b2 : a));
    const pairs: [THREE.Vector3, THREE.Vector3][] = [
      [onShip(0.96), new THREE.Vector3(nearest(SHIP_X + L * 0.5 + 5), DECK + 0.6, -0.35)],
      [onShip(0.05), new THREE.Vector3(nearest(SHIP_X - L * 0.5 - 5), DECK + 0.6, -0.35)],
      [onShip(0.7), new THREE.Vector3(nearest(SHIP_X + L * 0.05), DECK + 0.6, -0.35)],
      [onShip(0.32), new THREE.Vector3(nearest(SHIP_X - L * 0.05), DECK + 0.6, -0.35)],
    ];
    let o = 0;
    for (const [a, b] of pairs) {
      const sag = a.distanceTo(b) * 0.06;
      for (let i = 0; i < 10; i++) {
        const k0 = i / 10;
        const k1 = (i + 1) / 10;
        arr.setXYZ(o++, a.x + (b.x - a.x) * k0, a.y + (b.y - a.y) * k0 - Math.sin(k0 * Math.PI) * sag, a.z + (b.z - a.z) * k0);
        arr.setXYZ(o++, a.x + (b.x - a.x) * k1, a.y + (b.y - a.y) * k1 - Math.sin(k1 * Math.PI) * sag, a.z + (b.z - a.z) * k1);
      }
    }
    arr.needsUpdate = true;
    // gangplank from the quay up to the rail amidships
    const top = new THREE.Vector3(s.halfBeam(0.45) * 0.95, s.mainDeckY(0.45) + ship.cls.bulwark, s.z(0.45)).applyMatrix4(m).applyMatrix4(inv);
    const foot = new THREE.Vector3(top.x, DECK + 0.08, -1.3);
    const len = foot.distanceTo(top);
    this.gangplank.position.copy(foot);
    this.gangplank.lookAt(this.local.copy(top).applyMatrix4(this.group.matrixWorld));
    this.gangplank.scale.set(1, 1, len);
  }

  // ---------------------------------------------------------------- camera

  /** A framing of the moored ship for the customizer tab. */
  shot(focus: PortFocus, ship: Ship, az: number, zoom: number) {
    const up = new THREE.Vector3(0, 1, 0);
    const c = new THREE.Vector3(ship.pos.x, 0, ship.pos.z);
    const L = ship.cls.length;
    const flagW = ship.model.flagPivot.getWorldPosition(new THREE.Vector3());
    const mastH = flagW.y;
    let look: THREE.Vector3;
    let dist: number;
    let elev: number;
    let a0: number;
    switch (focus) {
      case 'flag':
        look = flagW.clone().add(this.along.multiplyScalar(-1.2)).add(new THREE.Vector3(0, -1.2, 0));
        dist = 10 + L * 0.22;
        elev = 0.05;
        a0 = 0.35;
        break;
      case 'sails':
        look = c.clone().addScaledVector(up, mastH * 0.5);
        dist = L * 1.05 + 16;
        elev = 0.14;
        a0 = 0.32;
        break;
      case 'hull':
        look = c.clone().addScaledVector(up, 1.6);
        dist = L * 0.78 + 10;
        elev = 0.1;
        a0 = 0.42;
        break;
      default:
        look = c.clone().addScaledVector(up, mastH * 0.3).addScaledVector(this.along, 4);
        dist = L * 1.2 + 26;
        elev = 0.3;
        a0 = 0.48;
    }
    const a = a0 + az;
    const dir = this.outward.multiplyScalar(Math.cos(a)).addScaledVector(this.along, Math.sin(a));
    const pos = look
      .clone()
      .addScaledVector(dir, Math.cos(elev) * dist * zoom)
      .addScaledVector(up, Math.sin(elev) * dist * zoom);
    pos.y = Math.max(pos.y, 2.2);
    return { pos, look };
  }
}
