import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { patchMaterial, globalUniforms } from '../render/environment';
import type { Particles } from '../fx/particles';
import type { Ship } from '../ships/ship';
import type { World } from './world';

// The Treasure Vault's stage, out on the real sea: a gilded sea chest that
// surfaces off your ship's quarter, trembles as the luck inside climbs through
// the rarities, then bursts open in a column of light, a fan of god rays, a
// shockwave across the water and a fountain of coins. Everything here is built
// at start-up and drawn by the loading-screen warm-up, so nothing compiles
// when the vault opens.

/** HDR glow per vault rarity (common, rare, epic, legendary). */
const GLOW: [number, number, number][] = [
  [0.7, 2.4, 2.0],
  [0.6, 1.5, 3.4],
  [2.2, 0.8, 3.6],
  [4.0, 2.4, 0.7],
];
/** The warm lamplight of a closed chest at rest. */
const REST: [number, number, number] = [2.6, 1.6, 0.55];

export type StageShot = 'home' | 'charge' | 'burst' | 'cards' | 'ship' | 'guns';

const W = 2.1; // chest width (along the ship)
const H = 1.15; // body height
const D = 1.35; // depth

function colored(geo: THREE.BufferGeometry, hex: number, boost = 1) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const c = new THREE.Color(hex).convertSRGBToLinear().multiplyScalar(boost);
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

function rnd(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

const WOOD = 0x6b2f1a;
const WOOD_DK = 0x3c170c;
const GOLD = 0xf2c25a;
const GOLD_DK = 0xb27a22;

/** Body (wood, gold) and lid (wood, gold) geometries, the lid hinged at its own origin. */
function chestGeometry() {
  const wood: THREE.BufferGeometry[] = [];
  const gold: THREE.BufferGeometry[] = [];
  // the body: planked mahogany
  wood.push(colored(at(new THREE.BoxGeometry(W, H, D), 0, H / 2, 0), WOOD));
  for (const y of [0.3, 0.62, 0.92]) {
    for (const z of [-1, 1]) wood.push(colored(at(new THREE.BoxGeometry(W - 0.02, 0.025, 0.02), 0, y, z * (D / 2 + 0.005)), WOOD_DK));
  }
  // gilded rims, straps, corner caps and feet
  gold.push(colored(at(new THREE.BoxGeometry(W + 0.1, 0.12, D + 0.1), 0, 0.06, 0), GOLD_DK));
  gold.push(colored(at(new THREE.BoxGeometry(W + 0.08, 0.09, D + 0.08), 0, H - 0.04, 0), GOLD));
  const xs = [-0.66, 0, 0.66];
  for (const x of xs) gold.push(colored(at(new THREE.BoxGeometry(0.14, H + 0.02, D + 0.06), x, H / 2, 0), x === 0 ? GOLD : GOLD_DK));
  for (const cx of [-1, 1]) {
    for (const cz of [-1, 1]) {
      gold.push(colored(at(new THREE.BoxGeometry(0.16, H + 0.06, 0.16), cx * (W / 2 - 0.02), H / 2, cz * (D / 2 - 0.02)), GOLD));
      gold.push(colored(at(new THREE.SphereGeometry(0.11, 10, 6), cx * (W / 2 - 0.06), -0.02, cz * (D / 2 - 0.06)), GOLD_DK));
    }
  }
  // studs along the top rim
  for (let i = 0; i < 9; i++) {
    const x = -W / 2 + 0.12 + (i * (W - 0.24)) / 8;
    for (const z of [-1, 1]) gold.push(colored(at(new THREE.SphereGeometry(0.035, 6, 4), x, H - 0.12, z * (D / 2 + 0.035)), 0xfff0b8));
  }
  // the lock: a shield-shaped plate with a keyhole
  const plate = new THREE.CylinderGeometry(0.26, 0.2, 0.06, 6);
  plate.rotateX(Math.PI / 2);
  gold.push(colored(at(plate, 0, H - 0.3, D / 2 + 0.06), GOLD));
  wood.push(colored(at(new THREE.BoxGeometry(0.05, 0.12, 0.02), 0, H - 0.38, D / 2 + 0.1), 0x120806));
  // ring handles on the ends
  for (const sx of [-1, 1]) {
    const h = new THREE.TorusGeometry(0.17, 0.035, 6, 14);
    h.rotateY(Math.PI / 2);
    gold.push(colored(at(h, sx * (W / 2 + 0.06), H * 0.55, 0), GOLD_DK));
  }

  // the lid: a half barrel hinged along its back edge (origin = hinge)
  const lw: THREE.BufferGeometry[] = [];
  const lg: THREE.BufferGeometry[] = [];
  const R = D / 2;
  const shell = new THREE.CylinderGeometry(R, R, W, 20, 1, true, 0, Math.PI);
  shell.rotateZ(Math.PI / 2);
  lw.push(colored(shell, WOOD));
  for (const sx of [-1, 1]) {
    const cap = new THREE.CircleGeometry(R, 20, 0, Math.PI);
    cap.rotateY(sx * Math.PI / 2);
    lw.push(colored(at(cap, (sx * W) / 2, 0, 0), WOOD_DK));
  }
  // underside panel, seen when the lid stands open
  lw.push(colored(at(new THREE.BoxGeometry(W - 0.04, 0.04, D - 0.04), 0, 0.03, 0), WOOD_DK));
  for (const x of xs) {
    const strap = new THREE.CylinderGeometry(R + 0.045, R + 0.045, 0.15, 20, 1, false, 0, Math.PI);
    strap.rotateZ(Math.PI / 2);
    lg.push(colored(at(strap, x, 0, 0), x === 0 ? GOLD : GOLD_DK));
    for (let k = 1; k < 6; k++) {
      const a = (k / 6) * Math.PI;
      lg.push(colored(at(new THREE.SphereGeometry(0.04, 6, 4), x + 0.11, Math.sin(a) * (R + 0.05), Math.cos(a) * (R + 0.05)), 0xfff0b8));
    }
  }
  const lip = new THREE.BoxGeometry(W + 0.08, 0.08, 0.08);
  lg.push(colored(at(lip, 0, 0.03, R), GOLD));
  lg.push(colored(at(lip.clone(), 0, 0.03, -R), GOLD));
  // a crown ornament on top
  const crest = new THREE.TorusGeometry(0.13, 0.035, 6, 16);
  lg.push(colored(at(crest, 0, R + 0.16, 0), GOLD));
  // hasp hanging over the lock
  lg.push(colored(at(new THREE.BoxGeometry(0.12, 0.2, 0.05), 0, -0.06, R + 0.04), GOLD_DK));
  const lid = [mergeGeometries(lw), mergeGeometries(lg)];
  // move the hinge to the back edge
  for (const g of lid) g.translate(0, 0, R);
  return { body: [mergeGeometries(wood), mergeGeometries(gold)], lid };
}

/** The hoard heaped inside: a glowing mound of coins with jewels on top. */
function hoardGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const heap = new THREE.SphereGeometry(0.62, 18, 7, 0, Math.PI * 2, 0, Math.PI / 2);
  heap.scale(1.45, 0.42, 0.88);
  parts.push(colored(at(heap, 0, H - 0.05, 0), 0xffc24a));
  const r = rnd(11);
  for (let i = 0; i < 26; i++) {
    const c = new THREE.CylinderGeometry(0.085, 0.085, 0.022, 10);
    c.rotateX((r() - 0.5) * 1.8);
    c.rotateZ((r() - 0.5) * 1.8);
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * 0.72;
    parts.push(colored(at(c, Math.cos(a) * d * 1.15, H + 0.08 + r() * 0.18 * (1 - d), Math.sin(a) * d * 0.62), 0xffe08a));
  }
  const jewels = [0xff3c64, 0x3cf0a0, 0x50a8ff, 0xc070ff];
  for (let i = 0; i < 7; i++) {
    const j = new THREE.OctahedronGeometry(0.075, 0);
    const a = r() * Math.PI * 2;
    const d = 0.15 + r() * 0.45;
    parts.push(colored(at(j, Math.cos(a) * d, H + 0.22, Math.sin(a) * d * 0.55), jewels[i % jewels.length], 1.4));
  }
  return mergeGeometries(parts);
}

// ------------------------------------------------------------------ light shaders

const DEPTH_FADE = /* glsl */ `
  uniform sampler2D uSceneDepth; uniform vec2 uResolution; uniform vec2 uCamNearFar;
  float linearDepth(float d) { float n = uCamNearFar.x, f = uCamNearFar.y; return (n * f) / (f - d * (f - n)); }
  float sceneFade(float viewZ, float soft) {
    float sz = linearDepth(texture2D(uSceneDepth, gl_FragCoord.xy / uResolution).r);
    return clamp((sz - viewZ) * soft, 0.0, 1.0);
  }`;

/**
 * One additive shader with four looks, picked by a define:
 * 0 a column of light, 1 a cone of god rays, 2 a glow with star spikes and a
 * lens streak, 3 a shockwave ring on the water.
 */
function lightMaterial(kind: 0 | 1 | 2 | 3, fx: Record<string, THREE.IUniform>) {
  return new THREE.ShaderMaterial({
    defines: { KIND: kind },
    uniforms: {
      ...fx,
      uTime: globalUniforms.uTime,
      uColor: { value: new THREE.Vector3(1, 1, 1) },
      uAmt: { value: 0 },
      uK: { value: new THREE.Vector4(1, 1, 1, 0) },
    },
    transparent: true,
    depthWrite: false,
    depthTest: kind < 2,
    side: kind === 1 ? THREE.DoubleSide : THREE.FrontSide,
    blending: THREE.AdditiveBlending,
    premultipliedAlpha: true,
    vertexShader: /* glsl */ `
      uniform vec4 uK;
      uniform float uTime;
      varying vec2 vUv; varying float vViewZ; varying float vAng; varying float vH;
      void main() {
        vUv = uv;
        vec3 c = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vec4 mv;
        #if KIND == 0
          // a column that turns to face the camera, standing upright
          vec3 toCam = cameraPosition - c; toCam.y = 0.0;
          vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam + vec3(1e-4, 0.0, 0.0)));
          vec3 p = c + right * position.x * uK.x + vec3(0.0, (position.y + 0.5) * uK.y, 0.0);
          mv = viewMatrix * vec4(p, 1.0);
        #elif KIND == 1
          vAng = atan(position.z, position.x);
          vH = position.y / uK.y;
          vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
          mv = viewMatrix * vec4(p, 1.0);
        #elif KIND == 2
          mv = viewMatrix * vec4(c, 1.0);
          // nudged toward the camera so the chest's own rim doesn't clip it
          mv.xyz += normalize(-mv.xyz) * uK.w;
          mv.xy += position.xy * uK.x;
        #else
          vec3 p = c + vec3(position.x, 0.0, -position.y) * uK.x + vec3(0.0, 0.08, 0.0);
          mv = viewMatrix * vec4(p, 1.0);
        #endif
        vViewZ = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uAmt; uniform vec4 uK; uniform float uTime;
      varying vec2 vUv; varying float vViewZ; varying float vAng; varying float vH;
      ${DEPTH_FADE}
      void main() {
        float a;
        #if KIND == 0
          float x = vUv.x * 2.0 - 1.0, y = vUv.y;
          float core = exp(-x * x * 26.0) * 1.3;
          float soft = exp(-x * x * 3.0) * 0.32;
          float rise = 0.72 + 0.28 * sin(y * 26.0 - uTime * 7.0) * sin(y * 9.0 - uTime * 3.1 + x * 2.0);
          float fall = (1.0 - y) * (1.0 - y) * smoothstep(0.0, 0.05, y);
          a = (core + soft) * rise * fall * sceneFade(vViewZ, 0.8);
        #elif KIND == 1
          float t = uTime * uK.z;
          float r1 = max(0.0, sin(vAng * 9.0 + t + sin(vAng * 3.0 + t * 0.7) * 1.4));
          float r2 = max(0.0, sin(vAng * 14.0 - t * 1.3 + 1.7));
          r1 *= r1; r1 *= r1; r1 *= r1;
          r2 *= r2; r2 *= r2; r2 *= r2; r2 *= r2;
          float h = clamp(vH, 0.0, 1.0);
          float fade = (1.0 - h) * (1.0 - h) * smoothstep(0.0, 0.12, h);
          a = (r1 * 0.75 + r2 * 0.55 + 0.06) * fade * sceneFade(vViewZ, 0.6);
        #elif KIND == 2
          vec2 q = vUv * 2.0 - 1.0;
          float r2 = dot(q, q);
          if (r2 > 1.0) discard;
          float core = exp(-r2 * 28.0) * 1.7 + exp(-r2 * 6.0) * 0.5 + exp(-r2 * 1.6) * 0.12;
          float streak = exp(-q.y * q.y * 700.0) * exp(-q.x * q.x * 2.2) * uK.y;
          float ang = atan(q.y, q.x) + uTime * 0.25;
          float sp = max(0.0, cos(ang * 4.0));
          sp *= sp; sp *= sp; sp *= sp; sp *= sp; sp *= sp;
          float spikes = sp * (1.0 - sqrt(r2)) * uK.z;
          a = (core + streak + spikes) * (1.0 - smoothstep(0.7, 1.0, r2)) * sceneFade(vViewZ, 1.5);
        #else
          vec2 q = vUv * 2.0 - 1.0;
          float r = length(q);
          if (r > 1.0) discard;
          // pow() of a negative base is NaN on ANGLE, so square by hand
          float d = (r - 0.86) * 16.0;
          float band = exp(-d * d);
          float fill = r * r * 0.18;
          a = (band + fill) * (1.0 - smoothstep(0.93, 1.0, r)) * sceneFade(vViewZ, 0.5);
        #endif
        a *= uAmt;
        if (a < 0.002) discard;
        gl_FragColor = vec4(uColor * a, 0.0);
      }`,
  });
}

interface Light {
  mesh: THREE.Mesh;
  u: { uColor: { value: THREE.Vector3 }; uAmt: { value: number }; uK: { value: THREE.Vector4 } };
}

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

const sstep = (k: number) => k * k * (3 - 2 * k);
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class VaultStage {
  /** Opaque scene: the chest and its hoard. */
  readonly group = new THREE.Group();
  /** Water/fx pass: the light. */
  readonly fx = new THREE.Group();
  onShake: (a: number) => void = () => {};
  onSplash: (at: THREE.Vector3, big: number) => void = () => {};
  onFirework: (at: THREE.Vector3) => void = () => {};

  private chest = new THREE.Group();
  private lidPivot = new THREE.Group();
  private gemMat: THREE.MeshBasicMaterial;
  private hoardMat: THREE.MeshBasicMaterial;
  private beam: Light;
  private rays: Light;
  private glow: Light;
  private seam: Light;
  private ring: Light;

  // where the chest floats and how it is framed
  readonly pos = new THREE.Vector3();
  private out = new THREE.Vector3(1, 0, 0);
  private fwd = new THREE.Vector3(0, 0, 1);
  private ship: Ship | null = null;
  active = false;

  // animation
  private rise = 0;
  private riseTarget = 0;
  private splashed = false;
  private lid = 0;
  private lidVel = 0;
  private lidTarget = 0;
  private rattle = 0;
  private shake = 0;
  private col = new THREE.Vector3(...REST);
  private colTarget = new THREE.Vector3(...REST);
  private beamAmt = 0;
  private raysAmt = 0;
  private glowAmt = 0;
  private seamAmt = 0;
  private seamTarget = 0;
  private flash = 0;
  private ringT = -1;
  private ringBig = 1;
  private open = false;
  /** Dims the open chest while the showcase has the ship on stage. */
  hushed = false;
  private hush = 0;
  private t = 0;
  private sparkT = 0;
  private fireworks: { at: number; tier: number }[] = [];
  private time = 0;

  constructor(fxUniforms: Record<string, THREE.IUniform>) {
    const { body, lid } = chestGeometry();
    const wood = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.04 }), { clouds: true, caustics: true });
    const gold = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.26, metalness: 0.9 }), { clouds: true, caustics: true });
    const mk = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D) => {
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    mk(body[0], wood, this.chest);
    mk(body[1], gold, this.chest);
    this.lidPivot.position.set(0, H, -D / 2);
    mk(lid[0], wood, this.lidPivot);
    mk(lid[1], gold, this.lidPivot);
    this.chest.add(this.lidPivot);
    // white vertex colour times a material colour, so the gem can change hue without a new shader
    this.gemMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(...REST) });
    const gem = new THREE.OctahedronGeometry(0.1, 0);
    gem.scale(1, 1.25, 0.55);
    const gemMesh = new THREE.Mesh(colored(at(gem, 0, H - 0.26, D / 2 + 0.11), 0xffffff), this.gemMat);
    this.chest.add(gemMesh);
    this.hoardMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1, 1, 1) });
    const hoard = new THREE.Mesh(hoardGeometry(), this.hoardMat);
    this.chest.add(hoard);
    this.group.add(this.chest);
    this.group.visible = false;
    this.group.name = 'vault-chest';

    const light = (kind: 0 | 1 | 2 | 3, geo: THREE.BufferGeometry, order: number): Light => {
      const m = lightMaterial(kind, fxUniforms);
      const mesh = new THREE.Mesh(geo, m);
      mesh.frustumCulled = false;
      mesh.renderOrder = order;
      this.fx.add(mesh);
      return { mesh, u: m.uniforms as unknown as Light['u'] };
    };
    this.beam = light(0, new THREE.PlaneGeometry(1, 1), 22);
    this.beam.u.uK.value.set(2.6, 46, 0, 0);
    const cone = new THREE.CylinderGeometry(6.5, 0.55, 8, 64, 1, true);
    cone.translate(0, 4, 0);
    this.rays = light(1, cone, 21);
    this.rays.u.uK.value.set(1, 8, 0.5, 0);
    this.glow = light(2, new THREE.PlaneGeometry(2, 2), 24);
    this.glow.u.uK.value.set(4, 1, 1, 1.4);
    this.seam = light(2, new THREE.PlaneGeometry(2, 2), 23);
    this.seam.u.uK.value.set(2.4, 1.6, 0.5, 0.5);
    this.ring = light(3, new THREE.PlaneGeometry(2, 2), 5);
    this.fx.visible = false;
  }

  /** Surfaces the chest beside `ship`, on the side `side` (+1 port, -1 starboard). */
  show(ship: Ship, side: 1 | -1) {
    this.ship = ship;
    this.place(side);
    this.active = true;
    this.group.visible = true;
    this.fx.visible = true;
    this.rise = 0;
    this.riseTarget = 1;
    this.splashed = false;
    this.open = this.hushed = false;
    this.hush = 0;
    this.lid = this.lidVel = this.lidTarget = 0;
    this.rattle = this.shake = 0;
    this.colTarget.set(...REST);
    this.col.copy(this.colTarget);
    this.beamAmt = this.raysAmt = this.seamAmt = this.seamTarget = this.flash = 0;
    this.glowAmt = 0;
    this.ringT = -1;
    this.fireworks.length = 0;
    this.t = 0;
  }

  /** Sinks the chest back into the deep. */
  hide() {
    this.riseTarget = 0;
    this.lidTarget = 0;
    this.open = false;
    this.seamTarget = 0;
    this.rattle = this.shake = 0;
    this.fireworks.length = 0;
  }

  private place(side: 1 | -1) {
    const s = this.ship!;
    s.portDir(this.out).multiplyScalar(side).setY(0).normalize();
    this.fwd.set(Math.sin(s.heading), 0, Math.cos(s.heading));
    const L = s.cls.length;
    this.pos.set(s.pos.x, 0, s.pos.z).addScaledVector(this.out, s.cls.beam / 2 + 5.2).addScaledVector(this.fwd, -(L * 0.5 + 2));
  }

  /** The luck inside climbs a step: the chest shakes harder and glows in that rarity's colour. */
  charge(tier: number) {
    this.colTarget.set(...GLOW[tier]);
    this.rattle = 0.05 + tier * 0.035;
    this.shake = 0.012 + tier * 0.014;
    this.seamTarget = 0.5 + tier * 0.35;
    this.flash = Math.max(this.flash, 0.6 + tier * 0.25);
    this.ringT = 0;
    this.ringBig = 0.45 + tier * 0.12;
    this.onShake(0.18 + tier * 0.1);
    this.spurt(10 + tier * 8, 0.8);
  }

  /** The lid bursts open on the best find. */
  burst(tier: number) {
    this.open = true;
    this.colTarget.set(...GLOW[tier]);
    this.col.copy(this.colTarget);
    this.rattle = 0;
    this.shake = 0;
    this.seamTarget = 0;
    this.lidTarget = 1.95;
    this.lidVel = 9 + tier * 1.5;
    this.beamAmt = 2.6 + tier * 0.6;
    this.raysAmt = 1.6 + tier * 0.4;
    this.flash = 2.4 + tier * 0.8;
    this.ringT = 0;
    this.ringBig = 1 + tier * 0.45;
    this.onShake(0.55 + tier * 0.2);
    this.burstFx = { tier, top: this.mouth(new THREE.Vector3()) };
    if (tier >= 2) for (let i = 0; i < (tier === 3 ? 7 : 3); i++) this.fireworks.push({ at: this.t + 0.35 + i * (tier === 3 ? 0.22 : 0.3), tier });
  }
  private burstFx: { tier: number; top: THREE.Vector3 } | null = null;

  /** A card turns over: the column and glow flare in its colour. */
  pulse(tier: number) {
    this.colTarget.set(...GLOW[tier]);
    this.flash = Math.max(this.flash, 0.9 + tier * 0.5);
    this.beamAmt = Math.max(this.beamAmt, 1.4 + tier * 0.5);
    if (tier >= 2) {
      this.ringT = 0;
      this.ringBig = 0.6 + tier * 0.25;
    }
    this.pulseFx = tier;
  }
  private pulseFx = -1;

  /** Back to the closed chest at rest (the vault's home). */
  settle() {
    this.open = false;
    this.lidTarget = 0;
    this.rattle = this.shake = 0;
    this.seamTarget = 0;
    this.colTarget.set(...REST);
    this.fireworks.length = 0;
  }

  /** The chest's mouth in world space. */
  mouth(out: THREE.Vector3) {
    return out.set(0, H + 0.3, 0).applyMatrix4(this.chest.matrixWorld);
  }

  update(dt: number, world: World, particles: Particles) {
    if (!this.active) return;
    this.particles = particles;
    this.t += dt;
    this.time += dt;
    // rising out of the deep, or sinking back into it
    this.rise += (this.riseTarget - this.rise) * Math.min(1, dt * (this.riseTarget > this.rise ? 1.6 : 2.2));
    if (this.riseTarget === 0 && this.rise < 0.02) {
      this.active = false;
      this.group.visible = false;
      this.fx.visible = false;
      return;
    }
    // the moored or anchored ship can drift a touch: keep station beside her
    if (this.ship) {
      const side = this.out.dot(this.ship.portDir(_w)) >= 0 ? 1 : -1;
      this.place(side as 1 | -1);
    }
    const p = this.pos;
    const wh = world.waterHeight(p.x, p.z);
    // float on the swell: heave, pitch and roll from the surface around it
    const hx = world.waterHeight(p.x + this.fwd.x * 1.2, p.z + this.fwd.z * 1.2) - world.waterHeight(p.x - this.fwd.x * 1.2, p.z - this.fwd.z * 1.2);
    const hz = world.waterHeight(p.x + this.out.x * 0.8, p.z + this.out.z * 0.8) - world.waterHeight(p.x - this.out.x * 0.8, p.z - this.out.z * 0.8);
    const r = sstep(Math.min(1, this.rise * 1.08));
    const sink = (1 - r) * 3.4;
    const y = wh - 0.42 - sink + Math.sin(this.time * 1.7) * 0.05;
    if (!this.splashed && this.riseTarget > 0 && this.rise > 0.45) {
      this.splashed = true;
      this.onSplash(_v.set(p.x, wh, p.z), 1.4);
      particles.splash(_v, 1.6);
      world.wake.push(p.x, p.z, 3.2, -0.5);
      world.wake.stamp(p.x, p.z, 4.5, 0.9, true);
      this.ringT = 0;
      this.ringBig = 0.7;
      this.flash = 1.2;
    }
    // the shake that builds while it charges
    const sh = this.shake;
    const jx = sh ? (Math.sin(this.time * 61) + Math.sin(this.time * 37)) * sh : 0;
    const jz = sh ? Math.sin(this.time * 53 + 1) * sh : 0;
    const yaw = Math.atan2(this.fwd.x, this.fwd.z);
    this.chest.position.set(p.x + jx, y + (sh ? Math.abs(Math.sin(this.time * 29)) * sh * 2 : 0), p.z + jz);
    _e.set(Math.atan2(hx, 2.4) * 0.6 + (sh ? Math.sin(this.time * 43) * sh * 0.9 : 0), yaw, -Math.atan2(hz, 1.6) * 0.6 + (sh ? Math.sin(this.time * 47) * sh * 1.2 : 0), 'YXZ');
    this.chest.quaternion.setFromEuler(_e);
    // lid: a springy hinge, rattling while the chest charges
    const want = this.lidTarget + (this.rattle ? Math.max(0, Math.sin(this.time * 23) * Math.sin(this.time * 9)) * this.rattle : 0);
    this.lidVel += ((want - this.lid) * 90 - this.lidVel * 9) * dt;
    this.lid += this.lidVel * dt;
    this.lidPivot.rotation.x = -this.lid;
    this.chest.updateMatrixWorld(true);

    // light
    this.col.lerp(this.colTarget, Math.min(1, dt * 4));
    const c = this.col;
    this.flash = Math.max(0, this.flash - dt * 2.6);
    this.seamAmt += (this.seamTarget - this.seamAmt) * Math.min(1, dt * 5);
    const openK = this.open ? sstep(Math.min(1, this.lid / 1.4)) : 0;
    this.hush += ((this.hushed ? 1 : 0) - this.hush) * Math.min(1, dt * 2);
    const quiet = 1 - this.hush * 0.82;
    const restBeam = this.open ? (0.9 + Math.sin(this.time * 2.2) * 0.12) * quiet : 0;
    this.beamAmt += (restBeam - this.beamAmt) * Math.min(1, dt * 1.6);
    this.raysAmt += ((this.open ? 0.75 * quiet : 0) - this.raysAmt) * Math.min(1, dt * 1.4);
    this.glowAmt = (this.open ? (0.55 + openK * 0.35) * (0.4 + quiet * 0.6) : 0.12 + this.seamAmt * 0.25) * r + this.flash * 0.9;
    const mouth = this.mouth(_v);
    this.beam.mesh.position.copy(mouth);
    this.beam.u.uColor.value.copy(c);
    this.beam.u.uAmt.value = this.beamAmt * r * 0.55;
    this.rays.mesh.position.copy(mouth).addScaledVector(UP, -0.3);
    this.rays.mesh.quaternion.copy(this.chest.quaternion);
    this.rays.u.uColor.value.copy(c);
    this.rays.u.uAmt.value = this.raysAmt * openK * 0.45;
    this.glow.mesh.position.copy(mouth);
    this.glow.u.uColor.value.copy(c);
    this.glow.u.uAmt.value = this.glowAmt;
    // shut, the glow backlights the chest so its outline stands against it;
    // open, it pours out of the mouth toward the camera
    this.glow.u.uK.value.set(2.6 + this.flash * 1.8, 0.8 + this.flash * 0.6, 0.6 + this.flash * 0.5, this.open ? 1.4 : -1.1);
    // the seam: light leaking round the lid and out of the keyhole
    _w.set(0, H - 0.05, D / 2 + 0.12).applyMatrix4(this.chest.matrixWorld);
    this.seam.mesh.position.copy(_w);
    this.seam.u.uColor.value.copy(c);
    this.seam.u.uAmt.value = (this.open ? 0 : this.seamAmt * 0.7 + 0.06) * r;
    this.seam.u.uK.value.set(0.9 + this.seamAmt * 0.5, 1.2 + this.seamAmt * 1.4, 0.4 + this.seamAmt * 0.6, 0.6);
    // the gem and the hoard
    const gk = 0.7 + this.seamAmt * 0.9 + this.flash * 0.4 + (this.open ? 0.4 : 0);
    this.gemMat.color.setRGB(c.x * gk, c.y * gk, c.z * gk);
    const hk = 0.4 + openK * 1.6 + this.flash * 0.4;
    this.hoardMat.color.setRGB(hk, hk, hk);
    // shockwave across the water
    if (this.ringT >= 0) {
      this.ringT += dt;
      const k = this.ringT / (0.9 + this.ringBig * 0.3);
      if (k >= 1) this.ringT = -1;
      this.ring.mesh.position.set(p.x, wh, p.z);
      this.ring.u.uColor.value.copy(c);
      this.ring.u.uK.value.x = 1.5 + (1 - (1 - k) * (1 - k)) * 16 * this.ringBig;
      this.ring.u.uAmt.value = k < 1 ? (1 - k) * (1 - k) * 1.3 : 0;
    } else this.ring.u.uAmt.value = 0;

    // particles
    const tint: [number, number, number] = [c.x, c.y, c.z];
    if (this.burstFx) {
      const { tier, top } = this.burstFx;
      this.burstFx = null;
      particles.treasure(_w.copy(top).addScaledVector(UP, -0.6), [tint[0] * 0.5, tint[1] * 0.5, tint[2] * 0.5], tier + 1);
      this.coins(top, 30 + tier * 25, 1 + tier * 0.2);
      this.spurt(30 + tier * 20, 1.6);
      world.wake.push(p.x, p.z, 2.6 + tier * 0.6, -0.35 - tier * 0.12);
      world.wake.stamp(p.x, p.z, 5 + tier * 2, 1, true);
      this.onSplash(_w.set(p.x, wh, p.z), 0.6 + tier * 0.3);
    }
    if (this.pulseFx >= 0) {
      const tier = this.pulseFx;
      this.pulseFx = -1;
      this.spurt(8 + tier * 10, 1 + tier * 0.3);
      if (tier >= 2) this.coins(mouth, 8 + tier * 6, 0.8);
    }
    for (let i = this.fireworks.length - 1; i >= 0; i--) {
      const f = this.fireworks[i];
      if (this.t < f.at) continue;
      this.fireworks.splice(i, 1);
      this.firework(f.tier);
    }
    this.sparkT -= dt;
    if (this.sparkT <= 0 && r > 0.9) {
      this.sparkT = this.open ? 0.05 : this.seamAmt > 0.1 ? 0.07 : 0.4;
      if (this.open) {
        // motes drifting up the column
        const a = Math.random() * Math.PI * 2;
        const rr = rand(0.1, 0.8);
        this.emit({ x: mouth.x + Math.cos(a) * rr, y: mouth.y + rand(-0.2, 0.4), z: mouth.z + Math.sin(a) * rr, vx: rand(-0.3, 0.3), vy: rand(2.5, 6), vz: rand(-0.3, 0.3), life: rand(1.2, 2.4), size: rand(0.08, 0.2), sizeEnd: 0.02, color: [tint[0] * 1.4, tint[1] * 1.4, tint[2] * 1.4], drag: 0.3, kind: 2, fadeIn: 0.1 });
      } else if (this.seamAmt > 0.1) {
        this.spurt(2, 0.5);
      } else {
        // a glint off the gilding now and then
        _w.set(rand(-W / 2, W / 2), rand(0.2, H + 0.5), D / 2 + 0.1).applyMatrix4(this.chest.matrixWorld);
        particles.sparkle(_w, [1.3, 1.0, 0.5], 0.35);
      }
    }
  }

  private particles: Particles | null = null;

  private emit(e: Parameters<Particles['emit']>[0]) {
    this.particles?.emit(e, true);
  }

  /** Sparks squirting out of the seam (charging) or the mouth (open). */
  private spurt(n: number, power: number) {
    const m = this.chest.matrixWorld;
    const c = this.col;
    for (let i = 0; i < n; i++) {
      _w.set(rand(-W / 2, W / 2), H + 0.02, rand(-0.2, D / 2 + 0.1)).applyMatrix4(m);
      const a = Math.random() * Math.PI * 2;
      const sp = rand(1.5, 5) * power;
      this.emit({
        x: _w.x, y: _w.y, z: _w.z,
        vx: Math.cos(a) * sp * 0.6 + this.out.x * sp * 0.4, vy: rand(2, 7) * power, vz: Math.sin(a) * sp * 0.6 + this.out.z * sp * 0.4,
        life: rand(0.35, 0.8), size: rand(0.05, 0.12), sizeEnd: 0.02, color: [c.x * 1.6, c.y * 1.6, c.z * 1.6], colorEnd: [c.x * 0.4, c.y * 0.4, c.z * 0.4], grav: 7, drag: 1.2, kind: 2, fadeIn: 0.001,
      });
    }
  }

  /** Gold coins thrown up out of the chest, tumbling back into the sea. */
  private coins(at: THREE.Vector3, n: number, power: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = rand(0.5, 3.6) * power;
      this.emit({
        x: at.x + rand(-0.4, 0.4), y: at.y, z: at.z + rand(-0.3, 0.3),
        vx: Math.cos(a) * r + this.out.x * 1.2, vy: rand(6, 13) * power, vz: Math.sin(a) * r + this.out.z * 1.2,
        life: rand(1.1, 1.9), size: rand(0.16, 0.26), color: [5.5, 3.8, 1.1], colorEnd: [3, 1.6, 0.3], grav: 15, drag: 0.35, spin: rand(-16, 16), kind: 3, fadeIn: 0.001,
      });
    }
  }

  /** Epic and legendary: star shells bursting over the chest. */
  private firework(tier: number) {
    const top = this.mouth(_w).addScaledVector(UP, rand(9, 16));
    top.addScaledVector(this.fwd, rand(-5, 5)).addScaledVector(this.out, rand(-2, 4));
    const base = GLOW[tier];
    const n = tier === 3 ? 46 : 30;
    const hue = Math.random();
    for (let i = 0; i < n; i++) {
      // a sphere of sparks, some in the rarity colour, some white-gold
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const sp = rand(5, 8);
      const k = i % 3 === 0;
      const col: [number, number, number] = k ? [4.5, 3.6, 2] : tier === 3 && hue > 0.5 ? [base[0], base[1] * 0.8 + 0.6, base[2] + 1] : base;
      this.emit({
        x: top.x, y: top.y, z: top.z,
        vx: Math.cos(a) * s * sp, vy: u * sp + 1, vz: Math.sin(a) * s * sp,
        life: rand(0.9, 1.5), size: rand(0.18, 0.32), sizeEnd: 0.03, color: [col[0] * 1.5, col[1] * 1.5, col[2] * 1.5], colorEnd: [col[0] * 0.3, col[1] * 0.3, col[2] * 0.3], grav: 4, drag: 1.4, kind: 2, fadeIn: 0.001,
      });
    }
    this.emit({ x: top.x, y: top.y, z: top.z, life: 0.25, size: 3, sizeEnd: 6, color: [base[0] * 1.2, base[1] * 1.2, base[2] * 1.2], colorEnd: [0, 0, 0], kind: 0, fadeIn: 0.001 });
    this.onShake(0.08);
    this.onFirework(top);
  }

  /**
   * A camera framing: `fit` widens it when the screen area left free is narrow,
   * `t` slowly turns the ship shots.
   */
  shot(kind: StageShot, fit: number, t: number) {
    const s = this.ship!;
    const C = _v.copy(this.pos);
    const o = this.out;
    const f = this.fwd;
    const pos = new THREE.Vector3();
    const look = new THREE.Vector3();
    let fov = 40;
    switch (kind) {
      case 'home':
        pos.copy(C).addScaledVector(o, 6.4 * fit).addScaledVector(f, -4.8 * fit).addScaledVector(UP, 2.6 + fit * 0.4);
        look.copy(C).addScaledVector(UP, 1.15).addScaledVector(f, 1.2).addScaledVector(o, -0.6);
        break;
      case 'charge':
        pos.copy(C).addScaledVector(o, 4.4 * fit).addScaledVector(f, -3.1 * fit).addScaledVector(UP, 1.7);
        look.copy(C).addScaledVector(UP, 0.85);
        fov = 38;
        break;
      case 'burst':
        pos.copy(C).addScaledVector(o, 10.5 * fit).addScaledVector(f, -7.5 * fit).addScaledVector(UP, 2.4);
        look.copy(C).addScaledVector(UP, 3.2);
        fov = 46;
        break;
      case 'cards':
        pos.copy(C).addScaledVector(o, 9 * fit).addScaledVector(f, -6.5 * fit).addScaledVector(UP, 4.5);
        look.copy(C).addScaledVector(UP, 2.4);
        fov = 42;
        break;
      case 'ship': {
        const L = s.cls.length;
        const mastH = s.model.flagPivot.getWorldPosition(_w).y;
        look.set(s.pos.x, mastH * 0.36, s.pos.z);
        const a = 0.62 + Math.sin(t * 0.18) * 0.32;
        const d = (L * 1.12 + 17) * fit;
        const dir = _w.copy(o).multiplyScalar(Math.cos(a)).addScaledVector(f, Math.sin(a));
        pos.copy(look).addScaledVector(dir, d * 0.97).addScaledVector(UP, d * 0.2);
        fov = 36;
        break;
      }
      case 'guns': {
        // over the far rail, looking across the deck as the broadside goes out
        const L = s.cls.length;
        const hb = s.cls.beam / 2;
        pos.set(s.pos.x, 0, s.pos.z).addScaledVector(o, -(hb + 3) * fit).addScaledVector(f, L * 0.02).addScaledVector(UP, 6 + fit * 1.5);
        look.set(s.pos.x, 0, s.pos.z).addScaledVector(o, hb + 30).addScaledVector(f, L * 0.5).addScaledVector(UP, 1);
        fov = 50;
        break;
      }
    }
    pos.y = Math.max(pos.y, 1.6);
    return { pos, look, fov };
  }

  /** Which broadside faces the chest (and open water), and a point out there to aim at. */
  gunSide(out: THREE.Vector3): 'port' | 'starboard' {
    const s = this.ship!;
    out.set(s.pos.x, 0, s.pos.z).addScaledVector(this.out, 72).addScaledVector(this.fwd, 6);
    return this.out.dot(s.portDir(_w)) >= 0 ? 'port' : 'starboard';
  }

  /** Where the chest's mouth sits on screen (CSS px), for cards to fly out of. */
  screenPoint(camera: THREE.Camera, w: number, h: number) {
    const m = this.mouth(_w).project(camera);
    return { x: (m.x * 0.5 + 0.5) * w, y: (-m.y * 0.5 + 0.5) * h, front: m.z < 1 };
  }

  /** The chest's outline on screen, for the tap target. */
  screenRect(camera: THREE.Camera, w: number, h: number) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      _w.set(i & 1 ? W / 2 : -W / 2, i & 2 ? H + D / 2 : 0, i & 4 ? D / 2 : -D / 2).applyMatrix4(this.chest.matrixWorld).project(camera);
      const x = (_w.x * 0.5 + 0.5) * w;
      const y = (-_w.y * 0.5 + 0.5) * h;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
}
