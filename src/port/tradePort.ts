import * as THREE from 'three';
import { staticLod } from '../render/staticLod';
import { skipWhenHidden } from '../render/staticScene';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { patchMaterial } from '../render/environment';
import { clamp, damp, mulberry32, smoothstep } from '../core/noise';
import { palmGeometry } from '../world/vegetation';
import { deckTexture } from '../ships/shipTextures';
import { FLAG, P, PROP } from '../ships/crewModel';
import type { Ship } from '../ships/ship';
import type { World } from '../game/world';
import { Carry, LOOT, LootId, Market, MarketTaste } from '../game/treasure';
import { Builder, C, colorize, DECK, lin, shade } from './port';
import { Crowd, Figure, HIP, PirateStyle, PropGeo } from './pirates';
import { PortSite } from './site';
import { Feast, FEASTS, festoonGeometry, lanternMaterial, Span } from './festival';

// The archipelago's trading ports: busy little market towns on stilts where
// plunder turns into gold. Each has its own colours, its own landmark and its
// own taste in goods, and a dozen townsfolk who keep their stalls, stroll the
// promenade, wave you in, ring the harbour bell and carry your cargo ashore
// piece by piece. Everything is built once at load (two levels of detail per
// town) and the townsfolk share one instanced crowd across all four ports.

const SHIP_X = -2;
/** The walkway porters use along the front of the quay. */
const LANE = -2.6;
const HALF = 28.5;
const TAU = Math.PI * 2;
/** Townsfolk per port: the thirteen who keep the town, and six more who only come out on a feast night. */
const FOLK = 19;
/** The first of the feast-night revellers. */
const REVELS = 13;
/** Where the ring dance turns, clear of the berth and the benches. */
const RING: [number, number] = [-17, -3.1];
/** Porters per port (figures 3..6). */
const PORTERS = 4;

type Signature = 'bank' | 'bazaar' | 'gallery' | 'distillery';

export interface TradeSpec {
  name: string;
  taste: MarketTaste;
  signature: Signature;
  /** Sign over the landmark's door. */
  house: string;
  wall: number;
  wall2: number;
  roof: number;
  trim: number;
  awning: [number, number];
  flag: [number, number, number];
}

export const TRADE_SPECS: TradeSpec[] = [
  {
    name: 'Porto Cinabre',
    signature: 'bazaar',
    house: 'Spice Bazaar',
    taste: { tagline: 'Spice merchants pay best for provisions and fine cloth.', mult: { provisions: 1.35, cloth: 1.25, spirits: 1.05, coin: 1, gems: 0.85, jewellery: 0.9, art: 0.8, relics: 0.9 } },
    wall: 0xe9a35c, wall2: 0xf2d5a2, roof: 0xb8402c, trim: 0xf7ecd2, awning: [0xc8352b, 0xf5c542], flag: [0xc8352b, 0xf5c542, 0xf7ecd2],
  },
  {
    name: 'Aguadouro',
    signature: 'bank',
    house: 'Counting House',
    taste: { tagline: 'The bankers here pay a fortune for gems, jewellery and coin.', mult: { coin: 1.12, gems: 1.35, jewellery: 1.3, relics: 1, art: 0.95, provisions: 0.8, cloth: 0.85, spirits: 0.85 } },
    wall: 0xf3ecdc, wall2: 0xb9d3dc, roof: 0x3d5f7a, trim: 0xe2b552, awning: [0x27407a, 0xf3ecdc], flag: [0x27407a, 0xe2b552, 0xf3ecdc],
  },
  {
    name: 'Sainte-Corália',
    signature: 'gallery',
    house: 'Curio Gallery',
    taste: { tagline: 'Collectors here chase art and old relics above all.', mult: { art: 1.45, relics: 1.3, jewellery: 1.1, gems: 0.95, coin: 1, provisions: 0.85, cloth: 0.95, spirits: 0.75 } },
    wall: 0xf2a99a, wall2: 0xfbefe2, roof: 0x2f8f8a, trim: 0xfff7ea, awning: [0x2f8f8a, 0xfbefe2], flag: [0x2f8f8a, 0xf2a99a, 0xfff7ea],
  },
  {
    name: 'Ronvliet',
    signature: 'distillery',
    house: 'Ronvliet Distillery',
    taste: { tagline: 'A thirsty town: spirits and provisions fetch top coin.', mult: { spirits: 1.5, provisions: 1.15, cloth: 1, coin: 1, gems: 0.85, jewellery: 0.85, art: 0.8, relics: 0.9 } },
    wall: 0xf0cf5e, wall2: 0x8fbf7a, roof: 0x6b3a2a, trim: 0xf6efd8, awning: [0x2f7d3a, 0xf6efd8], flag: [0x2f7d3a, 0xf0cf5e, 0x6b3a2a],
  },
  // Las Brumas
  {
    name: 'Vila Garoa',
    signature: 'bazaar',
    house: 'Tea & Silk Bazaar',
    taste: { tagline: 'Damp hills, dry throats: tea houses pay well for spirits, cloth and jewellery.', mult: { spirits: 1.35, cloth: 1.3, jewellery: 1.15, provisions: 1, coin: 0.95, gems: 0.95, art: 0.9, relics: 0.85 } },
    wall: 0xbfe0d0, wall2: 0xf4e6dc, roof: 0x3f6f62, trim: 0xfaf4ea, awning: [0xd9667a, 0xfaf4ea], flag: [0x3f6f62, 0xd9667a, 0xfaf4ea],
  },
  {
    name: 'Esmeraldeau',
    signature: 'gallery',
    house: 'Jade Carvers\' Gallery',
    taste: { tagline: 'The carvers of the mist buy relics, gems and old art to inspire their jade.', mult: { relics: 1.45, gems: 1.25, art: 1.2, jewellery: 1, coin: 0.95, provisions: 0.9, cloth: 0.85, spirits: 0.85 } },
    wall: 0xf3e7cf, wall2: 0xa9cdb8, roof: 0x7a3e52, trim: 0xfff8ec, awning: [0x2e8a6e, 0xf3e7cf], flag: [0x2e8a6e, 0xf3e7cf, 0x7a3e52],
  },
];

// ------------------------------------------------------------------ shared art

interface Kit {
  wood: THREE.Material;
  iron: THREE.Material;
  gold: THREE.Material;
  glow: THREE.Material;
  prop: THREE.MeshStandardMaterial;
  deck: THREE.MeshStandardMaterial;
  sign: THREE.MeshStandardMaterial;
  flag: THREE.MeshStandardMaterial;
  carry: Record<Carry, THREE.BufferGeometry>;
  plank: THREE.BufferGeometry;
  bell: THREE.BufferGeometry;
  bobber: THREE.BufferGeometry;
  rod: THREE.BufferGeometry;
}

const SIGN_W = 512;
const SIGN_H = 96;

/** One atlas for every port's signs (name, landmark, warehouse) and flags. */
function signAtlas(specs: TradeSpec[]) {
  const rows = specs.length * 3;
  const c = document.createElement('canvas');
  c.width = SIGN_W;
  c.height = SIGN_H * rows;
  const g = c.getContext('2d')!;
  const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
  specs.forEach((sp, i) => {
    [sp.name, sp.house, 'Warehouse'].forEach((text, k) => {
      const y = (i * 3 + k) * SIGN_H;
      const grad = g.createLinearGradient(0, y, 0, y + SIGN_H);
      grad.addColorStop(0, k === 0 ? '#2a1a10' : '#6d4628');
      grad.addColorStop(1, k === 0 ? '#120b06' : '#4a2e18');
      g.fillStyle = grad;
      g.fillRect(0, y, SIGN_W, SIGN_H);
      g.strokeStyle = k === 0 ? hex(sp.trim === 0xe2b552 ? 0xffd263 : 0xe2b552) : '#e2b552';
      g.lineWidth = 5;
      g.strokeRect(6, y + 6, SIGN_W - 12, SIGN_H - 12);
      g.font = `700 ${text.length > 15 ? 40 : 50}px Cinzel, Georgia, serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 6;
      g.strokeStyle = 'rgba(30,16,6,0.8)';
      g.strokeText(text.toUpperCase(), SIGN_W / 2, y + SIGN_H / 2 + 3);
      g.fillStyle = k === 0 ? '#ffe39a' : '#f7e2a8';
      g.fillText(text.toUpperCase(), SIGN_W / 2, y + SIGN_H / 2 + 3);
    });
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Town flags: three bands and a gold coin, one row per port. */
function flagAtlas(specs: TradeSpec[]) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 160 * specs.length;
  const g = c.getContext('2d')!;
  const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
  specs.forEach((sp, i) => {
    const y = i * 160;
    const [a, b, d] = sp.flag;
    g.fillStyle = hex(a);
    g.fillRect(0, y, 256, 160);
    g.fillStyle = hex(d);
    g.fillRect(0, y + 56, 256, 48);
    g.fillStyle = hex(b);
    g.fillRect(0, y + 66, 256, 28);
    g.beginPath();
    g.arc(78, y + 80, 34, 0, TAU);
    g.fillStyle = '#f2c45a';
    g.fill();
    g.lineWidth = 6;
    g.strokeStyle = '#8a5a12';
    g.stroke();
    g.font = '700 38px Cinzel, Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#8a5a12';
    g.fillText(sp.name[0], 78, y + 82);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function rowGeo(geo: THREE.BufferGeometry, row: number, rows: number) {
  const uv = geo.getAttribute('uv');
  const v0 = 1 - (row + 1) / rows;
  const v1 = 1 - row / rows;
  for (let i = 0; i < uv.count; i++) uv.setY(i, v0 + uv.getY(i) * (v1 - v0));
  return geo;
}

function carryGeometry(): Record<Carry, THREE.BufferGeometry> {
  const solid = (g: THREE.BufferGeometry, hex: number) => colorize(g, lin(hex));
  const sack = (() => {
    const body = new THREE.SphereGeometry(0.34, 12, 9);
    body.scale(1, 1.15, 0.8);
    const p = body.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const k = 1 + Math.max(0, -y) * 0.25 - Math.max(0, y - 0.25) * 1.2;
      p.setX(i, p.getX(i) * k);
      p.setZ(i, p.getZ(i) * k);
    }
    body.computeVertexNormals();
    return mergeGeometries([
      colorize(body, (q) => lin(0xc9a46a).multiplyScalar(0.88 + 0.12 * Math.abs(Math.sin(q.x * 40 + q.y * 30)))),
      solid(new THREE.CylinderGeometry(0.06, 0.08, 0.1, 8).translate(0, 0.4, 0), 0x8a6440),
      solid(new THREE.TorusGeometry(0.075, 0.02, 4, 10).rotateX(Math.PI / 2).translate(0, 0.37, 0), 0x5a3a20),
    ])!;
  })();
  const casket = (() => {
    const W = 0.56;
    const H = 0.3;
    const D = 0.38;
    const lid = new THREE.CylinderGeometry(D / 2, D / 2, W, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).translate(0, H / 2, 0);
    const parts = [solid(new THREE.BoxGeometry(W, H, D), 0x6a2c1c), solid(lid, 0x7d3a22)];
    for (const x of [-0.18, 0.18]) {
      parts.push(solid(new THREE.BoxGeometry(0.05, H + 0.02, D + 0.02).translate(x, 0, 0), 0xe8b64c));
      parts.push(solid(new THREE.CylinderGeometry(D / 2 + 0.012, D / 2 + 0.012, 0.05, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).translate(x, H / 2, 0), 0xe8b64c));
    }
    parts.push(solid(new THREE.BoxGeometry(0.1, 0.12, 0.03).translate(0, 0.08, D / 2 + 0.01), 0xffd263));
    return mergeGeometries(parts)!;
  })();
  const painting = (() => {
    const w = 0.95;
    const h = 0.7;
    const parts = [
      colorize(new THREE.BoxGeometry(w - 0.1, h - 0.1, 0.04), (q) => {
        // a little sunset seascape on the canvas
        const k = (q.y + h / 2) / h;
        if (k < 0.32) return lin(0x1d4f6e).lerp(lin(0x3f8fa8), k / 0.32);
        if (k < 0.36) return lin(0xffd38a);
        return lin(0xf3a35c).lerp(lin(0x6a4a8a), (k - 0.36) / 0.64);
      }),
    ];
    for (const [x, y, fw, fh] of [[0, h / 2 - 0.03, w, 0.07], [0, -h / 2 + 0.03, w, 0.07], [w / 2 - 0.03, 0, 0.07, h], [-w / 2 + 0.03, 0, 0.07, h]] as [number, number, number, number][]) {
      parts.push(solid(new RoundedBoxGeometry(fw, fh, 0.08, 1, 0.02).translate(x, y, 0.01), 0xd8a43c));
    }
    return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!;
  })();
  const idol = (() => {
    const parts = [
      solid(new THREE.CylinderGeometry(0.2, 0.24, 0.12, 10), 0xf2c45a),
      solid(new THREE.SphereGeometry(0.17, 10, 8).scale(1, 1.25, 0.9).translate(0, 0.24, 0), 0xf2c45a),
      solid(new RoundedBoxGeometry(0.26, 0.22, 0.22, 2, 0.06).translate(0, 0.5, 0), 0xf2c45a),
      solid(new THREE.BoxGeometry(0.34, 0.05, 0.05).translate(0, 0.62, 0), 0xe0a83a),
      solid(new THREE.OctahedronGeometry(0.035).translate(-0.06, 0.52, 0.11), 0x3cf0a0),
      solid(new THREE.OctahedronGeometry(0.035).translate(0.06, 0.52, 0.11), 0x3cf0a0),
    ];
    return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!;
  })();
  const barrel = PropGeo.barrel(0.8, 0.3);
  barrel.rotateZ(Math.PI / 2);
  return { crate: PropGeo.crate(0.6), barrel, sack, casket, painting, idol };
}

function makeKit(specs: TradeSpec[]): Kit {
  // the same material setups as the Shipwright's harbour, so no new shader is compiled
  const wood = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, envMapIntensity: 0.8 }), { clouds: true, caustics: true });
  const iron = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.7, envMapIntensity: 1.2 }), { clouds: true });
  const gold = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 1, envMapIntensity: 1.6, emissive: new THREE.Color(0.35, 0.22, 0.03) }), { clouds: true });
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true });
  const prop = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, envMapIntensity: 0.9 }), { clouds: true });
  const tex = deckTexture(57);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const deck = patchMaterial(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82, color: new THREE.Color(1.0, 0.94, 0.88) }), { clouds: true });
  const sign = patchMaterial(new THREE.MeshStandardMaterial({ map: signAtlas(specs), roughness: 0.7, envMapIntensity: 0.6 }), { clouds: true });
  const flag = patchMaterial(new THREE.MeshStandardMaterial({ map: flagAtlas(specs), side: THREE.DoubleSide, roughness: 0.8, alphaTest: 0.5 }), { flag: true });
  const plank = (() => {
    const g = new THREE.BoxGeometry(0.9, 0.1, 1);
    g.translate(0, 0, 0.5);
    const rails: THREE.BufferGeometry[] = [g.toNonIndexed()];
    for (let i = 1; i < 6; i++) rails.push(new THREE.BoxGeometry(0.8, 0.05, 0.06).translate(0, 0.07, i / 6).toNonIndexed());
    return mergeGeometries(rails.map((r) => colorize(r, C.timber)))!;
  })();
  const bell = mergeGeometries([
    colorize(new THREE.LatheGeometry([[0.02, 0], [0.16, -0.04], [0.2, -0.22], [0.28, -0.44], [0.3, -0.5], [0.01, -0.5]].map(([r, y]) => new THREE.Vector2(r, y)), 12), lin(0xf2c45a)),
    colorize(new THREE.SphereGeometry(0.06, 6, 4).translate(0, -0.48, 0), lin(0x8a5a12)),
  ])!;
  const bobber = mergeGeometries(
    [new THREE.SphereGeometry(0.11, 10, 8, 0, TAU, 0, Math.PI / 2), new THREE.SphereGeometry(0.11, 10, 8, 0, TAU, Math.PI / 2, Math.PI / 2)].map((g, i) => colorize(g, i ? lin(0xf3ecdc) : lin(0xd8322a))),
  )!;
  return { wood, iron, gold, glow, prop, deck, sign, flag, carry: carryGeometry(), plank, bell, bobber, rod: PropGeo.rod() };
}

// ------------------------------------------------------------------ townsfolk

type Role = 'merchant' | 'porter' | 'stroller' | 'kid' | 'harbourmaster' | 'musician' | 'fisher' | 'reveller';
const ROLES: Role[] = ['merchant', 'merchant', 'merchant', 'porter', 'porter', 'porter', 'porter', 'stroller', 'stroller', 'kid', 'harbourmaster', 'musician', 'fisher', 'reveller', 'reveller', 'reveller', 'reveller', 'reveller', 'reveller'];

function townStyle(role: Role, rnd: () => number, sp: TradeSpec): PirateStyle {
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length) % a.length];
  const skin = pick([0xf3c9a5, 0xe8b48c, 0xd59a6e, 0xc68a5e, 0xa86e48, 0x8d5a3b, 0x6e4630]);
  const shirt = pick([0xf1ead9, 0xe9dcc0, 0xc8d6d2, 0xf3ecdc, sp.wall2, sp.awning[0], 0x5b8fb5, 0xd9a441]);
  const pants = pick([0x2d3f66, 0x6b4a2b, 0x3b4c3a, 0x262a36, 0x4a3a2a, 0xd8c8a6, 0x3a5f8a]);
  const hair = pick([0x1b1512, 0x2e2018, 0x4a3020, 0x6b4325, 0x8a5a2b, 0x8d8a86, 0xd8d0c4]);
  const base: PirateStyle = { shirt, pants, skin, hat: 'none', hatColor: 0, beard: rnd() < 0.45 ? hair : null, patch: false, boots: pick([0x3a2618, 0x2a1c12, 0x1d1612]) };
  switch (role) {
    case 'merchant':
      return { ...base, hat: pick(['straw', 'none', 'knit'] as const), hatColor: pick([0xe8cf8a, 0x9c2a2a, 0x2f6b47]), girth: 1.05 + rnd() * 0.15, flags: FLAG.vest | (rnd() < 0.5 ? FLAG.cuffs : 0) };
    case 'porter':
      return { ...base, shirt: pick([0xf1ead9, 0xc8d6d2, 0xd9a441, 0x9c2a2a]), hat: pick(['bandana', 'knit', 'none'] as const), hatColor: pick([0xc8352b, 0x2f8ad8, 0x2f6b47, 0xe0a13a]), girth: 1.08 + rnd() * 0.14, flags: FLAG.rolled | (rnd() < 0.4 ? FLAG.barefoot : 0) };
    case 'stroller':
      return { ...base, hat: 'tricorn', hatColor: pick([0x1f1b1a, 0x27407a, 0x5a3a22]), flags: FLAG.coat | FLAG.cuffs | (rnd() < 0.5 ? FLAG.plume : 0) };
    case 'kid':
      return { ...base, beard: null, hat: rnd() < 0.5 ? 'straw' : 'none', hatColor: 0xe8cf8a, flags: FLAG.barefoot | FLAG.rolled };
    case 'harbourmaster':
      return { ...base, shirt: 0xf3ecdc, beard: 0xd8d0c4, hat: 'tricorn', hatColor: 0x141212, girth: 1.12, flags: FLAG.coat | FLAG.cuffs | FLAG.belt };
    case 'musician':
      return { ...base, hat: 'straw', hatColor: 0xe8cf8a, flags: FLAG.vest | FLAG.rolled };
    case 'fisher':
      return { ...base, hat: 'straw', hatColor: 0xd8c08a, flags: FLAG.rolled | FLAG.barefoot | FLAG.garters };
    case 'reveller':
      // in their feast-day best: bright shirts, a sash, a flower in the hat
      return { ...base, shirt: pick([0xf3ecdc, sp.awning[0], sp.awning[1], 0xe8455a, 0x2f8ad8, 0xf5c542]), hat: pick(['straw', 'bandana', 'none', 'tricorn'] as const), hatColor: pick([0xe8cf8a, 0xc8352b, sp.flag[0], 0x2f6b47]), flags: FLAG.belt | FLAG.kerchief | (rnd() < 0.5 ? FLAG.vest : FLAG.cuffs) | (rnd() < 0.3 ? FLAG.plume : 0) };
  }
}

/** A walk along straight legs, at a pace, with a stride phase and an easing heading. */
class Walker {
  x = 0;
  z = 0;
  yaw = 0;
  phase = 0;
  path: [number, number][] = [];
  moving = false;

  set(x: number, z: number, yaw = this.yaw) {
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.path.length = 0;
  }

  /** Straight there along the porters' lane: out to it, along it, then in. */
  route(tx: number, tz: number) {
    this.path.length = 0;
    if (Math.abs(tx - this.x) > 0.6) {
      if (Math.abs(this.z - LANE) > 0.3) this.path.push([this.x, LANE]);
      this.path.push([tx, LANE]);
    }
    this.path.push([tx, tz]);
  }

  /** Steps along the path; true once it is walked. */
  step(dt: number, speed: number) {
    this.moving = false;
    while (this.path.length) {
      const [tx, tz] = this.path[0];
      const dx = tx - this.x;
      const dz = tz - this.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.05) {
        this.path.shift();
        continue;
      }
      const s = Math.min(d, speed * dt);
      this.x += (dx / d) * s;
      this.z += (dz / d) * s;
      this.phase += s * 3.4;
      this.turn(Math.atan2(dx, dz), dt, 7);
      this.moving = true;
      return false;
    }
    return true;
  }

  turn(want: number, dt: number, rate = 5) {
    this.yaw += Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw)) * damp(rate, dt);
  }
}

/** The day-to-day moves update() hands to the feast-night choreography. */
interface Moves {
  place: (fig: Figure, x: number, z: number, yaw: number, y?: number) => void;
  hurrah: (fig: Figure, k: number) => void;
}

interface Job {
  id: LootId;
  /** Off the ship to the town, or supplies up the plank. */
  on: boolean;
}

interface Porter {
  fig: Figure;
  w: Walker;
  seat: [number, number];
  job: Job | null;
  stage: 'idle' | 'ready' | 'toA' | 'up' | 'grab' | 'down' | 'toB' | 'drop' | 'home';
  t: number;
  k: number; // along the gangplank, 0 foot .. 1 top
  props: Record<Carry, THREE.Mesh>;
  holding: Carry | null;
}

// ------------------------------------------------------------------ one port

export class TradePort {
  /** World placement; local frame inside: +x along the shore, +z to sea, quay edge at z = 0. */
  readonly group = new THREE.Group();
  readonly name: string;
  readonly market: Market;
  readonly figures: Figure[];
  private near = new THREE.Group();
  private far = new THREE.Group();
  private detail = true;
  private folkShown = true;
  private time = Math.random() * 100;
  private ship: Ship | null = null;
  private docked = false;
  private attention = 0;
  private cheerT = 0;
  private cheerLevel = 0;
  private bellT = 99;
  private bell = new THREE.Group();
  private warehouseDoor: [number, number] = [0, 0];
  private houseDoor: [number, number] = [0, 0];
  private stalls: number[] = [5.5, 11, 21];
  private walkers: Walker[] = [];
  private porters: Porter[] = [];
  private jobs: Job[] = [];
  private loops!: THREE.CatmullRomCurve3[];
  private loopLen: number[] = [];
  private loopT = [0, 0];
  private gangplank!: THREE.Mesh;
  private ropes!: THREE.LineSegments;
  private rod = new THREE.Group();
  private bobber!: THREE.Mesh;
  private fishLine!: THREE.Line;
  private chimney: THREE.Vector3 | null = null;
  private smokeT = 0;
  private flagPivot = new THREE.Group();
  private plankFoot = new THREE.Vector3();
  private plankTop = new THREE.Vector3();
  private v = new THREE.Vector3();
  private inv = new THREE.Matrix4();
  /** The town's own feast, and how far tonight's has got (0 an ordinary night .. 1 in full swing). */
  readonly feast: Feast;
  festive = 0;
  /** The lantern strings, their poles and the drummer's barrel: hidden till a feast. */
  private fest = new THREE.Group();
  private lanterns = lanternMaterial();
  /** Starts true so the first update puts the revellers (shown for the warm-up) away. */
  private revels = true;
  private ringRot = 0;
  private ringDir = 1;
  private ringT = 0;
  /** Since the last shell broke overhead (negative: one is on its way up). */
  private skyT = 99;
  /** Since the harbourmaster gave the signal for a rocket. */
  private fuseT = 99;
  /** Since the fisherman began to set a lantern boat down. */
  private relT = 99;
  /** A lantern boat set down on the water at a point (world), its paper one of the feast's colours. */
  onLantern: (at: THREE.Vector3) => void = () => {};
  /** Called as each piece of cargo reaches the town (or the ship). */
  onDelivered: (id: LootId, on: boolean, at: THREE.Vector3) => void = () => {};
  onBell: () => void = () => {};

  constructor(
    readonly site: PortSite,
    readonly spec: TradeSpec,
    readonly index: number,
    private kit: Kit,
    figures: Figure[],
    private heightAt: (x: number, z: number) => number,
  ) {
    this.name = spec.name;
    this.feast = FEASTS[index % FEASTS.length];
    this.market = new Market(spec.taste, index * 17 + 3);
    this.figures = figures;
    this.group.position.set(site.x, 0, site.z);
    this.group.rotation.y = Math.atan2(site.nx, site.nz);
    this.group.updateMatrixWorld(true);
    this.group.name = `trade-port-${index}`;
    this.group.add(this.near, this.far);
    this.far.visible = false;
    this.build();
    this.group.updateMatrixWorld(true);
    staticLod.add(this.near);
    staticLod.add(this.far);
    // the town far off, or the half of it swapped out by distance, skips the per-frame matrix walk
    for (const o of [this.group, this.near, this.far]) skipWhenHidden(o);
  }

  get x() {
    return this.site.x;
  }

  get z() {
    return this.site.z;
  }

  /** World → port frame. */
  toLocal(x: number, z: number, out = this.v) {
    this.inv.copy(this.group.matrixWorld).invert();
    return out.set(x, 0, z).applyMatrix4(this.inv);
  }

  toWorld(x: number, y: number, z: number, out = new THREE.Vector3()) {
    return out.set(x, y, z).applyMatrix4(this.group.matrixWorld);
  }

  private localHeight(x: number, z: number) {
    const w = this.toWorld(x, 0, z, this.v);
    return this.heightAt(w.x, w.z);
  }

  // ---------------------------------------------------------------- build

  private build() {
    const n = new Builder();
    const f = new Builder();
    const both = (fn: (b: Builder) => void) => {
      fn(n);
      fn(f);
    };
    const sp = this.spec;
    const D = this.site.depth;
    const back = -D + 0.8;
    this.buildDeck(n, f);
    // warehouse on the left, harbour office behind the berth, the town's landmark on the right
    this.warehouse(n, both, -17, back);
    this.office(n, both, -3.2, back);
    const front = this.landmark(n, both, 16, back);
    this.houseDoor = [16, front + 0.7];
    this.lighthouse(both, 26.2, -3.2);
    for (const x of this.stalls) this.stall(n, both, x, -5.6);
    this.props(n);
    for (const [x, z] of [[-25, -0.9], [-11, -0.9], [7.6, -0.9], [24, -7.5]] as [number, number][]) this.lantern(n, x, z, 3.2);
    n.finish(this.near, this.kit);
    f.finish(this.far, this.kit);
    for (const m of this.far.children as THREE.Mesh[]) m.castShadow = false;
    void sp;
    this.signs();
    this.flag();
    this.palms();
    this.extras();
    this.festoon();
  }

  /** The feast-night dressing: strings of paper lanterns criss-crossing the quay, from poles along its edge to the houses and down from the lighthouse. */
  private festoon() {
    const D = this.site.depth;
    const back = -D + 0.8;
    const wf = back + 7;
    const of = back + 6.2;
    const lf = back + 7;
    const Y = DECK;
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const poleX = [-27.6, -19.8, -12.6, -7.4, 2.4, 6.0, 13.6, 20.2, 27.4];
    const PZ = -0.85;
    const PH = 4.5;
    const top = poleX.map((x) => V(x, Y + PH - 0.12, PZ));
    const bank = this.spec.signature === 'bank';
    const W1 = V(-21.6, Y + 4.9, wf + 0.25);
    const W2 = V(-12.4, Y + 4.9, wf + 0.25);
    const HO = V(-17, Y + 6.75, wf + 1.95);
    const O1 = V(-7.0, Y + 4.5, of + 1.3);
    const O2 = V(0.6, Y + 4.5, of + 1.3);
    const L1 = bank ? V(12.3, Y + 5.5, lf + 1.75) : V(11.4, Y + 4.8, lf + 0.2);
    const L2 = bank ? V(19.7, Y + 5.5, lf + 1.75) : V(20.6, Y + 4.8, lf + 0.2);
    // from the lighthouse gallery's rail, fanning down to the quay like a maypole's ribbons
    const rim = (to: THREE.Vector3) => {
      const dx = to.x - 26.2;
      const dz = to.z + 3.2;
      const d = Math.hypot(dx, dz) || 1;
      return V(26.2 + (dx / d) * 1.45, Y + 8.85, -3.2 + (dz / d) * 1.45);
    };
    const pairs: [THREE.Vector3, THREE.Vector3][] = [];
    for (let i = 0; i + 1 < top.length; i++) pairs.push([top[i], top[i + 1]]);
    pairs.push(
      [top[0], W1], [top[1], HO], [top[2], W2], [HO, W1], [HO, W2], [top[3], O1], [top[4], O2], [top[5], L1], [top[6], L1], [top[7], L2], [W2, O1], [O2, L1],
      [rim(top[8]), top[8]], [rim(top[7]), top[7]], [rim(top[6]), top[6]], [rim(L2), L2],
    );
    const spans: Span[] = pairs.map(([a, b]) => ({ a, b, sag: 0.2 + a.distanceTo(b) * 0.045 }));
    const g = festoonGeometry(spans, this.feast.colors, 7 + this.index * 13);
    const lanterns = new THREE.Mesh(g.lanterns, this.lanterns);
    lanterns.name = 'feast-lanterns';
    const cords = new THREE.LineSegments(g.cords, lineMat(0x2a1d14, 0.75));
    // poles with pennants in the town's colours, and an upturned barrel for the drummer
    const sp = this.spec;
    const b = new Builder();
    poleX.forEach((x, i) => {
      b.cyl(0.06, 0.08, PH, [x, Y + PH / 2, PZ], C.timberDark, { seg: 6 });
      b.ball(0.1, [x, Y + PH + 0.04, PZ], C.gold, { b: 'gold' });
      b.add(new THREE.ConeGeometry(0.2, 0.7, 3).rotateZ(-Math.PI / 2).scale(1, 1, 0.14), [x + 0.41, Y + PH - 0.32, PZ], lin(sp.flag[i % 2]));
    });
    const drum = PropGeo.barrel(0.9, 0.36);
    drum.translate(-7.6, Y + 0.45, -6.0);
    b.parts.wood.push(drum);
    b.finish(this.fest, this.kit);
    for (const m of this.fest.children as THREE.Mesh[]) m.castShadow = false;
    this.fest.add(lanterns, cords);
    this.figures[18].prop = PROP.mug;
    this.fest.name = 'feast-dressing';
    this.fest.visible = false;
    skipWhenHidden(this.fest);
    this.group.add(this.fest);
  }

  private buildDeck(n: Builder, f: Builder) {
    const D = this.site.depth;
    const W = HALF * 2;
    const slab = new THREE.BoxGeometry(W, 0.32, D);
    const uv = slab.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (W / 4.2), uv.getY(i) * (D / 4.2));
    const deck = new THREE.Mesh(slab, this.kit.deck);
    deck.position.set(0, DECK - 0.16, -D / 2);
    deck.receiveShadow = true;
    deck.castShadow = true;
    this.group.add(deck);
    const rnd = mulberry32(31 + this.index * 7);
    const pilePaint = (p: THREE.Vector3) => (p.y < 0.35 ? C.algae.clone().lerp(C.pile, smoothstep(-1.5, 0.35, p.y) * 0.4) : shade(C.pile, 0.9 + ((p.y * 3) % 1) * 0.04));
    const pile = (b: Builder, x: number, z: number) => {
      b.cyl(0.21, 0.25, DECK + 9, [x, (DECK - 9) / 2 + 0.05, z], pilePaint, { rz: (rnd() - 0.5) * 0.05, seg: 7 });
    };
    for (let x = -W / 2 + 0.3; x <= W / 2; x += 4) {
      pile(n, x, -0.25);
      if (Math.round(x) % 8 === 0) pile(f, x, -0.25);
    }
    for (let z = -4; z > -D; z -= 4) {
      pile(n, -W / 2 + 0.3, z);
      pile(n, W / 2 - 0.3, z);
    }
    for (let x = -W / 2 + 0.3; x < W / 2 - 4; x += 4) {
      n.beam(new THREE.Vector3(x, DECK - 0.45, -0.1), new THREE.Vector3(x + 4, -0.9, -0.1), 0.07, C.pile);
      n.beam(new THREE.Vector3(x, -0.9, -0.1), new THREE.Vector3(x + 4, DECK - 0.45, -0.1), 0.07, C.pile);
    }
    for (const b of [n, f]) {
      b.box(W + 0.4, 0.5, 0.34, [0, DECK - 0.3, 0.08], C.timberDark, { r: 0.08 });
      b.box(W + 0.4, 0.14, 0.4, [0, DECK + 0.07, 0.05], shade(C.timber, 1.15), { r: 0.05 });
    }
    for (const s of [-1, 1]) n.box(0.4, 0.14, D, [s * (W / 2 + 0.05), DECK + 0.07, -D / 2], shade(C.timber, 1.15), { r: 0.05 });
    for (let x = -W / 2 + 2; x < W / 2; x += 6.5) n.add(new THREE.TorusGeometry(0.26, 0.11, 6, 12), [x, DECK - 0.55, 0.32], lin(0xc9b38a));
    for (const x of this.bollards()) {
      const prof: [number, number][] = [[0.24, 0], [0.22, 0.3], [0.16, 0.42], [0.2, 0.55], [0.26, 0.62], [0.01, 0.66]];
      n.add(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 10), [x, DECK + 0.08, -0.35], C.iron, { b: 'iron' });
    }
    // steps down to the beach at the back
    for (let i = 0; i < 5; i++) n.box(3, 0.16, 0.5, [-10, DECK - 0.36 * i - 0.1, -D - 0.25 - i * 0.48], shade(C.timber, 1.05 - i * 0.03), { r: 0.04 });
  }

  bollards() {
    return [-24, -16, -8, 0, 8, 16];
  }

  private lantern(b: Builder, x: number, z: number, h: number) {
    b.cyl(0.09, 0.12, h, [x, DECK + h / 2, z], C.timberDark, { seg: 6 });
    b.box(0.08, 0.08, 0.7, [x, DECK + h - 0.1, z + 0.3], C.timberDark);
    const ly = DECK + h - 0.55;
    b.ball(0.17, [x, ly, z + 0.6], C.lamp, { b: 'glow', s: [1, 1.3, 1] });
    b.add(new THREE.ConeGeometry(0.24, 0.24, 6), [x, ly + 0.3, z + 0.6], C.iron, { b: 'iron' });
    b.cyl(0.14, 0.11, 0.08, [x, ly - 0.24, z + 0.6], C.iron, { b: 'iron' });
  }

  private siding(b: Builder, w: number, h: number, x: number, y0: number, z: number, col: THREE.Color) {
    const n = Math.floor(h / 0.32);
    for (let i = 0; i < n; i++) b.box(w, 0.3, 0.06, [x, y0 + 0.16 + i * (h / n), z], shade(col, i % 2 ? 0.94 : 1.03));
  }

  private window(b: Builder, x: number, y: number, z: number, w: number, h: number, shutter: THREE.Color, flowers = false) {
    b.box(w + 0.26, h + 0.26, 0.14, [x, y, z], C.cream, { r: 0.05 });
    b.box(w, h, 0.06, [x, y, z + 0.05], C.glass, { b: 'glow' });
    b.box(0.07, h, 0.06, [x, y, z + 0.1], C.cream);
    b.box(w, 0.07, 0.06, [x, y, z + 0.1], C.cream);
    for (const s of [-1, 1]) {
      const g = new THREE.BoxGeometry(w * 0.5, h + 0.1, 0.06);
      g.translate(s * w * 0.25, 0, 0);
      g.rotateY(-s * 1.15);
      b.add(g, [x + s * (w / 2 + 0.13), y, z + 0.08], shutter);
    }
    if (flowers) {
      b.box(w + 0.3, 0.28, 0.34, [x, y - h / 2 - 0.26, z + 0.2], C.timber, { r: 0.05 });
      const cols = [lin(0xe8455a), lin(0xf5c542), lin(0xf08fb8), lin(0xffffff)];
      for (let i = 0; i < 7; i++) b.ball(0.11, [x - w / 2 + 0.05 + (i / 6) * (w - 0.1), y - h / 2 - 0.06, z + 0.22 + (i % 2) * 0.06], i % 3 === 1 ? lin(0x3f8a3a) : cols[i % 4]);
    }
  }

  /** A shingled gable roof over a w-wide, span-deep building (ridge along x). */
  private roof(b: Builder, w: number, span: number, rise: number, x: number, top: number, z: number, col: THREE.Color) {
    const half = span / 2;
    const a = Math.atan2(rise, half);
    const len = (half + 0.55) / Math.cos(a);
    const shingle = (p: THREE.Vector3) => shade(col, Math.floor(p.y * 2.8) % 2 ? 0.9 : 1.05);
    for (const s of [-1, 1]) {
      const g = new RoundedBoxGeometry(w + 1.1, 0.26, len, 2, 0.1);
      g.rotateX(s * a);
      b.add(g, [x, top + rise - (len / 2) * Math.sin(a) + 0.14, z + (len / 2) * Math.cos(a) * s], shingle);
    }
    b.cyl(0.18, 0.18, w + 1.3, [x, top + rise + 0.2, z], shade(col, 0.75), { rz: Math.PI / 2 });
  }

  private door(b: Builder, x: number, y0: number, z: number, w = 1.6, h = 2.5) {
    b.box(w + 0.3, h + 0.25, 0.18, [x, y0 + (h + 0.25) / 2, z], C.cream, { r: 0.05 });
    b.box(w, h, 0.12, [x, y0 + h / 2, z + 0.05], C.door, { r: 0.04 });
    b.ball(0.07, [x + w * 0.32, y0 + h * 0.45, z + 0.14], C.gold, { b: 'gold' });
  }

  private warehouse(n: Builder, both: (fn: (b: Builder) => void) => void, cx: number, back: number) {
    const sp = this.spec;
    const W = 10;
    const Dp = 7;
    const H = 5.2;
    const cz = back + Dp / 2;
    const front = back + Dp;
    const y0 = DECK;
    const wall = lin(sp.wall2);
    both((b) => b.box(W, H, Dp, [cx, y0 + H / 2, cz], wall, { r: 0.1 }));
    this.siding(n, W - 0.5, H - 0.1, cx, y0, front + 0.02, wall);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) n.box(0.4, H + 0.1, 0.4, [cx + sx * (W / 2 + 0.02), y0 + H / 2, cz + sz * (Dp / 2 + 0.02)], lin(sp.trim), { r: 0.08 });
    both((b) => b.gable(Dp + 0.2, 2.6, W + 0.2, [cx, y0 + H, cz], wall, true));
    both((b) => this.roof(b, W, Dp + 0.2, 2.6, cx, y0 + H, cz, lin(sp.roof)));
    // big doors, one ajar, a dark hold behind
    n.box(4.2, 3.9, 0.2, [cx, y0 + 1.95, front + 0.08], C.cream, { r: 0.05 });
    n.box(3.6, 3.6, 0.1, [cx, y0 + 1.8, front + 0.06], lin(0x0c0a08));
    const leaf = (s: number, open: number) => {
      const g = new THREE.BoxGeometry(1.8, 3.6, 0.12);
      g.translate(-s * 0.9, 0, 0);
      g.rotateY(s * open);
      n.add(g, [cx + s * 1.8, y0 + 1.8, front + 0.16], (p) => shade(C.door, Math.abs(Math.sin(p.x * 9)) > 0.9 ? 0.75 : 1));
    };
    leaf(-1, 0.25);
    leaf(1, 1.3);
    // hoist beam
    n.box(0.32, 0.32, 2.2, [cx, y0 + H + 1.6, front + 0.9], C.timber);
    n.add(new THREE.TorusGeometry(0.2, 0.06, 6, 12), [cx, y0 + H + 1.3, front + 1.8], C.iron, { b: 'iron', ry: Math.PI / 2 });
    this.warehouseDoor = [cx, front + 0.8];
  }

  private office(n: Builder, both: (fn: (b: Builder) => void) => void, cx: number, back: number) {
    const sp = this.spec;
    const W = 8.4;
    const Dp = 6.2;
    const cz = back + Dp / 2;
    const front = back + Dp;
    const y0 = DECK;
    const wall = lin(sp.wall);
    both((b) => {
      b.box(W, 3.4, Dp, [cx, y0 + 1.7, cz], wall, { r: 0.1 });
      b.box(W + 0.5, 3.0, Dp + 0.4, [cx, y0 + 5.0, cz], shade(wall, 0.92), { r: 0.1 });
      b.gable(Dp + 0.4, 2.4, W + 0.5, [cx, y0 + 6.5, cz], wall, true);
      this.roof(b, W + 0.4, Dp + 0.4, 2.4, cx, y0 + 6.5, cz, lin(sp.roof));
    });
    this.siding(n, W - 0.4, 3.2, cx, y0, front + 0.02, wall);
    n.box(W + 0.9, 0.3, Dp + 0.9, [cx, y0 + 3.5, cz], C.timberDark, { r: 0.08 });
    // balcony with a rail over the door
    n.box(W - 1.6, 0.16, 1.3, [cx, y0 + 3.62, front + 0.7], C.timber, { r: 0.04 });
    for (let i = 0; i <= 10; i++) n.box(0.07, 0.8, 0.07, [cx - (W - 1.8) / 2 + (i / 10) * (W - 1.8), y0 + 4.08, front + 1.3], C.cream);
    n.box(W - 1.6, 0.08, 0.1, [cx, y0 + 4.5, front + 1.3], lin(sp.trim));
    this.door(n, cx, y0, front + 0.04);
    this.window(n, cx - 2.6, y0 + 1.7, front + 0.08, 1.1, 1.0, lin(sp.roof), true);
    this.window(n, cx + 2.6, y0 + 1.7, front + 0.08, 1.1, 1.0, lin(sp.roof), true);
    for (const wx of [-2.4, 0, 2.4]) this.window(n, cx + wx, y0 + 5.1, front + 0.28, 0.9, 1.0, lin(sp.roof), false);
    // a clock in the gable
    const gy = y0 + 7.3;
    n.cyl(0.62, 0.62, 0.12, [cx, gy, front + 0.25], C.cream, { rx: Math.PI / 2, seg: 18 });
    n.add(new THREE.TorusGeometry(0.64, 0.07, 6, 20), [cx, gy, front + 0.3], C.gold, { b: 'gold' });
    n.box(0.06, 0.45, 0.04, [cx, gy + 0.18, front + 0.34], C.iron, { b: 'iron' });
    n.box(0.32, 0.06, 0.04, [cx + 0.14, gy, front + 0.34], C.iron, { b: 'iron' });
  }

  /** The town's landmark; returns its front face. */
  private landmark(n: Builder, both: (fn: (b: Builder) => void) => void, cx: number, back: number): number {
    const sp = this.spec;
    const wall = lin(sp.wall);
    const trim = lin(sp.trim);
    const roof = lin(sp.roof);
    const y0 = DECK;
    const W = 10;
    switch (sp.signature) {
      case 'bank': {
        const Dp = 7;
        const cz = back + Dp / 2;
        const front = back + Dp;
        both((b) => {
          b.box(W, 5.6, Dp, [cx, y0 + 2.8, cz], wall, { r: 0.08 });
          b.box(W + 0.6, 0.5, Dp + 0.6, [cx, y0 + 5.8, cz], trim, { r: 0.06 });
          // drum and golden dome
          b.cyl(2.3, 2.4, 1.4, [cx, y0 + 6.7, cz], wall, { seg: 20 });
          b.add(new THREE.SphereGeometry(2.35, 20, 10, 0, TAU, 0, Math.PI / 2), [cx, y0 + 7.4, cz], C.gold, { b: 'gold' });
          b.cyl(0.08, 0.12, 1.2, [cx, y0 + 10.2, cz], C.gold, { b: 'gold' });
        });
        n.ball(0.22, [cx, y0 + 10.9, cz], C.gold, { b: 'gold' });
        // portico: steps, columns and a pediment
        for (let i = 0; i < 3; i++) n.box(7.4 - i * 0.4, 0.16, 0.5, [cx, y0 + 0.08 + i * 0.16, front + 1.7 - i * 0.45], shade(C.stone, 1.25 - i * 0.05), { r: 0.03 });
        for (const k of [-3, -1, 1, 3]) {
          n.cyl(0.26, 0.3, 4.7, [cx + k * 0.95, y0 + 2.8, front + 1.0], C.cream, { seg: 12 });
          n.box(0.7, 0.2, 0.7, [cx + k * 0.95, y0 + 5.2, front + 1.0], trim);
        }
        n.box(7.6, 0.4, 1.8, [cx, y0 + 5.45, front + 0.85], C.cream, { r: 0.05 });
        n.gable(1.8, 1.3, 7.6, [cx, y0 + 5.65, front + 0.85], C.cream, true);
        this.door(n, cx, y0 + 0.48, front + 0.04, 1.7, 2.8);
        for (const wx of [-3.6, 3.6]) this.window(n, cx + wx, y0 + 3.0, front + 0.06, 0.9, 1.7, lin(0x27407a));
        return front + 1.7;
      }
      case 'bazaar': {
        const Dp = 7;
        const cz = back + Dp / 2;
        const front = back + Dp;
        both((b) => {
          b.box(W, 5.0, Dp, [cx, y0 + 2.5, cz], wall, { r: 0.12 });
          b.box(W + 0.4, 0.7, Dp + 0.4, [cx, y0 + 5.2, cz], trim, { r: 0.1 });
          for (const dx of [-2.8, 2.8]) {
            b.cyl(1.2, 1.25, 0.6, [cx + dx, y0 + 5.8, cz], trim, { seg: 14 });
            b.add(new THREE.SphereGeometry(1.25, 14, 8, 0, TAU, 0, Math.PI / 2).scale(1, 1.25, 1), [cx + dx, y0 + 6.1, cz], roof);
          }
        });
        for (const dx of [-2.8, 2.8]) n.add(new THREE.ConeGeometry(0.14, 0.8, 8), [cx + dx, y0 + 8.0, cz], C.gold, { b: 'gold' });
        // three horseshoe arches, dark inside, with spice sacks at their feet
        for (const k of [-1, 0, 1]) {
          const ax = cx + k * 3.1;
          n.box(2.1, 2.6, 0.1, [ax, y0 + 1.3, front + 0.02], lin(0x1a0e08));
          n.add(new THREE.CircleGeometry(1.05, 14, 0, Math.PI), [ax, y0 + 2.6, front + 0.03], lin(0x1a0e08));
          n.add(new THREE.TorusGeometry(1.15, 0.12, 6, 16, Math.PI), [ax, y0 + 2.6, front + 0.06], trim);
          for (const s of [-1, 1]) n.box(0.24, 2.6, 0.24, [ax + s * 1.15, y0 + 1.3, front + 0.06], trim);
        }
        const spice = [0xc8352b, 0xe8962a, 0xf5c542, 0x7a3a1a, 0x5a7a2a, 0xb84a6a];
        spice.forEach((c, i) => {
          const sx = cx - 4.2 + i * 1.65;
          n.cyl(0.32, 0.38, 0.6, [sx, y0 + 0.3, front + 0.75], lin(0xc9a46a), { seg: 10 });
          n.add(new THREE.SphereGeometry(0.3, 10, 6, 0, TAU, 0, Math.PI / 2).scale(1, 0.55, 1), [sx, y0 + 0.6, front + 0.75], lin(c));
        });
        // a striped awning out front
        const aw = new THREE.PlaneGeometry(W - 0.6, 2.0, 18, 2).rotateX(-Math.PI / 2 + 0.38);
        n.add(aw, [cx, y0 + 3.55, front + 0.95], (p) => (Math.floor((p.x + 20) / 0.9) % 2 ? lin(sp.awning[0]) : lin(sp.awning[1])));
        return front + 1.6;
      }
      case 'gallery': {
        const Dp = 7;
        const cz = back + Dp / 2;
        const front = back + Dp;
        both((b) => {
          b.box(W, 5.4, Dp, [cx, y0 + 2.7, cz], wall, { r: 0.1 });
          b.gable(Dp + 0.3, 2.8, W + 0.3, [cx, y0 + 5.4, cz], wall, false);
          // bell tower at the back corner, spire on top
          b.box(2.6, 9.6, 2.6, [cx + 3.4, y0 + 4.8, back + 1.4], lin(sp.wall2), { r: 0.08 });
          b.add(new THREE.ConeGeometry(2.0, 3.4, 4).rotateY(Math.PI / 4), [cx + 3.4, y0 + 11.3, back + 1.4], roof, { flat: true });
        });
        // the gable roof runs front to back
        both((b) => {
          const half = (W + 0.3) / 2;
          const a = Math.atan2(2.8, half);
          const len = (half + 0.55) / Math.cos(a);
          for (const s of [-1, 1]) {
            const g = new RoundedBoxGeometry(len, 0.26, Dp + 1.1, 2, 0.1);
            g.rotateZ(-s * a);
            b.add(g, [cx + (len / 2) * Math.cos(a) * s, y0 + 5.4 + 2.8 - (len / 2) * Math.sin(a) + 0.14, cz], (p) => shade(roof, Math.floor(p.y * 2.8) % 2 ? 0.9 : 1.05));
          }
        });
        // belfry openings and the bell
        for (const s of [-1, 1]) n.box(0.9, 1.5, 0.1, [cx + 3.4, y0 + 8.3, back + 1.4 + s * 1.32], lin(0x1a0e08));
        n.add(new THREE.LatheGeometry([[0.02, 0], [0.22, -0.06], [0.3, -0.35], [0.42, -0.7], [0.01, -0.7]].map(([r, y]) => new THREE.Vector2(r, y)), 12), [cx + 3.4, y0 + 8.9, back + 1.4], C.gold, { b: 'gold' });
        n.add(new THREE.TorusGeometry(0.2, 0.05, 4, 10), [cx + 3.4, y0 + 13.15, back + 1.4], C.gold, { b: 'gold' });
        // rose window, portal and two framed paintings on easels out front
        n.cyl(0.85, 0.85, 0.1, [cx, y0 + 6.3, front + 0.06], C.glass, { rx: Math.PI / 2, seg: 16, b: 'glow' });
        n.add(new THREE.TorusGeometry(0.9, 0.12, 6, 18), [cx, y0 + 6.3, front + 0.12], lin(sp.trim));
        this.door(n, cx, y0, front + 0.04, 1.9, 3.0);
        n.add(new THREE.TorusGeometry(1.0, 0.13, 6, 14, Math.PI), [cx, y0 + 3.0, front + 0.14], lin(sp.trim));
        for (const s of [-1, 1]) {
          const ex = cx + s * 3.2;
          for (const k of [-1, 1]) n.beam(new THREE.Vector3(ex + k * 0.4, y0, front + 1.3), new THREE.Vector3(ex, y0 + 1.9, front + 1.0), 0.04, C.timberDark);
          const pg = this.kit.carry.painting.clone();
          pg.rotateX(-0.2);
          pg.translate(ex, y0 + 1.45, front + 1.25);
          n.parts.wood.push(pg);
        }
        return front + 1.6;
      }
      case 'distillery': {
        const Dp = 7.2;
        const cz = back + Dp / 2;
        const front = back + Dp;
        const barn = lin(sp.roof).multiplyScalar(1.6);
        both((b) => {
          b.box(W, 4.8, Dp, [cx, y0 + 2.4, cz], barn, { r: 0.08 });
          b.gable(Dp + 0.2, 2.9, W + 0.2, [cx, y0 + 4.8, cz], barn, true);
          this.roof(b, W, Dp + 0.2, 2.9, cx, y0 + 4.8, cz, lin(0x3a2a22));
          // the tall brick chimney
          b.box(1.2, 11, 1.2, [cx - 3.6, y0 + 5.5, back + 1.2], (p) => shade(lin(0xa8523a), 0.85 + ((Math.floor(p.y * 3) + Math.floor(p.x * 2.5)) % 2) * 0.14), { r: 0.06 });
        });
        this.chimney = new THREE.Vector3(cx - 3.6, y0 + 11.2, back + 1.2);
        n.box(1.45, 0.3, 1.45, [cx - 3.6, y0 + 11, back + 1.2], C.timberDark, { r: 0.05 });
        this.siding(n, W - 0.5, 4.6, cx, y0, front + 0.02, barn);
        this.door(n, cx + 1.5, y0, front + 0.04, 2.6, 3.0);
        this.window(n, cx - 2.6, y0 + 2.2, front + 0.08, 1.2, 1.1, lin(sp.wall2), true);
        // copper still with its swan neck, and a pyramid of rum barrels
        const sx = cx + 5.6;
        const sz = front + 1.3;
        n.add(new THREE.SphereGeometry(1.0, 16, 10).scale(1, 1.1, 1), [sx, y0 + 1.15, sz], lin(0xc8743a), { b: 'gold' });
        n.cyl(0.25, 0.5, 1.1, [sx, y0 + 2.6, sz], lin(0xc8743a), { b: 'gold', seg: 12 });
        n.beam(new THREE.Vector3(sx, y0 + 3.1, sz), new THREE.Vector3(sx - 1.8, y0 + 2.4, sz - 0.2), 0.08, lin(0xc8743a), 'gold');
        n.cyl(0.42, 0.42, 1.2, [sx - 1.9, y0 + 1.6, sz - 0.2], C.timber, { seg: 10 });
        n.cyl(1.05, 1.05, 0.3, [sx, y0 + 0.15, sz], C.stone, { seg: 14 });
        for (let lvl = 0; lvl < 3; lvl++) {
          for (let i = 0; i < 3 - lvl; i++) {
            const g = PropGeo.barrel(0.95, 0.37);
            g.rotateZ(Math.PI / 2);
            g.rotateY(Math.PI / 2);
            g.translate(cx - 4.6 + i * 0.8 + lvl * 0.4, y0 + 0.37 + lvl * 0.66, front + 1.1);
            n.parts.wood.push(g);
          }
        }
        return front + 1.4;
      }
    }
  }

  private lighthouse(both: (fn: (b: Builder) => void) => void, cx: number, cz: number) {
    const H = 8.5;
    const y0 = DECK;
    const stripe = (p: THREE.Vector3) => (Math.floor((p.y - y0) / 1.4) % 2 ? lin(0xc8352b) : lin(0xf6f0e2));
    both((b) => {
      b.cyl(1.0, 1.45, H, [cx, y0 + H / 2, cz], stripe, { seg: 14 });
      b.cyl(1.5, 1.5, 0.25, [cx, y0 + H + 0.1, cz], C.timberDark, { seg: 14 });
      b.cyl(0.8, 0.8, 1.3, [cx, y0 + H + 0.9, cz], C.lamp, { seg: 12, b: 'glow' });
      b.add(new THREE.ConeGeometry(1.15, 1.2, 12), [cx, y0 + H + 2.15, cz], lin(this.spec.roof), { flat: true });
    });
  }

  /** A market stall: counter, posts, striped canopy and its wares. */
  private stall(n: Builder, both: (fn: (b: Builder) => void) => void, x: number, z: number) {
    const sp = this.spec;
    const i = this.stalls.indexOf(x);
    n.box(3.4, 0.95, 1.1, [x, DECK + 0.48, z], C.timber, { r: 0.05 });
    n.box(3.6, 0.1, 1.3, [x, DECK + 1.0, z], shade(C.timber, 1.2), { r: 0.03 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) n.box(0.12, 2.6, 0.12, [x + sx * 1.7, DECK + 1.3, z + sz * 0.62 - 0.35], C.timberDark);
    both((b) =>
      b.add(new THREE.PlaneGeometry(3.9, 2.2, 8, 1).rotateX(-Math.PI / 2 + 0.3), [x, DECK + 2.55, z - 0.3], (p) => (Math.floor((p.x + 20) / 0.49) % 2 ? lin(sp.awning[0]) : lin(sp.awning[1]))),
    );
    // valance
    for (let k = 0; k < 8; k++) n.add(new THREE.CircleGeometry(0.25, 8, Math.PI, Math.PI), [x - 1.72 + k * 0.49, DECK + 2.22, z + 0.76], k % 2 ? lin(sp.awning[0]) : lin(sp.awning[1]));
    const rnd = mulberry32(i * 13 + this.index * 5 + 1);
    const wares = (this.index + i) % 4;
    for (let k = 0; k < 14; k++) {
      const wx = x - 1.45 + (k % 7) * 0.48;
      const wz = z - 0.25 + Math.floor(k / 7) * 0.42;
      const y = DECK + 1.12;
      if (wares === 0) {
        // fruit: oranges, limes, bananas
        const c = [0xf08a24, 0x9ad04a, 0xf5d342, 0xd8322a][Math.floor(rnd() * 4)];
        for (let j = 0; j < 3; j++) n.ball(0.1, [wx + (j - 1) * 0.12, y + (j === 1 ? 0.12 : 0), wz], lin(c));
      } else if (wares === 1) {
        // fish laid on a cloth
        n.add(new THREE.SphereGeometry(0.12, 8, 5).scale(2.2, 0.55, 0.8), [wx, y, wz], lin(0xb8c8d0), { ry: rnd() });
      } else if (wares === 2) {
        // bolts of cloth
        n.cyl(0.12, 0.12, 0.42, [wx, y + 0.06, wz], lin([0xc8352b, 0x2f8ad8, 0xf5c542, 0x2f7d3a, 0xe98fb0][k % 5]), { rx: Math.PI / 2, seg: 8 });
      } else {
        // pots and jars
        n.add(new THREE.LatheGeometry([[0.01, 0], [0.12, 0.02], [0.15, 0.12], [0.08, 0.26], [0.09, 0.3], [0.01, 0.3]].map(([r, yy]) => new THREE.Vector2(r, yy)), 8), [wx, y - 0.04, wz], lin([0xc2583f, 0x3f9c98, 0xe9b864][k % 3]));
      }
    }
  }

  private props(n: Builder) {
    const barrel = (x: number, z: number, h = 0.95, tilt = 0, ry = 0) => {
      const g = PropGeo.barrel(h, 0.37);
      g.rotateZ(tilt);
      g.rotateY(ry);
      g.translate(x, DECK + (tilt ? 0.37 : h / 2), z);
      n.parts.wood.push(g);
    };
    const crate = (x: number, y: number, z: number, s = 0.9, ry = 0) => {
      const g = PropGeo.crate(s);
      g.rotateY(ry);
      g.translate(x, DECK + y + s / 2, z);
      n.parts.wood.push(g);
    };
    const [wx, wz] = this.warehouseDoor;
    // stacks by the warehouse doors
    crate(wx - 3.8, 0, wz - 0.3, 1.1, 0.1);
    crate(wx - 2.7, 0, wz - 0.5, 1.0, -0.2);
    crate(wx - 3.3, 1.1, wz - 0.4, 0.9, 0.3);
    barrel(wx + 3.0, wz - 0.4);
    barrel(wx + 3.8, wz - 0.6, 0.9);
    barrel(wx + 3.4, wz + 0.5, 0.95, Math.PI / 2, 0.4);
    // porters' benches: a plank across two barrels each
    for (const bx of [-22.9, -12.4]) {
      barrel(bx - 0.75, -5.2, 0.48);
      barrel(bx + 0.75, -5.2, 0.48);
      n.box(2.4, 0.08, 0.5, [bx, DECK + 0.52, -5.2], shade(C.timber, 1.1), { r: 0.03 });
    }
    // musician's barrel
    barrel(-9.5, -6.4, 0.85);
    // bell post by the harbourmaster
    const bx = 16.2;
    const bz = -2.0;
    for (const s of [-1, 1]) n.box(0.16, 2.9, 0.16, [bx + s * 0.55, DECK + 1.45, bz], C.timberDark);
    n.box(1.4, 0.18, 0.22, [bx, DECK + 2.9, bz], C.timber, { r: 0.03 });
    this.bell.position.set(bx, DECK + 2.82, bz);
    // planters with flowers
    for (const [x, z] of [[-7.5, -4.4], [2.0, -4.4]] as [number, number][]) {
      n.cyl(0.55, 0.62, 0.5, [x, DECK + 0.25, z], C.timber, { seg: 12 });
      const cols = [0xe8455a, 0xf5c542, 0xf08fb8, 0xffffff, 0x3f8a3a];
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * TAU;
        n.ball(0.13, [x + Math.cos(a) * 0.32, DECK + 0.6, z + Math.sin(a) * 0.32], lin(cols[k % 5]));
      }
      n.ball(0.32, [x, DECK + 0.62, z], lin(0x3f8a3a), { s: [1, 0.6, 1] });
    }
  }

  private signs() {
    const mat = this.kit.sign;
    const rows = TRADE_SPECS.length * 3;
    const D = this.site.depth;
    const back = -D + 0.8;
    const add = (w: number, h: number, row: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(rowGeo(new THREE.PlaneGeometry(w, h), this.index * 3 + row, rows), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      this.near.add(m);
    };
    add(5.6, 1.05, 0, -3.2, DECK + 3.0, back + 6.2 + 0.2);
    add(4.8, 0.9, 1, 16, DECK + (this.spec.signature === 'bank' ? 4.6 : 4.4), back + 7 + (this.spec.signature === 'bank' ? 1.95 : 0.25));
    add(4.0, 0.75, 2, -17, DECK + 4.4, back + 7.2);
    // the town's name also faces the sea on a board over the quay, readable from your deck
    const board = new THREE.Mesh(rowGeo(new THREE.PlaneGeometry(6.2, 1.16), this.index * 3, rows), mat);
    board.position.set(9.5, DECK + 3.1, -1.4);
    board.castShadow = true;
    this.near.add(board);
  }

  private flag() {
    const w = 3.2;
    const h = 2.0;
    const g = rowGeo(new THREE.PlaneGeometry(w, h, 14, 4), this.index, TRADE_SPECS.length);
    g.translate(w / 2, -h / 2, 0);
    const m = new THREE.Mesh(g, this.kit.flag);
    m.castShadow = true;
    this.flagPivot.add(m);
    const D = this.site.depth;
    // on a pole above the harbour office
    this.flagPivot.position.set(-6.2, DECK + 13.4, -D + 2.6);
    const pole = new THREE.Mesh(colorize(new THREE.CylinderGeometry(0.07, 0.1, 4.6, 6), C.timberDark), this.kit.wood);
    pole.position.set(-6.2, DECK + 11.3, -D + 2.6);
    pole.castShadow = true;
    this.group.add(pole, this.flagPivot);
  }

  private palms() {
    const mat = patchMaterialCache.palm ?? (patchMaterialCache.palm = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, side: THREE.DoubleSide, envMapIntensity: 0.8 }), { clouds: true, sway: 0.0028 }));
    const D = this.site.depth;
    const rnd = mulberry32(77 + this.index * 11);
    const spots: [number, number][] = [[-27, -D - 4], [-8, -D - 5], [8, -D - 4.5], [24, -D - 3.5], [-28.5, -D * 0.4], [29, -D * 0.6]];
    spots.forEach(([x, z], i) => {
      const y = Math.max(this.localHeight(x, z), 0.2) - 0.2;
      if (y < 0.1 && z < -D) return; // no beach there: leave it out
      const m = new THREE.Mesh(palmGeometry(8 + rnd() * 3, 1.4 + rnd(), 41 + i * 5 + this.index * 13), mat);
      m.position.set(x, z > -D ? DECK : y, z);
      m.rotation.y = rnd() * TAU;
      m.castShadow = true;
      m.receiveShadow = true;
      this.near.add(m);
    });
  }

  /** Moving parts: the bell, the fisherman's rod, mooring lines, the gangplank and the porters' loads. */
  private extras() {
    const k = this.kit;
    const bell = new THREE.Mesh(k.bell, k.gold);
    bell.castShadow = true;
    this.bell.add(bell);
    this.near.add(this.bell);
    const rodMesh = new THREE.Mesh(k.rod, k.prop);
    rodMesh.castShadow = true;
    this.rod.add(rodMesh);
    this.bobber = new THREE.Mesh(k.bobber, k.prop);
    this.near.add(this.bobber);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(10 * 3), 3));
    this.fishLine = new THREE.Line(lg, lineMat(0xf3ecdc, 0.7));
    this.fishLine.frustumCulled = false;
    this.near.add(this.fishLine);
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(4 * 10 * 2 * 3), 3));
    this.ropes = new THREE.LineSegments(mg, lineMat(0x4a3626, 1));
    this.ropes.frustumCulled = false;
    this.ropes.visible = false;
    this.group.add(this.ropes);
    this.gangplank = new THREE.Mesh(k.plank, k.prop);
    this.gangplank.castShadow = true;
    this.gangplank.visible = false;
    this.group.add(this.gangplank);

    // the townsfolk: skeletons live in the port frame
    const f = this.figures;
    for (const fig of f) {
      this.group.add(fig.root);
      // an idle town's skeletons (thirteen of them, fifteen joints each) stay
      // out of every per-frame walk until the town comes alive again
      skipWhenHidden(fig.root);
    }
    f[9].root.scale.setScalar(0.66); // the kid
    f[12].hips.add(this.rod);
    this.rod.position.set(0, 0.36, 0.38);
    this.rod.rotation.x = 0.95;
    f[11].prop = PROP.fiddle;
    f[10].prop = PROP.pipe;
    for (let i = 0; i < 4; i++) this.walkers.push(new Walker());
    // strollers' loops: one along the market front, one along the warehouse end
    this.loops = [
      new THREE.CatmullRomCurve3([[4, -1.9], [13, -1.6], [23, -2.2], [24.5, -3.8], [14, -4.0], [3.5, -3.6]].map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal'),
      new THREE.CatmullRomCurve3([[-26, -2.0], [-18, -1.6], [-9, -2.0], [-8.6, -3.7], [-17, -4.1], [-25.6, -3.8]].map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal'),
    ];
    this.loopLen = this.loops.map((c) => c.getLength());
    this.loopT = [Math.random() * this.loopLen[0], Math.random() * this.loopLen[1]];
    const seats: [number, number][] = [[-23.5, -5.2], [-22.3, -5.2], [-13.0, -5.2], [-11.8, -5.2]];
    for (let i = 0; i < PORTERS; i++) {
      const fig = f[3 + i];
      const props = {} as Record<Carry, THREE.Mesh>;
      for (const c of Object.keys(k.carry) as Carry[]) {
        const m = new THREE.Mesh(k.carry[c], c === 'idol' ? k.gold : k.prop);
        m.castShadow = true;
        m.visible = false;
        fig.hips.add(m);
        props[c] = m;
      }
      const w = new Walker();
      w.set(seats[i][0], seats[i][1], 0);
      this.porters.push({ fig, w, seat: seats[i], job: null, stage: 'idle', t: Math.random() * 5, k: 0, props, holding: null });
    }
  }

  // ---------------------------------------------------------------- docking

  /** Where a ship of this class ties up, in world space. */
  berth(beam: number) {
    const p = this.toWorld(SHIP_X, 0, beam / 2 + 1.15);
    return { x: p.x, z: p.z, heading: Math.atan2(this.site.nz, -this.site.nx) };
  }

  /** A ship off the quay's seaward face, close enough to come alongside. */
  inReach(x: number, z: number) {
    const l = this.toLocal(x, z);
    return l.z > 2 && l.z < 95 && Math.abs(l.x) < 60;
  }

  /** Distance from the quay's front to a point, roughly (for markers and attention). */
  distance(x: number, z: number) {
    const l = this.toLocal(x, z);
    return Math.hypot(Math.max(0, Math.abs(l.x) - HALF), Math.max(0, l.z, -this.site.depth - l.z));
  }

  /** A seaward point and heading to sail off from, clear of the quay. */
  castOff(beam: number) {
    const p = this.toWorld(SHIP_X + 14, 0, beam / 2 + 16);
    // bow along the quay, swung a little out to sea
    return { x: p.x, z: p.z, heading: Math.atan2(this.site.nz, -this.site.nx) - 0.7 };
  }

  /** Keeps hulls out of the pilings. */
  repel(ship: Ship) {
    const fx = Math.sin(ship.heading);
    const fz = Math.cos(ship.heading);
    const L = ship.cls.length;
    const D = this.site.depth;
    for (const k of [0.46, 0, -0.42]) {
      const l = this.toLocal(ship.pos.x + fx * L * k, ship.pos.z + fz * L * k);
      if (Math.abs(l.x) > HALF + 0.5 || l.z > 0.5 || l.z < -D - 0.5) continue;
      // push out the nearest way: to sea, or round the ends
      const out = [0.5 - l.z, HALF + 0.5 - l.x, l.x + HALF + 0.5];
      const m = Math.min(...out);
      const dir = out.indexOf(m);
      const ax = dir === 0 ? 0 : dir === 1 ? 1 : -1;
      const az = dir === 0 ? 1 : 0;
      const o = this.site;
      const wx = ax * o.nz + az * o.nx;
      const wz = -ax * o.nx + az * o.nz;
      const push = Math.min(m + 0.05, 1.5);
      ship.pos.x += wx * push;
      ship.pos.z += wz * push;
      ship.speed *= 0.92;
    }
  }

  /** Ties a ship up (or lets her go). */
  setShip(ship: Ship | null) {
    this.ship = ship;
    this.docked = !!ship;
    this.ropes.visible = this.gangplank.visible = !!ship;
    if (ship) this.bellT = 0;
    else {
      // whatever is still on the plank goes home
      this.jobs.length = 0;
      for (const p of this.porters) {
        if (p.stage !== 'idle') this.sendHome(p);
      }
    }
  }

  pin(ship: Ship) {
    const b = this.berth(ship.cls.beam);
    ship.pos.set(b.x, 0, b.z);
    ship.heading = b.heading;
    ship.speed = 0;
  }

  /** Porters carry these goods ashore (or supplies aboard), one trip each. */
  unload(goods: LootId[], on = false) {
    for (const id of goods.slice(0, 16)) this.jobs.push({ id, on });
  }

  /** Townsfolk throw up their arms: 1 a good sale, 2 a fortune. */
  cheer(level: number) {
    this.cheerT = 0;
    this.cheerLevel = Math.max(level, this.cheerT < 2.5 ? this.cheerLevel : 0);
  }

  /** The camera's view of a docked ship and the quay behind her. */
  shot(ship: Ship, az: number, zoom: number) {
    const L = ship.cls.length;
    const look = this.toWorld(SHIP_X + 4, DECK + 2.2, -2.5);
    const along = new THREE.Vector3(this.site.nz, 0, -this.site.nx);
    const out = new THREE.Vector3(this.site.nx, 0, this.site.nz);
    const a = 0.42 + az;
    const elev = 0.34;
    const dist = (34 + L * 0.85) * zoom;
    const dir = out.multiplyScalar(Math.cos(a)).addScaledVector(along, Math.sin(a));
    const pos = look.clone().addScaledVector(dir, Math.cos(elev) * dist);
    pos.y += Math.sin(elev) * dist;
    return { pos, look };
  }

  // ---------------------------------------------------------------- update

  /** Swaps the detailed town for its far shell (and back) by camera distance. */
  lod(cam: THREE.Vector3) {
    const d = Math.hypot(cam.x - this.site.x, cam.z - this.site.z);
    const want = this.detail ? d < 380 : d < 330;
    if (want !== this.detail) {
      this.detail = want;
      this.near.visible = want;
      this.far.visible = !want;
    }
    this.group.visible = d < 1650;
    const live = this.detail && this.group.visible;
    if (live !== this.folkShown) {
      this.folkShown = live;
      this.figures.forEach((f, i) => (f.root.visible = live && (i < REVELS || this.revels)));
    }
    this.fest.visible = this.detail && this.festive > 0.005;
    return d;
  }

  /** Every skeleton back in the walk (the warm-up poses them all); lod() puts the idle ones away again. */
  showFolk() {
    this.folkShown = true;
    for (const f of this.figures) f.root.visible = true;
  }

  /** Whether the feast-night crowd is out (the revellers are only drawn then). */
  get reveling() {
    return this.revels;
  }

  /** Whether a ship is tied up alongside. */
  get moored() {
    return this.docked;
  }

  /** A feast night's line for the market, or the town's usual one. */
  get tagline() {
    return this.festive > 0.5 ? `${this.feast.name} tonight: the whole town is out, and every merchant pays more.` : this.spec.taste.tagline;
  }

  /** Where the town's rockets go up from (port frame): the lighthouse gallery and the far end of the quay. */
  launchSpot(k: number, out = new THREE.Vector3()) {
    return k % 2 ? this.toWorld(-27.4, DECK + 0.6, -0.6, out) : this.toWorld(26.2, DECK + 9.2, -3.2, out);
  }

  /** The town's middle, a few metres up: where its lantern-light comes from. */
  glowAt(out = new THREE.Vector3()) {
    return this.toWorld(0, DECK + 6, -3.5, out);
  }

  /** A rocket going up: the harbourmaster gives the signal and everyone looks up for the break. */
  rocket(delay: number) {
    this.fuseT = 0;
    this.skyT = Math.min(this.skyT, -delay);
  }

  /** The fisherman leans down and sets a lantern boat on the water. */
  release() {
    if (this.relT > 2.2) this.relT = 0;
  }

  /** Whether the townsfolk are close enough to be drawn and animated. */
  get lively() {
    return this.detail && this.group.visible;
  }

  update(dt: number, world: World, player: Ship | null) {
    this.time += dt;
    const t = this.time;
    // how much the town has noticed you: from a long way out, and all of it once you're in
    const pd = player && player.alive ? this.distance(player.pos.x, player.pos.z) : Infinity;
    const want = this.docked ? 1 : 1 - smoothstep(70, 200, pd);
    this.attention += (want - this.attention) * damp(1.2, dt);
    this.cheerT += dt;
    this.bellT += dt;
    this.flagWind(world);
    this.smoke(dt, world);
    this.skyT += dt;
    this.fuseT += dt;
    this.lanterns.uniforms.uLit.value = this.festive * 1.04;
    const revels = this.festive > 0.3;
    if (revels !== this.revels) {
      this.revels = revels;
      for (let i = REVELS; i < this.figures.length; i++) this.figures[i].root.visible = this.folkShown && revels;
      // the fisherman puts his rod away for the night
      this.rod.visible = this.bobber.visible = this.fishLine.visible = !revels;
    }
    if (!this.lively) return;

    const f = this.figures;
    for (const fig of f) fig.rest();
    const shipLocal = player ? this.toLocal(player.pos.x, player.pos.z, new THREE.Vector3()) : null;
    const cheer = this.cheerT < 2.6 ? Math.sin((this.cheerT / 2.6) * Math.PI) : 0;
    const lookAtShip = (fig: Figure, x: number, z: number, yaw: number, k = 1) => {
      if (!shipLocal) return;
      const want = Math.atan2(shipLocal.x - x, shipLocal.z - z);
      const d = Math.atan2(Math.sin(want - yaw), Math.cos(want - yaw));
      fig.head.rotation.y = clamp(d, -1.1, 1.1) * k;
    };
    const place = (fig: Figure, x: number, z: number, yaw: number, y = DECK) => {
      fig.root.position.set(x, y, z);
      fig.root.rotation.y = yaw;
    };
    const wave = (fig: Figure, left: boolean, ph: number) => {
      fig.reach(left, 2.75, 0.35 + Math.sin(ph) * 0.35, 0.35 + 0.25 * Math.sin(ph));
      fig.pose[left ? P.handL : P.handR] = 0;
      fig.pose[P.smile] = 1;
      fig.pose[P.brow] = 0.5;
    };
    const hurrah = (fig: Figure, k: number) => {
      if (k <= 0) return;
      fig.reach(true, 2.9 * k, 0.55 * k, 0.2);
      fig.reach(false, 2.9 * k, 0.55 * k, 0.2);
      fig.pose[P.handL] = fig.pose[P.handR] = 0.9;
      fig.pose[P.jaw] = 0.65 * k;
      fig.pose[P.smile] = 1;
      fig.pose[P.brow] = 0.8 * k;
      fig.hips.position.y = HIP + Math.abs(Math.sin(t * 9)) * 0.1 * k;
    };

    if (this.festive > 0.5) {
      this.updatePorters(dt, world, t, cheer);
      this.feastFolk(dt, t, cheer, { place, hurrah });
      this.group.updateMatrixWorld(true);
      this.updateMooring();
      return;
    }

    // -- merchants keep their stalls and cry their wares
    for (let i = 0; i < 3; i++) {
      const fig = f[i];
      const x = this.stalls[i];
      const z = -6.75;
      place(fig, x + Math.sin(t * 0.3 + i * 2) * 0.6, z, 0);
      const cyc = (t * 0.6 + i * 1.7) % 6;
      if (cheer > 0 && this.cheerLevel > 0) hurrah(fig, cheer);
      else if (this.attention > 0.55 && cyc < 2.2) wave(fig, i % 2 === 0, t * 7 + i);
      else if (cyc < 3.2) {
        // hand cupped to the mouth: "fresh limes!"
        fig.reach(false, 1.45, 0.25, 2.25);
        fig.pose[P.jaw] = 0.55 * Math.max(0, Math.sin(t * 8 + i));
        fig.pose[P.brow] = 0.5;
      } else {
        // leaning on the counter, arranging the wares
        fig.reach(true, 0.95 + Math.sin(t * 2 + i) * 0.1, 0.1, 0.9);
        fig.reach(false, 0.95 - Math.sin(t * 2 + i) * 0.1, 0.1, 0.9);
        fig.hips.rotation.x = 0.12;
        fig.head.rotation.x = 0.3;
      }
      if (cyc >= 3.2) fig.head.rotation.y = Math.sin(t * 0.4 + i) * 0.5;
      else lookAtShip(fig, x, z, 0, this.attention);
    }

    // -- porters: dice on the benches, then the cargo
    this.updatePorters(dt, world, t, cheer);

    // -- strollers on their loops; they hurry to the quay edge to watch you come in
    for (const k of [0, 1]) {
      const fig = f[7 + k];
      const w = this.walkers[k];
      const curve = this.loops[k];
      const spot: [number, number] = [k ? -14 : 8.5, -0.95];
      const watching = this.attention > 0.5 && !(this.docked && this.bellT > 25);
      if (watching) {
        w.path.length ? w.step(dt, 2.2) : Math.hypot(w.x - spot[0], w.z - spot[1]) > 0.3 && w.path.push(spot);
        if (!w.moving) {
          w.turn(0, dt, 3);
          if (Math.floor(t / 3 + k) % 2 === 0) wave(fig, k === 0, t * 7 + k * 2);
          else if (this.docked) fig.reach(false, 1.6, 0.1, 0.1); // pointing out your ship
        }
      } else {
        // back to the loop: walk to its nearest point, then follow it
        const L = this.loopLen[k];
        const u = ((this.loopT[k] % L) + L) % L / L;
        const p = curve.getPointAt(u);
        if (Math.hypot(p.x - w.x, p.z - w.z) > 0.6) {
          if (!w.path.length) w.path.push([p.x, p.z]);
          w.step(dt, 1.6);
        } else {
          w.path.length = 0;
          this.loopT[k] += dt * (k ? 0.9 : 1.05);
          const q = curve.getPointAt(((this.loopT[k] % L) + L) % L / L);
          const tan = curve.getTangentAt(((this.loopT[k] % L) + L) % L / L);
          w.x = q.x;
          w.z = q.z;
          w.phase += dt * 3.4 * (k ? 0.9 : 1.05);
          w.turn(Math.atan2(tan.x, tan.z), dt, 6);
          w.moving = true;
        }
      }
      place(fig, w.x, w.z, w.yaw);
      if (w.moving) fig.walk(w.phase, 0.8);
      if (!w.moving || watching) lookAtShip(fig, w.x, w.z, w.yaw, 0.8);
      else fig.head.rotation.y = Math.sin(t * 0.5 + k) * 0.35;
      if (cheer > 0 && !w.moving) hurrah(fig, cheer * 0.8);
    }

    // -- the kid trots after stroller B, and dashes to the edge to jump and wave
    {
      const fig = f[9];
      const w = this.walkers[2];
      const b = this.walkers[1];
      const excited = this.attention > 0.4;
      const tx = excited ? -11.8 : b.x - Math.sin(b.yaw) * 1.3 + Math.cos(b.yaw) * 0.6;
      const tz = excited ? -0.85 : b.z - Math.cos(b.yaw) * 1.3 - Math.sin(b.yaw) * 0.6;
      const d = Math.hypot(tx - w.x, tz - w.z);
      if (d > 0.25) {
        w.path.length = 0;
        w.path.push([tx, tz]);
        w.step(dt, excited ? 3.2 : clamp(d * 1.5, 0.8, 2.6));
      } else w.moving = false;
      place(fig, w.x, w.z, w.yaw);
      if (w.moving) fig.walk(w.phase * 1.4, 1);
      else if (excited) {
        w.turn(0, dt, 5);
        const hop = Math.abs(Math.sin(t * 6.5));
        fig.root.position.y = DECK + hop * 0.22;
        wave(fig, true, t * 9);
        wave(fig, false, t * 9 + 1.6);
        fig.pose[P.kneeL] = fig.pose[P.kneeR] = 0.4 * (1 - hop);
        lookAtShip(fig, w.x, w.z, w.yaw, 1);
      } else lookAtShip(fig, w.x, w.z, w.yaw, 0.5);
    }

    // -- the harbourmaster waves you in, then rings the bell
    {
      const fig = f[10];
      const x = 15.0;
      const z = -1.5;
      place(fig, x, z, 0.15);
      const ring = this.docked && this.bellT < 4.5;
      if (ring) {
        fig.root.rotation.y = 1.2;
        const pull = Math.max(0, Math.sin(this.bellT * 5.5));
        fig.reach(false, 2.1 - pull * 0.6, 0.1, 0.6 + pull * 0.6);
        fig.pose[P.handR] = 1;
        this.bell.rotation.x = Math.sin(this.bellT * 5.5) * 0.7 * (1 - this.bellT / 4.5);
        if (Math.floor(this.bellT * 5.5 / Math.PI) !== Math.floor((this.bellT - dt) * 5.5 / Math.PI)) this.onBell();
      } else if (this.attention > 0.35 && !this.docked) {
        // semaphore: both arms sweeping overhead
        const s = Math.sin(t * 3.2);
        fig.reach(true, 2.6, 0.3 + s * 0.6, 0.15);
        fig.reach(false, 2.6, 0.3 - s * 0.6, 0.15);
        fig.pose[P.jaw] = 0.4;
        lookAtShip(fig, x, z, 0.15, 1);
        this.bell.rotation.x *= 1 - damp(3, dt);
      } else {
        // pipe in hand, an eye on the porters
        fig.reach(false, 1.1 + 0.4 * Math.max(0, Math.sin(t * 0.7)), 0.2, 1.9 * Math.max(0, Math.sin(t * 0.7)));
        fig.reach(true, 0.2, 0.3, 1.6);
        fig.head.rotation.y = Math.sin(t * 0.35) * 0.6;
        this.bell.rotation.x *= 1 - damp(3, dt);
      }
      if (cheer > 0 && this.cheerLevel > 1 && !ring) hurrah(fig, cheer);
    }

    // -- a fiddler on a barrel: a lively hornpipe while you're in port
    {
      const fig = f[11];
      place(fig, -9.5, -6.4, 0.25);
      fig.sit(0.85);
      const w = t * (this.docked ? 9 : 6.5);
      const bow = Math.sin(w * 0.5);
      fig.reach(true, 1.15, -0.55, 1.95);
      fig.reach(false, 0.85, 0.45 + 0.12 * bow, 1.1 + 0.45 * bow);
      fig.head.rotation.set(0.22, 0.35, 0.07 * bow);
      fig.legR.rotation.x = -1.35 + 0.15 * Math.max(0, Math.sin(w));
      fig.pose[P.smile] = 1;
    }

    // -- fishing off the far end
    {
      const fig = f[12];
      place(fig, 22.2, 0.32, 0.1, DECK + 0.02);
      fig.hips.position.y = 0.12;
      fig.hips.rotation.x = -0.12;
      fig.legL.rotation.x = -0.25 + Math.sin(t * 1.6) * 0.28;
      fig.legR.rotation.x = -0.25 + Math.sin(t * 1.6 + 2.2) * 0.28;
      fig.pose[P.kneeL] = 0.25 + Math.max(0, Math.sin(t * 1.6)) * 0.3;
      fig.pose[P.kneeR] = 0.25 + Math.max(0, Math.sin(t * 1.6 + 2.2)) * 0.3;
      fig.pose[P.handL] = fig.pose[P.handR] = 1;
      const cyc = t % 9;
      const bite = cyc > 7.2 ? Math.sin(((cyc - 7.2) / 1.8) * Math.PI) : 0;
      fig.armL.rotation.set(-1.0 - bite * 0.5, 0, -0.35);
      fig.armR.rotation.set(-1.0 - bite * 0.5, 0, 0.35);
      fig.head.rotation.x = 0.25 - bite * 0.3;
      if (this.attention > 0.6) lookAtShip(fig, 22.2, 0.32, 0.1, 0.8);
      this.rod.rotation.x = 0.95 - bite * 0.45;
      const bx = 22.8;
      const bz = 6.2;
      const bw = this.toWorld(bx, 0, bz, this.v);
      const dip = cyc > 6.6 && cyc < 7.2 ? Math.sin(((cyc - 6.6) / 0.6) * Math.PI * 3) * 0.12 : 0;
      this.bobber.position.set(bx, world.waterHeight(bw.x, bw.z) + 0.02 - dip, bz);
    }

    this.group.updateMatrixWorld(true);
    // fishing line from rod tip to bobber
    {
      const tip = this.rod.localToWorld(this.v.set(0, 3.2, 0));
      this.group.worldToLocal(tip);
      const bp = this.bobber.position;
      const arr = this.fishLine.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < 10; i++) {
        const k = i / 9;
        arr.setXYZ(i, tip.x + (bp.x - tip.x) * k, tip.y + (bp.y + 0.08 - tip.y) * k - Math.sin(k * Math.PI) * 0.4, tip.z + (bp.z - tip.z) * k);
      }
      arr.needsUpdate = true;
    }
    this.updateMooring();
  }

  // ---------------------------------------------------------------- feast night

  /**
   * The town on a feast night: everyone not carrying cargo joins a ring dance,
   * two couples swing each other round, the fiddler and a drummer on a barrel
   * play for them, the merchants clap along, a fellow with a mug toasts the
   * night, the harbourmaster sends the rockets up and the fisherman sets
   * lantern boats on the water. Every face turns up when a shell breaks.
   */
  private feastFolk(dt: number, t: number, cheer: number, h: Moves) {
    const f = this.figures;
    const beat = t * 2.2; // the band's quarter notes, near enough
    const bounce = Math.abs(Math.sin(beat * Math.PI));
    const s = this.skyT;
    const up = s > 0 && s < 4 ? Math.min(1, s / 0.35) * (1 - smoothstep(2.6, 4, s)) : 0;
    const gaze = (fig: Figure, k = 1) => {
      fig.head.rotation.x = Math.min(fig.head.rotation.x, -0.6 * up * k);
      if (up > 0.5) fig.pose[P.jaw] = Math.max(fig.pose[P.jaw], 0.5 * up * k); // "ooh"
    };
    const sing = (fig: Figure, i: number) => {
      fig.pose[P.smile] = 1;
      fig.pose[P.jaw] = 0.35 * Math.max(0, Math.sin(t * 6.5 + i * 1.9));
    };

    // -- the merchants clap along behind their stalls
    for (let i = 0; i < 3; i++) {
      const fig = f[i];
      h.place(fig, this.stalls[i], -6.75, 0);
      if (cheer > 0 && this.cheerLevel > 0) h.hurrah(fig, cheer);
      else {
        // the hands meet on the beat
        const apart = Math.abs(Math.sin(beat * Math.PI + i * 0.4));
        fig.reach(true, 1.35, 0.06 + 0.3 * apart, 1.15);
        fig.reach(false, 1.35, 0.06 + 0.3 * apart, 1.15);
        fig.pose[P.handL] = fig.pose[P.handR] = 0.1;
        fig.hips.rotation.z = Math.sin(beat * Math.PI * 0.5 + i) * 0.07;
        fig.hips.position.y = HIP + bounce * 0.03;
        sing(fig, i);
      }
      fig.head.rotation.y = Math.sin(t * 0.5 + i * 1.7) * 0.5;
      gaze(fig);
    }

    // -- the ring dance: idle porters, both strollers and the kid, hand in hand
    const ring: [Figure, Walker][] = [];
    for (const p of this.porters) if (p.stage === 'idle') ring.push([p.fig, p.w]);
    ring.push([f[7], this.walkers[0]], [f[9], this.walkers[2]], [f[8], this.walkers[1]]);
    const PERIOD = 9;
    const was = this.ringT % PERIOD;
    this.ringT += dt;
    const ph = this.ringT % PERIOD;
    if (ph < was) this.ringDir = -this.ringDir;
    const stamp = ph > PERIOD - 1.4;
    if (!stamp) this.ringRot += this.ringDir * 0.6 * dt;
    const n = ring.length;
    const R = 1.1 + n * 0.17;
    const [cx, cz] = RING;
    ring.forEach(([fig, w], i) => {
      fig.rest();
      const kid = fig === f[9];
      const a = this.ringRot + (i / n) * TAU;
      const sx = cx + Math.sin(a) * R;
      const sz = cz + Math.cos(a) * R;
      if (Math.hypot(sx - w.x, sz - w.z) > 0.35) {
        // joining in: hurry to a place in the ring
        w.path.length = 0;
        w.path.push([sx, sz]);
        w.step(dt, kid ? 3.2 : 2.6);
        h.place(fig, w.x, w.z, w.yaw);
        fig.walk(w.phase * (kid ? 1.3 : 1), 0.9);
        fig.pose[P.smile] = 1;
        return;
      }
      w.path.length = 0;
      w.x = sx;
      w.z = sz;
      w.moving = false;
      w.yaw = Math.atan2(cx - sx, cz - sz);
      h.place(fig, sx, sz, w.yaw);
      if (stamp) {
        // stamp, stamp, a clap over the head, and round the other way
        const k = (ph - (PERIOD - 1.4)) / 1.4;
        const apart = Math.abs(Math.sin(k * Math.PI * 3));
        fig.reach(true, 2.7, 0.08 + 0.3 * apart, 0.5);
        fig.reach(false, 2.7, 0.08 + 0.3 * apart, 0.5);
        const lift = Math.max(0, Math.sin(k * Math.PI * 4));
        (i % 2 ? fig.legL : fig.legR).rotation.x = -0.5 * lift;
        fig.pose[i % 2 ? P.kneeL : P.kneeR] = 0.8 * lift;
        fig.pose[P.smile] = 1;
        fig.pose[P.jaw] = 0.6;
      } else {
        // side-stepping round, hands joined with the neighbours, a hop on every beat
        fig.walk(beat * Math.PI, 0.5);
        fig.root.position.y = DECK + bounce * (kid ? 0.14 : 0.08);
        const sw = Math.sin(beat * Math.PI) * 0.12;
        fig.reach(true, 0.25 + sw, 1.15, 0.3);
        fig.reach(false, 0.25 - sw, 1.15, 0.3);
        fig.pose[P.handL] = fig.pose[P.handR] = 0.85;
        sing(fig, i);
      }
      fig.pose[P.brow] = 0.5;
      if (cheer > 0) h.hurrah(fig, cheer);
      gaze(fig, 0.7);
    });

    // -- two couples swinging each other round
    const swing = (a: Figure, b: Figure, px: number, pz: number, k: number) => {
      const ang = t * 2.1 + Math.sin(t * 0.37 + k) * 1.4 + k * 2;
      ([[a, 1], [b, -1]] as [Figure, number][]).forEach(([fig, side], j) => {
        const x = px + Math.sin(ang) * 0.42 * side;
        const z = pz + Math.cos(ang) * 0.42 * side;
        h.place(fig, x, z, Math.atan2(px - x, pz - z), DECK + bounce * 0.06);
        fig.walk(ang * 2.2 + j * Math.PI, 0.45);
        // both hands held, leaning back into the spin
        fig.reach(true, 1.05, 0.2, 0.35);
        fig.reach(false, 1.05, 0.2, 0.35);
        fig.pose[P.handL] = fig.pose[P.handR] = 0.85;
        fig.hips.rotation.x = -0.1;
        sing(fig, k * 2 + j);
        if (cheer > 0) h.hurrah(fig, cheer);
        gaze(fig, 0.6);
      });
    };
    swing(f[13], f[14], 11.8, -3.0, 0);
    swing(f[15], f[16], 20.6, -3.6, 1);

    // -- the drummer on his barrel, a hand on every beat
    {
      const fig = f[17];
      h.place(fig, -7.6, -6.65, 0);
      const hit = Math.sin(beat * Math.PI);
      fig.reach(true, 0.7 + 0.5 * Math.max(0, hit), 0.18, 1.3 - 0.4 * Math.max(0, hit));
      fig.reach(false, 0.7 + 0.5 * Math.max(0, -hit), 0.18, 1.3 - 0.4 * Math.max(0, -hit));
      fig.pose[P.handL] = fig.pose[P.handR] = 0.4;
      fig.hips.position.y = HIP + bounce * 0.03;
      fig.hips.rotation.x = 0.12;
      fig.head.rotation.x = 0.15 + 0.15 * bounce;
      fig.head.rotation.z = Math.sin(beat * Math.PI * 0.5) * 0.1;
      sing(fig, 17);
      gaze(fig, 0.5);
    }

    // -- a fellow with a mug, toasting the night out over the water
    {
      const fig = f[18];
      h.place(fig, -25.5, -1.3, 0.1);
      const cyc = t % 6.5;
      const raise = cyc < 1.8 ? Math.sin((cyc / 1.8) * Math.PI) : 0;
      fig.reach(false, 1.1 + 1.6 * raise, 0.25, 1.4 - 0.9 * raise);
      fig.reach(true, 0.15, 0.3, 0.3);
      fig.hips.rotation.z = Math.sin(t * 1.1) * 0.08; // a little unsteady by now
      fig.pose[P.smile] = 1;
      fig.pose[P.jaw] = 0.6 * raise;
      if (cheer > 0) h.hurrah(fig, cheer);
      gaze(fig);
    }

    // -- the harbourmaster rings you in, then sends the rockets up
    {
      const fig = f[10];
      h.place(fig, 15.0, -1.5, 0.15);
      if (this.docked && this.bellT < 4.5) {
        fig.root.rotation.y = 1.2;
        const pull = Math.max(0, Math.sin(this.bellT * 5.5));
        fig.reach(false, 2.1 - pull * 0.6, 0.1, 0.6 + pull * 0.6);
        fig.pose[P.handR] = 1;
        this.bell.rotation.x = Math.sin(this.bellT * 5.5) * 0.7 * (1 - this.bellT / 4.5);
        if (Math.floor((this.bellT * 5.5) / Math.PI) !== Math.floor(((this.bellT - dt) * 5.5) / Math.PI)) this.onBell();
      } else {
        this.bell.rotation.x *= 1 - damp(3, dt);
        if (this.fuseT < 1.6) {
          // "light her!": an arm flung up at the sky
          const k = Math.sin(Math.min(1, this.fuseT / 1.6) * Math.PI);
          fig.reach(false, 1.6 + 1.3 * k, 0.15, 0.1);
          fig.pose[P.jaw] = 0.7 * k;
        } else {
          // tapping a foot, pipe going, a hand beating time
          fig.reach(false, 1.0 + 0.25 * bounce, 0.25, 1.6);
          fig.legR.rotation.x = -0.15 * bounce;
        }
        fig.reach(true, -0.2, 0.75, 1.8);
        fig.pose[P.smile] = 1;
        fig.head.rotation.y = Math.sin(t * 0.4) * 0.4;
        gaze(fig);
      }
    }

    // -- the fiddler, faster now, bouncing on his barrel
    {
      const fig = f[11];
      h.place(fig, -9.5, -6.4, 0.25);
      fig.sit(0.85);
      fig.hips.position.y += bounce * 0.03;
      const w = t * 11;
      const bow = Math.sin(w * 0.5);
      fig.reach(true, 1.15, -0.55, 1.95);
      fig.reach(false, 0.85, 0.45 + 0.14 * bow, 1.1 + 0.5 * bow);
      fig.head.rotation.set(0.15, 0.35, 0.1 * bow);
      fig.legR.rotation.x = -1.35 + 0.22 * Math.max(0, Math.sin(beat * Math.PI * 2));
      fig.pose[P.smile] = 1;
    }

    // -- the fisherman sets lantern boats down off the end
    {
      const fig = f[12];
      h.place(fig, 22.2, 0.32, 0.1, DECK + 0.02);
      fig.hips.position.y = 0.12;
      fig.legL.rotation.x = -0.25 + Math.sin(t * 1.3) * 0.25;
      fig.legR.rotation.x = -0.25 + Math.sin(t * 1.3 + 2.2) * 0.25;
      fig.pose[P.kneeL] = fig.pose[P.kneeR] = 0.3;
      const was = this.relT;
      this.relT += dt;
      if (this.relT < 1.8) {
        // reaching down to the water with the little boat in both hands
        const k = Math.sin((this.relT / 1.8) * Math.PI);
        fig.hips.rotation.x = 0.55 * k;
        fig.reach(true, 0.55 + 0.4 * k, 0.12, 0.25);
        fig.reach(false, 0.55 + 0.4 * k, 0.12, 0.25);
        fig.pose[P.handL] = fig.pose[P.handR] = 0.6;
        fig.head.rotation.x = 0.35 * k;
        if (was < 0.9 && this.relT >= 0.9) this.onLantern(this.toWorld(22.25, 0, 1.25));
      } else {
        // watching them go
        fig.reach(true, 0.4, 0.3, 0.3);
        fig.reach(false, 0.4, 0.3, 0.3);
        fig.head.rotation.x = 0.1;
        fig.pose[P.smile] = 1;
        gaze(fig);
      }
    }
  }

  private sendHome(p: Porter) {
    p.job = null;
    p.holding = null;
    for (const m of Object.values(p.props)) m.visible = false;
    if (p.stage === 'up' || p.stage === 'grab' || p.stage === 'drop') {
      // off the plank first
      p.w.set(this.plankFoot.x, this.plankFoot.z);
    }
    p.stage = 'home';
    p.w.route(p.seat[0], p.seat[1]);
  }

  private hold(p: Porter, c: Carry | null) {
    p.holding = c;
    for (const [k, m] of Object.entries(p.props)) {
      m.visible = k === c;
      if (k !== c) continue;
      const over = c === 'crate' || c === 'barrel' || c === 'sack';
      m.position.set(0, over ? 1.43 + (c === 'barrel' ? 0.05 : 0) : 0.4, over ? 0.05 : 0.42);
      m.rotation.set(0, c === 'barrel' ? Math.PI / 2 : 0, 0);
    }
  }

  private updatePorters(dt: number, world: World, t: number, cheer: number) {
    const foot = this.plankFoot;
    const top = this.plankTop;
    for (const [i, p] of this.porters.entries()) {
      const fig = p.fig;
      const w = p.w;
      p.t += dt;
      const heavy = p.holding === 'barrel' || p.holding === 'idol' || p.holding === 'painting';
      const speed = p.holding ? (heavy ? 1.6 : 2) : 2.8;
      const free = () => {
        const j = this.jobs.shift();
        if (!j) return false;
        p.job = j;
        p.t = 0;
        if (j.on) {
          p.stage = 'toA';
          w.route(this.warehouseDoor[0] + (i % 2 ? 0.7 : -0.7), this.warehouseDoor[1]);
        } else {
          p.stage = 'toA';
          w.route(foot.x + (i % 2 ? 0.25 : -0.25), foot.z);
        }
        return true;
      };
      switch (p.stage) {
        case 'idle':
        case 'ready':
          if (this.docked && free()) break;
          if (this.docked && i < 2 && p.stage === 'idle') {
            // two of them stroll over to meet the ship
            p.stage = 'ready';
            w.route(foot.x + (i ? 1.4 : -1.4), foot.z - 0.5);
          }
          if (!this.docked && p.stage === 'ready') {
            p.stage = 'home';
            w.route(p.seat[0], p.seat[1]);
          }
          break;
        case 'toA':
          if (w.step(dt, speed)) {
            p.t = 0;
            if (p.job!.on) {
              p.stage = 'grab';
            } else {
              p.stage = 'up';
              p.k = 0;
            }
          }
          break;
        case 'up':
          p.k = Math.min(1, p.k + (dt * speed) / Math.max(1, foot.distanceTo(top)));
          if (p.k >= 1) {
            p.t = 0;
            p.stage = p.job!.on ? 'drop' : 'grab';
          }
          break;
        case 'grab':
          if (p.t > 0.4 && !p.holding) this.hold(p, LOOT[p.job!.id].carry);
          if (p.t > 0.8) {
            p.t = 0;
            if (p.job!.on) {
              p.stage = 'toB';
              w.route(foot.x, foot.z);
            } else p.stage = 'down';
          }
          break;
        case 'down':
          p.k = Math.max(0, p.k - (dt * speed) / Math.max(1, foot.distanceTo(top)));
          if (p.k <= 0) {
            w.set(foot.x, foot.z, w.yaw);
            if (p.job!.on) {
              p.stage = free() ? p.stage : 'home';
              if (p.stage === 'home') w.route(p.seat[0], p.seat[1]);
            } else {
              p.stage = 'toB';
              const cat = LOOT[p.job!.id].cat;
              const [dx, dz] = cat === 'spirits' || cat === 'provisions' || cat === 'cloth' ? this.warehouseDoor : this.houseDoor;
              w.route(dx + (i % 2 ? 0.5 : -0.5), dz);
            }
          }
          break;
        case 'toB':
          if (w.step(dt, speed)) {
            if (p.job!.on) {
              p.stage = 'up';
              p.k = 0;
            } else {
              p.stage = 'drop';
              p.t = 0;
            }
          }
          break;
        case 'drop':
          if (p.t > 0.45 && p.holding) {
            const at = this.toWorld(fig.root.position.x, DECK + 1.4, fig.root.position.z + (p.job!.on ? 0 : 0.6));
            this.hold(p, null);
            this.onDelivered(p.job!.id, p.job!.on, at);
          }
          if (p.t > 0.8) {
            p.t = 0;
            if (p.job!.on) p.stage = 'down';
            else if (!free()) {
              p.stage = 'home';
              w.route(p.seat[0], p.seat[1]);
            }
          }
          break;
        case 'home':
          if (w.step(dt, speed)) {
            p.stage = 'idle';
            p.job = null;
          }
          break;
      }
      // pose and place
      let x = w.x;
      let z = w.z;
      let y = DECK;
      let yaw = w.yaw;
      if (p.stage === 'up' || p.stage === 'down' || ((p.stage === 'grab' || p.stage === 'drop') && p.k > 0.5)) {
        x = foot.x + (top.x - foot.x) * p.k;
        y = foot.y + (top.y - foot.y) * p.k;
        z = foot.z + (top.z - foot.z) * p.k;
        const toTop = Math.atan2(top.x - foot.x, top.z - foot.z);
        const facing = p.stage === 'up' || (p.stage === 'grab' && p.t < 0.4) || (p.stage === 'drop' && p.t < 0.4) ? toTop : toTop + Math.PI;
        w.turn(facing, dt, 9);
        yaw = w.yaw;
        if (p.stage === 'up' || p.stage === 'down') w.phase += dt * speed * 3.4;
      }
      fig.root.position.set(x, y, z);
      fig.root.rotation.y = yaw;
      const moving = w.moving || p.stage === 'up' || p.stage === 'down';
      if (p.stage === 'idle') {
        // on the bench, rolling dice and swapping tales
        fig.sit(0.52);
        w.turn(0, dt, 2);
        const chat = Math.sin(t * 0.9 + i * 2.1);
        fig.head.rotation.y = (i % 2 ? -0.5 : 0.5) * Math.max(0, chat);
        fig.pose[P.jaw] = chat > 0.3 ? 0.4 * Math.max(0, Math.sin(t * 9 + i)) : 0;
        if (i % 2 === 0) fig.reach(false, 0.9 + Math.max(0, Math.sin(t * 2.4)) * 0.6, 0.2, 1.2);
        else fig.reach(true, 0.5, 0.3, 1.5);
        if (this.attention > 0.6 && !this.docked) fig.head.rotation.y = 0.3;
        if (cheer > 0 && this.cheerLevel > 1) {
          fig.reach(true, 2.6 * cheer, 0.4, 0.3);
          fig.reach(false, 2.6 * cheer, 0.4, 0.3);
          fig.pose[P.jaw] = 0.6 * cheer;
        }
      } else {
        if (moving) fig.walk(w.phase, p.holding ? 0.7 : 0.9);
        if (p.holding) {
          const over = p.holding === 'crate' || p.holding === 'barrel' || p.holding === 'sack';
          if (over) {
            fig.armL.rotation.set(-2.85, 0, 0.32);
            fig.armR.rotation.set(-2.85, 0, -0.32);
          } else {
            fig.reach(true, 1.05, 0.12, 0.85);
            fig.reach(false, 1.05, 0.12, 0.85);
          }
          fig.pose[P.handL] = fig.pose[P.handR] = 0.25;
          fig.pose[P.brow] = heavy ? 0.5 : 0.2;
          fig.hips.rotation.x = heavy ? 0.06 : 0;
        } else if (p.stage === 'ready' && !moving) {
          // hands on hips, waiting for the hatch to open
          w.turn(Math.atan2(top.x - w.x, top.z - w.z), dt, 4);
          fig.reach(true, -0.2, 0.75, 1.8);
          fig.reach(false, -0.2, 0.75, 1.8);
          fig.pose[P.smile] = 0.8;
        } else if (p.stage === 'grab' || p.stage === 'drop') {
          fig.reach(true, 1.3, 0.1, 0.5);
          fig.reach(false, 1.3, 0.1, 0.5);
          fig.hips.rotation.x = 0.35;
        }
      }
      void world;
    }
  }

  private flagWind(world: World) {
    const inv = new THREE.Quaternion().copy(this.group.quaternion).invert();
    const wd = this.v.set(world.wind.dirX, 0, world.wind.dirZ).applyQuaternion(inv);
    this.flagPivot.rotation.y = Math.atan2(-wd.z, wd.x);
    this.lanterns.uniforms.uSway.value.set(wd.x, wd.z, 0.25 + world.wind.strength * 0.5);
  }

  private smoke(dt: number, world: World) {
    if (!this.chimney || !this.group.visible) return;
    this.smokeT += dt;
    if (this.smokeT < 0.3) return;
    this.smokeT = 0;
    const p = this.toWorld(this.chimney.x, this.chimney.y, this.chimney.z);
    world.particles.emit({
      x: p.x + (Math.random() - 0.5) * 0.3, y: p.y, z: p.z + (Math.random() - 0.5) * 0.3,
      vx: world.wind.dirX * 1.1, vy: 1.4 + Math.random() * 0.5, vz: world.wind.dirZ * 1.1,
      life: 6 + Math.random() * 2, size: 0.9, sizeEnd: 4.2, color: [0.96, 0.95, 0.94], colorEnd: [0.86, 0.86, 0.88], alpha: 0.34, drag: 0.25, kind: 1, spin: (Math.random() - 0.5) * 0.3, fadeIn: 0.5,
    });
  }

  private updateMooring() {
    const ship = this.ship;
    if (!ship) return;
    const s = ship.model.shape;
    const L = ship.cls.length;
    const m = ship.model.root.matrixWorld;
    const inv = this.inv.copy(this.group.matrixWorld).invert();
    const onShip = (t: number, up = 0.2) => new THREE.Vector3(s.halfBeam(t) * 0.8, s.top(t) + up, s.z(t)).applyMatrix4(m).applyMatrix4(inv);
    const bol = this.bollards();
    const nearest = (x: number) => bol.reduce((a, b2) => (Math.abs(b2 - x) < Math.abs(a - x) ? b2 : a));
    const pairs: [THREE.Vector3, THREE.Vector3][] = [
      [onShip(0.96), new THREE.Vector3(nearest(SHIP_X + L * 0.5 + 5), DECK + 0.6, -0.35)],
      [onShip(0.05), new THREE.Vector3(nearest(SHIP_X - L * 0.5 - 5), DECK + 0.6, -0.35)],
      [onShip(0.7), new THREE.Vector3(nearest(SHIP_X + L * 0.05), DECK + 0.6, -0.35)],
      [onShip(0.32), new THREE.Vector3(nearest(SHIP_X - L * 0.05), DECK + 0.6, -0.35)],
    ];
    const arr = this.ropes.geometry.getAttribute('position') as THREE.BufferAttribute;
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
    const foot = this.plankFoot.set(top.x, DECK + 0.08, -1.3);
    this.plankTop.copy(top);
    const len = foot.distanceTo(top);
    this.gangplank.position.copy(foot);
    this.gangplank.lookAt(this.v.copy(top).applyMatrix4(this.group.matrixWorld));
    this.gangplank.scale.set(1, 1, len);
    this.plankFoot.y = DECK;
  }
}

const patchMaterialCache: { palm?: THREE.MeshStandardMaterial } = {};
const lineMats = new Map<string, THREE.LineBasicMaterial>();
function lineMat(color: number, opacity: number) {
  const k = `${color}:${opacity}`;
  let m = lineMats.get(k);
  if (!m) {
    m = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
    lineMats.set(k, m);
  }
  return m;
}

// ------------------------------------------------------------------ all of them

/** Every trading port, their shared crowd and the art they share. */
export class TradePorts {
  readonly root = new THREE.Group();
  readonly ports: TradePort[] = [];
  private crowd: Crowd;

  /**
   * Builds the towns all at once. During loading use `TradePorts.build`, which hands
   * the browser a frame between towns instead of building all six in one go.
   */
  constructor(sites: PortSite[], heightAt: (x: number, z: number) => number, deferTowns = false) {
    this.root.name = 'trade-ports';
    const specs = TRADE_SPECS.slice(0, sites.length);
    const kit = makeKit(TRADE_SPECS);
    const styles: PirateStyle[] = [];
    specs.forEach((sp, i) => {
      const rnd = mulberry32(1000 + i * 97);
      for (const role of ROLES) styles.push(townStyle(role, rnd, sp));
    });
    // only the town you're at is drawn up close: its folk get the detailed sculpt nearest the camera
    this.crowd = new Crowd(styles, 0.62, 0.38, 12);
    this.crowd.group.name = 'townsfolk';
    this.root.add(this.crowd.group);
    this.pending = sites.map((site, i) => () => {
      const port = new TradePort(site, specs[i], i, kit, this.crowd.figures.slice(i * FOLK, (i + 1) * FOLK), heightAt);
      this.ports.push(port);
      this.root.add(port.group);
    });
    if (!deferTowns) for (const town of this.pending.splice(0)) town();
  }

  private pending: (() => void)[];

  /** Builds the trade ports one town at a time, awaiting `rest` (a frame) between towns. */
  static async build(sites: PortSite[], heightAt: (x: number, z: number) => number, rest: () => Promise<void>) {
    const tp = new TradePorts(sites, heightAt, true);
    for (const town of tp.pending.splice(0)) {
      await rest();
      town();
    }
    return tp;
  }

  /** The port whose quay is nearest a point. */
  nearest(x: number, z: number) {
    let best: TradePort | null = null;
    let bd = Infinity;
    for (const p of this.ports) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best ? { port: best, d: bd } : null;
  }

  update(dt: number, world: World, player: Ship | null, cam: THREE.Vector3, ships: Ship[]) {
    const lively: TradePort[] = [];
    for (const p of this.ports) {
      const d = p.lod(cam);
      // a town across the high seas, out of sight, is left be until you come back
      if (!p.group.visible) continue;
      for (const s of ships) if (!s.anchored && (s.alive || s.sinkT < 6) && Math.hypot(s.pos.x - p.x, s.pos.z - p.z) < 90) p.repel(s);
      p.update(dt, world, player);
      if (p.lively && d < 300) lively.push(p);
    }
    const _w = new THREE.Vector3();
    this.crowd.sync((f, i) => {
      const port = this.ports[Math.floor(i / FOLK)];
      if (!port || !lively.includes(port)) return 0;
      // the revellers only come out on a feast night
      if (i % FOLK >= REVELS && !port.reveling) return 0;
      f.hips.getWorldPosition(_w);
      // and the lightest cut once they're a few dozen pixels tall
      const d2 = _w.distanceToSquared(cam);
      return d2 < 60 * 60 ? 1 : d2 < 75 * 75 ? 2 : 3;
    });
  }

  /** Warm-up: every townsperson drawn once in both sculpts. */
  warm() {
    for (const p of this.ports) {
      p.showFolk();
      p.group.updateMatrixWorld(true);
    }
    let n = 0;
    this.crowd.sync(() => (n++ % 2 ? 1 : 2));
  }
}
