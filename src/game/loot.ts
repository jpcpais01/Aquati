import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { patchMaterial } from '../render/environment';
import { World } from './world';
import { LootId, RARITIES, Rarity, rollContents } from './treasure';

// Floating salvage: barrels and treasure chests that bob on the swell and
// glint in the sun. Sail through them to haul their goods into the hold and
// patch your hull. Chests come in four rarities above the humble barrel, each
// with its own craft, a glowing beacon of light you can spot from afar, and
// finer plunder inside (see treasure.ts).

/** 0 barrel (common), 1 uncommon, 2 rare, 3 epic, 4 legendary chest: the rarity of its best good. */
export type Tier = 0 | 1 | 2 | 3 | 4;

export interface RarityInfo {
  name: string;
  css: string; // colour for maps & UI
  glow: [number, number, number]; // HDR beacon colour
  beam: number; // beacon height (0 = none)
  halo: number; // halo radius on the water
  sparkle: number; // seconds between glints
  scale: number;
}

export const RARITY: RarityInfo[] = [
  { name: RARITIES[0].name, css: '#e8d3a0', glow: [0, 0, 0], beam: 0, halo: 0, sparkle: 0.6, scale: 1 },
  { name: RARITIES[1].name, css: RARITIES[1].css, glow: [0.55, 1.7, 0.65], beam: 0, halo: 1.7, sparkle: 0.24, scale: 1 },
  { name: RARITIES[2].name, css: RARITIES[2].css, glow: [0.35, 1.2, 2.6], beam: 7, halo: 2.3, sparkle: 0.14, scale: 1.08 },
  { name: RARITIES[3].name, css: RARITIES[3].css, glow: [1.7, 0.45, 2.8], beam: 11, halo: 2.9, sparkle: 0.09, scale: 1.16 },
  { name: RARITIES[4].name, css: RARITIES[4].css, glow: [3.4, 2.0, 0.45], beam: 18, halo: 3.8, sparkle: 0.045, scale: 1.3 },
];

export interface Item {
  x: number;
  z: number;
  tier: Tier;
  /** What's inside, best first. */
  goods: LootId[];
  heal: number;
  spin: number;
  phase: number;
  age: number;
  sparkle: number;
}

function colored(geo: THREE.BufferGeometry, hex: number, boost = 1) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const c = new THREE.Color(hex).multiplyScalar(boost);
  const n = g.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

function at<T extends THREE.BufferGeometry>(g: T, x: number, y: number, z: number): T {
  g.translate(x, y, z);
  return g;
}

function barrel() {
  const parts = [colored(new THREE.CylinderGeometry(0.42, 0.42, 1.1, 12), 0x8f5d34)];
  for (const y of [-0.38, 0.38]) parts.push(colored(at(new THREE.CylinderGeometry(0.44, 0.44, 0.08, 12), 0, y, 0), 0x2c2622));
  const g = mergeGeometries(parts);
  g.rotateZ(Math.PI / 2);
  return g;
}

interface ChestStyle {
  body: number;
  lid: number;
  band: number;
  lock: number;
  bands: number; // vertical straps
  corners: boolean;
  studs: boolean;
  open: number; // lid angle (radians)
  gem?: number; // emissive gem on the lock
  hoard?: boolean; // glowing coins spilling from an open lid
}

const STYLES: ChestStyle[] = [
  // common: weathered planks, black iron
  { body: 0x6e4528, lid: 0x7d4f2d, band: 0x3a3532, lock: 0x55504a, bands: 2, corners: false, studs: false, open: 0 },
  // rare: sea-blue lacquer, polished silver
  { body: 0x1f5774, lid: 0x2a6f92, band: 0xd8e2e8, lock: 0xeef4f8, bands: 2, corners: true, studs: false, open: 0, gem: 0x58c8ff },
  // epic: royal violet, gold fittings, amethyst
  { body: 0x3f1f5e, lid: 0x55297c, band: 0xe8b64c, lock: 0xf6cd63, bands: 3, corners: true, studs: true, open: 0, gem: 0xc070ff },
  // legendary: gilded mahogany, lid ajar on a glowing hoard
  { body: 0x5a1c14, lid: 0xe4ad3e, band: 0xffd263, lock: 0xffe08a, bands: 3, corners: true, studs: true, open: 0.62, gem: 0xff4060, hoard: true },
];

/** Returns [solid, emissive] geometries for a chest of the given style. */
function chest(s: ChestStyle): [THREE.BufferGeometry, THREE.BufferGeometry | null] {
  const W = 1.2, H = 0.7, D = 0.8;
  const solid: THREE.BufferGeometry[] = [];
  const glow: THREE.BufferGeometry[] = [];

  solid.push(colored(new THREE.BoxGeometry(W, H, D), s.body));
  // rim moulding at the base and top of the body
  solid.push(colored(at(new THREE.BoxGeometry(W + 0.06, 0.08, D + 0.06), 0, -H / 2 + 0.04, 0), s.band, 0.85));
  solid.push(colored(at(new THREE.BoxGeometry(W + 0.04, 0.06, D + 0.04), 0, H / 2 - 0.03, 0), s.band, 0.85));

  // lid: a half-barrel hinged along the back edge
  const lidParts: THREE.BufferGeometry[] = [];
  const lid = new THREE.CylinderGeometry(D / 2, D / 2, W, 14, 1, false, 0, Math.PI);
  lid.rotateZ(Math.PI / 2);
  lidParts.push(colored(lid, s.lid));
  const cap = new THREE.CircleGeometry(D / 2, 14, 0, Math.PI);
  cap.rotateY(Math.PI / 2);
  const capL = cap.clone();
  capL.rotateY(Math.PI);
  lidParts.push(colored(at(cap, W / 2, 0, 0), s.lid, 0.8), colored(at(capL, -W / 2, 0, 0), s.lid, 0.8));
  const xs = s.bands === 3 ? [-0.4, 0, 0.4] : [-0.35, 0.35];
  for (const x of xs) {
    const strap = new THREE.CylinderGeometry(D / 2 + 0.03, D / 2 + 0.03, 0.1, 14, 1, false, 0, Math.PI);
    strap.rotateZ(Math.PI / 2);
    lidParts.push(colored(at(strap, x, 0, 0), s.band));
  }
  if (s.studs) {
    for (const x of [-0.2, 0.2]) {
      for (let k = 0; k < 3; k++) {
        const a = (k + 1) * (Math.PI / 4);
        const st = new THREE.SphereGeometry(0.035, 6, 4);
        lidParts.push(colored(at(st, x, Math.sin(a) * (D / 2 + 0.01), Math.cos(a) * (D / 2 + 0.01)), s.band));
      }
    }
  }
  const lidG = mergeGeometries(lidParts);
  // hinge: rotate about the back top edge
  lidG.translate(0, 0, D / 2);
  lidG.rotateX(-s.open);
  lidG.translate(0, H / 2, -D / 2);
  solid.push(lidG);

  for (const x of xs) solid.push(colored(at(new THREE.BoxGeometry(0.1, H + 0.04, D + 0.04), x, 0, 0), s.band));
  if (s.corners) {
    for (const cx of [-1, 1]) for (const cz of [-1, 1]) {
      solid.push(colored(at(new THREE.BoxGeometry(0.1, H + 0.06, 0.1), cx * (W / 2 - 0.02), 0, cz * (D / 2 - 0.02)), s.band));
    }
  }
  // lock plate + hasp
  solid.push(colored(at(new THREE.BoxGeometry(0.24, 0.28, 0.06), 0, 0.2, D / 2 + 0.03), s.lock));
  if (s.open === 0) solid.push(colored(at(new THREE.BoxGeometry(0.1, 0.16, 0.05), 0, 0.38, D / 2 + 0.05), s.lock, 0.8));
  // handles
  for (const sx of [-1, 1]) {
    const h = new THREE.TorusGeometry(0.12, 0.025, 5, 10, Math.PI);
    h.rotateY(Math.PI / 2);
    h.rotateX(Math.PI);
    solid.push(colored(at(h, sx * (W / 2 + 0.03), 0.12, 0), s.band, 0.75));
  }
  if (s.gem !== undefined) {
    const gem = new THREE.OctahedronGeometry(0.075, 0);
    gem.scale(1, 1.3, 0.6);
    glow.push(colored(at(gem, 0, 0.18, D / 2 + 0.07), s.gem, 2.6));
  }
  if (s.hoard) {
    // a heap of coins and jewels bulging out of the open chest
    const heap = new THREE.SphereGeometry(0.5, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    heap.scale(1.08, 0.5, 0.72);
    glow.push(colored(at(heap, 0, H / 2 - 0.04, 0), 0xffc24a, 1.9));
    const rnd = mulberry(7);
    for (let i = 0; i < 16; i++) {
      const c = new THREE.CylinderGeometry(0.07, 0.07, 0.02, 8);
      c.rotateX((rnd() - 0.5) * 1.6);
      c.rotateZ((rnd() - 0.5) * 1.6);
      const a = rnd() * Math.PI * 2, r = rnd() * 0.42;
      glow.push(colored(at(c, Math.cos(a) * r * 1.2, H / 2 + 0.12 + rnd() * 0.14, Math.sin(a) * r * 0.75), 0xffd772, 2.4));
    }
    const jewels = [0xff3c64, 0x3cf0a0, 0x50a8ff];
    for (let i = 0; i < 5; i++) {
      const j = new THREE.OctahedronGeometry(0.06, 0);
      const a = rnd() * Math.PI * 2, r = 0.15 + rnd() * 0.3;
      glow.push(colored(at(j, Math.cos(a) * r, H / 2 + 0.2, Math.sin(a) * r * 0.6), jewels[i % 3], 3));
    }
  }
  return [mergeGeometries(solid), glow.length ? mergeGeometries(glow) : null];
}

function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rolls a chest rarity. `luck` 0..1 shifts the odds toward the good stuff. */
export function rollTier(luck: number, min: Tier = 1): Tier {
  const r = Math.random();
  let t: Tier = 1;
  if (r < 0.025 + luck * 0.09) t = 4;
  else if (r < 0.1 + luck * 0.22) t = 3;
  else if (r < 0.32 + luck * 0.3) t = 2;
  return Math.max(t, min) as Tier;
}

const HEAL = [0.1, 0.06, 0.1, 0.16, 0.3];
const MAX = 64;

// Additive beacon shaders. They live in the water/fx pass, so they soft-test
// against the opaque scene depth (like the particles) to tuck behind hulls.
const DEPTH_FADE = /* glsl */ `
  uniform sampler2D uSceneDepth; uniform vec2 uResolution; uniform vec2 uCamNearFar;
  float linearDepth(float d) { float n = uCamNearFar.x, f = uCamNearFar.y; return (n * f) / (f - d * (f - n)); }
  float sceneFade(float viewZ) {
    float sz = linearDepth(texture2D(uSceneDepth, gl_FragCoord.xy / uResolution).r);
    return clamp((sz - viewZ) * 0.5, 0.0, 1.0);
  }`;

function beaconMaterial(uniforms: Record<string, THREE.IUniform>, beam: boolean) {
  return new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: beam,
    premultipliedAlpha: true,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec4 aGlow; // rgb colour, w = size
      uniform float uTime;
      varying vec3 vCol; varying vec2 vUv; varying float vViewZ; varying float vSeed; varying float vSize;
      void main() {
        vSize = aGlow.w;
        vec3 c = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vSeed = fract(c.x * 0.137 + c.z * 0.071);
        vCol = aGlow.rgb; vUv = uv;
        ${beam ? `
        // cylindrical billboard: stays upright, turns to face the camera
        vec3 toCam = cameraPosition - c; toCam.y = 0.0;
        vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam + vec3(1e-4, 0.0, 0.0)));
        float w = 0.55 + aGlow.w * 0.07;
        vec3 p = c + right * position.x * w + vec3(0.0, (position.y + 0.5) * aGlow.w - 0.6, 0.0);` : `
        float pulse = 1.0 + 0.06 * sin(uTime * 2.4 + vSeed * 30.0);
        vec3 p = c + vec3(position.x, 0.0, -position.y) * aGlow.w * pulse + vec3(0.0, 0.1, 0.0);`}
        vec4 mv = viewMatrix * vec4(p, 1.0);
        vViewZ = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vCol; varying vec2 vUv; varying float vViewZ; varying float vSeed; varying float vSize;
      ${DEPTH_FADE}
      void main() {
        ${beam ? `
        float x = vUv.x * 2.0 - 1.0, y = vUv.y;
        float core = exp(-x * x * 18.0);
        float soft = exp(-x * x * 3.5) * 0.35;
        float rise = 0.75 + 0.25 * sin(y * 14.0 - uTime * 3.2 + vSeed * 20.0);
        float fall = pow(max(1.0 - y, 0.0), 1.7) * smoothstep(0.0, 0.06, y);
        float a = (core + soft) * fall * rise * 0.55;` : `
        vec2 q = vUv * 2.0 - 1.0;
        float r = length(q);
        if (r > 1.0) discard;
        // pow() of a negative base is undefined (NaN on ANGLE/D3D), so square by hand
        float rd = (r - 0.62 - 0.05 * sin(uTime * 2.0 + vSeed * 9.0)) * 9.0;
        float ring = exp(-rd * rd) * 0.7;
        float pool = pow(1.0 - r, 3.0) * 0.6;
        float ang = atan(q.y, q.x + 1e-5);
        float rays = pow(max(0.0, sin(ang * 6.0 + uTime * 0.7 + vSeed * 6.0)), 6.0) * (1.0 - r) * 0.7 * smoothstep(2.5, 3.8, vSize);
        float a = (ring + pool + rays) * (1.0 - smoothstep(0.85, 1.0, r));`}
        a *= sceneFade(vViewZ);
        if (a < 0.002) discard;
        gl_FragColor = vec4(vCol * a, 0.0);
      }`,
  });
}

export class Loot {
  readonly group = new THREE.Group();
  /** Additive beacons; belongs in the water/fx pass. */
  readonly fx = new THREE.Group();
  private items: Item[] = [];
  private solid: THREE.InstancedMesh[] = [];
  private glow: (THREE.InstancedMesh | null)[] = [];
  private beams!: THREE.InstancedMesh;
  private halos!: THREE.InstancedMesh;
  private beamAttr!: THREE.InstancedBufferAttribute;
  private haloAttr!: THREE.InstancedBufferAttribute;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();

  constructor() {
    const mat = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.15 }), { clouds: true, caustics: true });
    const shine = new THREE.MeshBasicMaterial({ vertexColors: true });
    const make = (g: THREE.BufferGeometry, m: THREE.Material, shadow: boolean) => {
      const im = new THREE.InstancedMesh(g, m, MAX);
      im.count = 0;
      im.castShadow = shadow;
      im.frustumCulled = false;
      this.group.add(im);
      return im;
    };
    this.solid.push(make(barrel(), mat, true));
    this.glow.push(null);
    for (const st of STYLES) {
      const [s, g] = chest(st);
      this.solid.push(make(s, mat, true));
      this.glow.push(g ? make(g, shine, false) : null);
    }
  }

  /** Builds the light beacons; call once the fx depth uniforms exist. */
  buildBeacons(fxUniforms: Record<string, THREE.IUniform>, time: THREE.IUniform) {
    const u = { ...fxUniforms, uTime: time };
    const beamGeo = new THREE.PlaneGeometry(1, 1, 1, 1);
    const haloGeo = new THREE.PlaneGeometry(2, 2, 1, 1);
    this.beamAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.haloAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
    beamGeo.setAttribute('aGlow', this.beamAttr);
    haloGeo.setAttribute('aGlow', this.haloAttr);
    this.beams = new THREE.InstancedMesh(beamGeo, beaconMaterial(u, true), MAX);
    this.halos = new THREE.InstancedMesh(haloGeo, beaconMaterial(u, false), MAX);
    for (const im of [this.beams, this.halos]) {
      im.count = 0;
      im.frustumCulled = false;
      this.fx.add(im);
    }
    this.halos.renderOrder = 4;
    this.beams.renderOrder = 21;
  }

  /** Scatter salvage. `luck` 0..1 improves chest odds; `jackpot` guarantees a fine chest. */
  drop(x: number, z: number, count: number, luck = 0, jackpot = false) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 3 + Math.random() * 8;
      const isChest = (jackpot && i === 0) || Math.random() < 0.16 + luck * 0.1;
      const tier: Tier = isChest ? rollTier(luck, jackpot && i === 0 ? 2 : 1) : 0;
      this.items.push({
        x: x + Math.cos(a) * r,
        z: z + Math.sin(a) * r,
        tier,
        goods: rollContents(tier as Rarity),
        heal: HEAL[tier],
        spin: (Math.random() - 0.5) * 0.4,
        phase: Math.random() * 10,
        age: 0,
        sparkle: 0,
      });
    }
  }

  /** Puts goods the hold had no room for back on the water, bobbing in a barrel or chest of their rarity. */
  float(x: number, z: number, goods: LootId[], tier: Tier) {
    if (!goods.length) return;
    this.items.push({ x, z, tier, goods, heal: 0, spin: (Math.random() - 0.5) * 0.4, phase: Math.random() * 10, age: 0, sparkle: 0 });
  }

  /** Returns collected items for the given collector position. */
  update(dt: number, world: World, collector: THREE.Vector3 | null, radius: number, refuse?: (it: Item) => boolean): Item[] {
    const got: Item[] = [];
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.age += dt;
      // drift with the wind
      it.x += world.wind.dirX * 0.25 * dt;
      it.z += world.wind.dirZ * 0.25 * dt;
      if (collector) {
        const dx = collector.x - it.x, dz = collector.z - it.z;
        const d = Math.hypot(dx, dz);
        if (d < radius && refuse?.(it)) {
          // nothing aboard has room for it: it drifts on untouched
        } else if (d < radius * 0.5) {
          got.push(it);
          this.items.splice(i, 1);
          continue;
        } else if (d < radius) {
          // magnet: pull harder the closer it gets
          const pull = Math.min(d, (6 + 26 * (1 - d / radius)) * dt);
          it.x += (dx / d) * pull;
          it.z += (dz / d) * pull;
        }
      }
      if (it.age > 240 + it.tier * 60) {
        this.items.splice(i, 1);
        continue;
      }
    }
    const counts = [0, 0, 0, 0, 0];
    let nb = 0, nh = 0;
    for (const it of this.items) {
      const k = it.tier;
      const R = RARITY[k];
      const idx = counts[k]++;
      if (idx >= MAX) continue;
      const y = world.waterHeight(it.x, it.z);
      // fade in from the deep on drop, fade out in the last few seconds
      const life = 240 + k * 60;
      const fade = Math.min(1, it.age * 1.5, (life - it.age) / 4);
      this.e.set(Math.sin(world.time * 1.3 + it.phase) * 0.18, it.phase + world.time * it.spin, Math.cos(world.time * 1.1 + it.phase) * 0.15);
      this.q.setFromEuler(this.e);
      const sc = R.scale * (k >= 3 ? 1 + 0.03 * Math.sin(world.time * 3 + it.phase) : 1);
      this.v.set(it.x, y + (k ? 0.05 + (sc - 1) * 0.4 : -0.05), it.z);
      this.m.compose(this.v, this.q, this.s.setScalar(sc));
      this.solid[k].setMatrixAt(idx, this.m);
      this.glow[k]?.setMatrixAt(idx, this.m);
      if (this.beams && k > 0 && nh < MAX) {
        this.m.makeTranslation(it.x, y, it.z);
        const shimmer = 0.85 + 0.15 * Math.sin(world.time * 4 + it.phase * 3);
        const g = R.glow;
        this.halos.setMatrixAt(nh, this.m);
        this.haloAttr.setXYZW(nh, g[0] * fade * 0.3, g[1] * fade * 0.3, g[2] * fade * 0.3, R.halo);
        nh++;
        if (R.beam > 0) {
          this.beams.setMatrixAt(nb, this.m);
          this.beamAttr.setXYZW(nb, g[0] * fade * shimmer, g[1] * fade * shimmer, g[2] * fade * shimmer, R.beam);
          nb++;
        }
      }
      it.sparkle += dt;
      if (it.sparkle > R.sparkle) {
        it.sparkle = 0;
        this.v.y = y;
        world.particles.sparkle(this.v, k ? R.glow : undefined, k >= 3 ? 1.5 : 1);
      }
    }
    this.solid.forEach((m, k) => {
      m.count = Math.min(MAX, counts[k]);
      m.instanceMatrix.needsUpdate = true;
      const g = this.glow[k];
      if (g) {
        g.count = m.count;
        g.instanceMatrix.needsUpdate = true;
      }
    });
    if (this.beams) {
      this.beams.count = nb;
      this.halos.count = nh;
      this.beams.instanceMatrix.needsUpdate = this.halos.instanceMatrix.needsUpdate = true;
      this.beamAttr.needsUpdate = this.haloAttr.needsUpdate = true;
    }
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
