import * as THREE from 'three';
import { CLOUD, cloudLo, cloudMix, GLSL_AERIAL, GLSL_ATMOS, globalUniforms } from './environment';
import { getSharedTextures } from './textures';
import { mulberry32 } from '../core/noise';

// The cumulus from a couple of kilometres out to the horizon, as seen from the
// deck. A flat cloud deck seen edge-on squashes every heap into a sliver (the
// field of white flecks this replaces); real fair-weather cumulus stand up off
// a flat grey base into sunlit cauliflower crowns. So every heap of the shared
// cloud field (one per Worley cell: the very heaps whose shadows cross the sea)
// is built out of a dozen lit balls like the low puffs seen from high up, cut
// flat along the cloud base, sized and heaped by how strong the field is there.
// The CPU only picks the heaps within reach and sorts the balls far to near a
// couple of times a second; the wind carries them along on the GPU.

/** Heaps start this far out (m); nearer cloud is the dome's belly deck. */
export const CUMULUS_NEAR = 520;
const NEAR = CUMULUS_NEAR;
/** And end here, where the haze has all but swallowed them. */
const FAR = 15000;
const MAX_PUFFS = 4200;
/** Cell layer's tile on the ground (m). */
const TILE = 1 / (CLOUD.cell[0] * CLOUD.uvPerM);

interface Puff {
  d: number; // distance from the camera, for the sort
  i: number; // into the staging arrays
}

interface Heap {
  x: number; // ground point of its cell (m)
  z: number;
  d: number; // distance from the camera
  s: number; // strength: 0 a wisp .. 1 a towering heap
  fu: number; // its cell in cloud-field uv
  fv: number;
  seed: number;
}

export class SkyCumulus {
  readonly mesh: THREE.Mesh;
  /** Set while the loading screen force-draws everything, so update() leaves the balls alone. */
  warm = false;
  /** Most balls drawn (low-end devices get fewer). */
  budget = MAX_PUFFS;
  private geo: THREE.InstancedBufferGeometry;
  private aAt: THREE.InstancedBufferAttribute;
  private aPuff: THREE.InstancedBufferAttribute;
  private cells: [number, number][];
  private noise: Uint8Array;
  private size: number;
  private t = 1e9;
  // reused every pick, so re-sorting the sky makes no garbage
  private puffs: Puff[] = [];
  private puffPool: Puff[] = Array.from({ length: MAX_PUFFS }, () => ({ d: 0, i: 0 }));
  private heaps: Heap[] = [];
  private heapPool: Heap[] = [];
  private stAt = new Float32Array(MAX_PUFFS * 4);
  private stPuff = new Float32Array(MAX_PUFFS * 4);

  constructor() {
    const tex = getSharedTextures().noise;
    this.cells = tex.userData.cells;
    this.noise = tex.image.data as Uint8Array;
    this.size = tex.image.width;

    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    // xy the heap's cell (cloud-field uv), zw the ball's ground offset from the heap's core (m)
    this.aAt = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PUFFS * 4), 4).setUsage(THREE.DynamicDrawUsage);
    // x height of the ball's centre above the base, y radius, z how much sun reaches it, w the heap's top
    this.aPuff = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PUFFS * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aAt', this.aAt);
    geo.setAttribute('aPuff', this.aPuff);
    geo.instanceCount = 0;
    this.geo = geo;

    const mat = new THREE.ShaderMaterial({
      uniforms: globalUniforms,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      fog: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      vertexShader: /* glsl */ `
        attribute vec4 aAt;
        attribute vec4 aPuff;
        uniform vec3 uSunDir;
        uniform vec2 uCloudOffset;
        varying vec2 vUv;
        varying vec3 vC;
        varying vec3 vR;
        varying vec3 vU;
        varying vec3 vF;
        varying vec3 vL;
        varying vec4 vInfo;
        void main() {
          // the heap's core, carried along by the wind and stood where the
          // sun puts its shadow on the cell (as the shadows and the dome do)
          vec2 g = (aAt.xy - uCloudOffset) / ${CLOUD.uvPerM};
          vec2 core = g + uSunDir.xz / max(uSunDir.y, 0.2) * ${CLOUD.base.toFixed(1)};
          vec3 c = vec3(core.x + aAt.z, ${CLOUD.base.toFixed(1)} + aPuff.x, core.y + aAt.w);
          float r = aPuff.y;
          // a quad square to the line of sight through the ball's centre
          vec3 f = normalize(cameraPosition - c);
          vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), f));
          vec3 u = cross(f, rt);
          vec3 p = c + (rt * position.x + u * position.y) * r;
          vUv = position.xy;
          vC = c;
          vR = rt;
          vU = u;
          vF = f;
          // the sun in the ball's own frame
          vL = vec3(dot(uSunDir, rt), dot(uSunDir, u), dot(uSunDir, f));
          vInfo = vec4(aPuff.zw, r, fract(aAt.x * 31.7 + aAt.y * 17.3));
          vec4 clip = projectionMatrix * viewMatrix * vec4(p, 1.0);
          // beyond everything the world draws, but in front of the sky
          clip.z = clip.w * 0.99999;
          gl_Position = clip;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uFogColor;
        uniform vec2 uFogRange;
        ${GLSL_ATMOS}
        ${GLSL_AERIAL}
        varying vec2 vUv;
        varying vec3 vC;
        varying vec3 vR;
        varying vec3 vU;
        varying vec3 vF;
        varying vec3 vL;
        varying vec4 vInfo;
        void main() {
          float r2 = dot(vUv, vUv);
          if (r2 >= 1.0) discard;
          float zf = sqrt(1.0 - r2);
          float rad = vInfo.z;
          // the front of the ball, in the world
          vec3 nrm = vR * vUv.x + vU * vUv.y + vF * zf;
          vec3 P = vC + nrm * rad;
          // billows eat the rim back
          vec3 D = vC + (vR * vUv.x + vU * vUv.y) * rad;
          // (in the ball's own frame: a few big lumps per ball, never a fur of fine ones)
          vec2 q = vUv * 0.16 + vInfo.w * 7.3;
          float wor = texture(uNoiseTex, q).b;
          float wor2 = texture(uNoiseTex, q * 2.6 + 0.61).b;
          float billow = smoothstep(0.18, 0.82, wor * 0.6 + wor2 * 0.4);
          float shape = (1.0 - sqrt(r2)) * 1.3 - (1.0 - billow) * 0.5 + 0.1;
          float a = smoothstep(0.0, 0.4, shape) * (1.0 - exp(-zf * 5.0));
          // every heap stands on the same flat base
          a *= smoothstep(-14.0, 34.0, D.y - ${CLOUD.base.toFixed(1)});
          vec3 V = P - cameraPosition;
          float dist = length(V);
          V /= dist;
          a *= smoothstep(${NEAR.toFixed(1)}, ${(NEAR * 1.5).toFixed(1)}, dist) * (1.0 - smoothstep(${(FAR * 0.7).toFixed(1)}, ${FAR.toFixed(1)}, dist));
          a *= smoothstep(0.0, 0.025, V.y);
          if (a < 0.004) discard;

          // ---- light: the vapour the sun crosses to get here, through this
          // ball (from its middle along the sun out to its surface) and the
          // heap around it (from the CPU)
          vec3 m = vec3(vUv, zf * 0.55);
          float b = dot(m, vL);
          float tSun = -b + sqrt(max(b * b - dot(m, m) + 1.0, 0.0));
          float dens = 2.4 + uStorm * 1.6;
          float through = vInfo.x;
          float Ts = exp(-tSun * dens) * through;
          // light scattered round inside: the shaded side never goes black
          float Tms = exp(-tSun * dens * 0.22) * (0.2 + 0.5 * through) * 0.45;
          // a dark crease where one billow turns from the sun, so each reads against the next
          float powder = 1.0 - exp(-zf * 2.6) * 0.4;
          float mu = dot(V, uSunDir);
          float phase = 0.85 + 0.3 * mu * mu + pow(max(mu, 0.0), 8.0) * 2.4;
          float lam = 0.45 + 0.55 * smoothstep(-0.6, 0.9, dot(nrm, uSunDir));
          vec3 sun = uSunColor * (Ts * powder + Tms) * lam * phase * 0.52;
          // toward the sun the thin rims burn silver with light scattered through them
          sun += uSunColor * pow(max(mu, 0.0), 10.0) * (1.0 - zf) * (1.0 - zf) * through * 1.3;
          // the open sky lights the crowns, the bright sea below lifts the bellies
          float hf = clamp((P.y - ${CLOUD.base.toFixed(1)}) / max(vInfo.y, 1.0), 0.0, 1.0);
          vec3 sky = mix(uSkyHorizon, uSkyZenith, 0.6) * 0.5 + uLight * 0.12;
          vec3 sea = vec3(0.08, 0.2, 0.25) * (uLight * 0.85 + 0.03) + sky * 0.25;
          vec3 amb = mix(sea, sky, smoothstep(-0.7, 0.8, nrm.y)) * mix(0.5, 1.05, hf) * mix(0.7, 1.0, zf);
          float albedo = 1.0 - uStorm * 0.5 - uRain * 0.3;
          vec3 col = (sun + amb) * albedo * (1.0 - uNight * 0.6);
          col += vec3(0.62, 0.7, 0.95) * uFlash * (0.4 + hf * 0.4);
          // far cloud sinks into the haze along the horizon
          col = mix(col, hazeColor(V), max(1.0 - exp(-dist * 0.000045), uMist * 0.65));
          gl_FragColor = vec4(col * a, a);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -900;
    this.mesh.name = 'Cumulus';
    this.mesh.visible = false;
  }

  /** Bilinear read of one noise channel, wrapping like the GPU. */
  private tex(u: number, v: number, ch: number): number {
    const S = this.size;
    const D = this.noise;
    u = u * S - 0.5;
    v = v * S - 0.5;
    const x0 = Math.floor(u);
    const y0 = Math.floor(v);
    const fx = u - x0;
    const fy = v - y0;
    const at = (x: number, y: number) => D[((((y % S) + S) % S) * S + (((x % S) + S) % S)) * 4 + ch];
    return ((at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy) / 255;
  }

  private field(u: number, v: number): number {
    const [ss, su, sv] = CLOUD.sys;
    const [cs, cu, cv] = CLOUD.cell;
    const [bs, bu, bv] = CLOUD.bil;
    return cloudMix(this.tex(u * ss + su, v * ss + sv, 0), 1 - this.tex(u * cs + cu, v * cs + cv, 2), this.tex(u * bs + bu, v * bs + bv, 0));
  }

  /**
   * Shows the heaps while the horizon is in view and, a couple of times a
   * second, re-picks the ones within reach and sorts their balls far to near.
   */
  update(dt: number, cam: THREE.Camera, show: boolean) {
    if (this.warm) return;
    const u = globalUniforms;
    const cover = u.uCloudCover.value;
    // under a closed sky there are no separate heaps left, only the grey ceiling
    this.mesh.visible = show && cover < 0.97;
    if (!this.mesh.visible) {
      this.t = 1e9;
      return;
    }
    this.t += dt;
    if (this.t < 0.5) return;
    this.t = 0;

    const lo = cloudLo(cover);
    const off = u.uCloudOffset.value;
    const sun = u.uSunDir.value;
    const sy = Math.max(sun.y, 0.2);
    const shx = (sun.x / sy) * CLOUD.base;
    const shz = (sun.z / sy) * CLOUD.base;
    // the sun's bearing, for which side of a heap it lights
    const sl = Math.hypot(sun.x, sun.z) || 1;
    const sx = sun.x / sl;
    const sz = sun.z / sl;
    const tall = (480 - 200 * smooth(0.45, 0.9, cover)) + u.uStorm.value * 520;
    const camX = cam.position.x;
    const camY = cam.position.y;
    const camZ = cam.position.z;
    const [cs, cu, cv] = CLOUD.cell;
    const k = CLOUD.uvPerM;
    const puffs = this.puffs;
    puffs.length = 0;
    const A = this.stAt;
    const B = this.stPuff;
    // the heaps within reach, nearest first, so the ball budget goes to the ones that show
    const heaps = this.heaps;
    heaps.length = 0;
    for (let ci = 0; ci < this.cells.length; ci++) {
      const [tu, tv] = this.cells[ci];
      // this feature point's ground position in the tile nearest the camera, then its neighbours
      let gx = ((tu - cu) / cs - off.x) / k;
      let gz = ((tv - cv) / cs - off.y) / k;
      gx += Math.round((camX - shx - gx) / TILE) * TILE;
      gz += Math.round((camZ - shz - gz) / TILE) * TILE;
      for (let ix = -2; ix <= 2; ix++) {
        for (let iz = -2; iz <= 2; iz++) {
          const x = gx + ix * TILE;
          const z = gz + iz * TILE;
          const d = Math.hypot(x + shx - camX, z + shz - camZ);
          if (d < NEAR * 0.6 || d > FAR + 600) continue;
          const fu = x * k + off.x;
          const fv = z * k + off.y;
          const s = Math.min(1, (this.field(fu, fv) - lo) * 3.3);
          if (s <= 0.02) continue;
          let hp = this.heapPool[heaps.length];
          if (!hp) this.heapPool.push((hp = { x: 0, z: 0, d: 0, s: 0, fu: 0, fv: 0, seed: 0 }));
          hp.x = x;
          hp.z = z;
          hp.d = d;
          hp.s = s;
          hp.fu = fu;
          hp.fv = fv;
          hp.seed = ci * 7919 + (Math.round(x / TILE) + 64) * 131 + Math.round(z / TILE) + 64;
          heaps.push(hp);
        }
      }
    }
    heaps.sort((p, q) => p.d - q.d);
    let n = 0;
    for (const hp of heaps) {
      if (n >= this.budget) break;
      const { s, fu, fv } = hp;
      const ox = hp.x + shx - camX;
      const oz = hp.z + shz - camZ;
      // the heap, built the same way every time from its own cell
      const rnd = mulberry32(hp.seed);
      // as wide as the field says it is (it falls off ~0.6 per cell from the core)
      const R = 50 + 280 * s; // footprint radius
      // never a thin tower: small heaps are squat, the big ones stand about as tall as they are wide
      const H = Math.min(tall * (0.25 + 0.75 * s), R * 1.5);
      // far off, fewer and bigger balls draw the same heap
      const far = smooth(3000, FAR, hp.d);
      const count = Math.round((5 + s * 9) * (1 - far * 0.45));
      const grow = 1 + far * 0.3;
      for (let j = 0; j < count && n < this.budget; j++) {
        const tier = j < count * 0.5 ? 0 : j < count * 0.82 ? 1 : 2;
        const ang = rnd() * Math.PI * 2;
        const spread = R * (tier === 0 ? 0.6 : tier === 1 ? 0.4 : 0.2) * Math.sqrt(rnd());
        const px = Math.cos(ang) * spread;
        const pz = Math.sin(ang) * spread;
        const rad = R * (tier === 0 ? 0.52 : tier === 1 ? 0.5 : 0.44) * (0.75 + rnd() * 0.4) * grow;
        // bases hug the flat bottom, the middle billows heap up, a turret or two crowns it
        const hy = tier === 0 ? rad * 0.35 : tier === 1 ? H * (0.3 + rnd() * 0.22) - rad * 0.2 : H * (0.6 + rnd() * 0.2) - rad * 0.3;
        // the sun reaches the high, sunward side of the heap and not much else
        const side = (px * sx + pz * sz) / R;
        const through = Math.min(1, Math.max(0.12, 0.3 + 0.55 * (hy / Math.max(H, 1)) + 0.35 * side));
        const i = n * 4;
        A[i] = fu;
        A[i + 1] = fv;
        A[i + 2] = px;
        A[i + 3] = pz;
        B[i] = hy;
        B[i + 1] = rad;
        B[i + 2] = through;
        B[i + 3] = H;
        const ddx = ox + px;
        const ddz = oz + pz;
        const ddy = CLOUD.base + hy - camY;
        const pf = this.puffPool[n];
        pf.d = ddx * ddx + ddy * ddy + ddz * ddz;
        pf.i = n;
        puffs.push(pf);
        n++;
      }
    }
    puffs.sort((p, q) => q.d - p.d);
    const at = this.aAt.array as Float32Array;
    const pf = this.aPuff.array as Float32Array;
    for (let j = 0; j < puffs.length; j++) {
      const s = puffs[j].i * 4;
      const o = j * 4;
      for (let c = 0; c < 4; c++) {
        at[o + c] = A[s + c];
        pf[o + c] = B[s + c];
      }
    }
    this.geo.instanceCount = puffs.length;
    for (const a of [this.aAt, this.aPuff]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, puffs.length * 4);
      a.needsUpdate = true;
    }
  }
}

function smooth(e0: number, e1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
