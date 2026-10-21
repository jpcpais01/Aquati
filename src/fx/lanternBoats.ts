import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { globalUniforms } from '../render/environment';
import type { World } from '../game/world';

// Paper-lantern boats: on a feast night the townsfolk set little folded boats
// on the water, each with a candle burning in a paper lantern, and the tide and
// the breeze carry them out to sea in a long, spreading trail of lights. Each
// rides the swell on its own, turns slowly as it goes, is shouldered aside by
// any hull that sails through them, and gutters out after a few minutes.
// One instanced mesh draws them all (opaque pass, so the sea mirrors them);
// a second lays a soft pool of candlelight on the water round each one.

const CAP = 72;
const TAU = Math.PI * 2;

export interface Pusher {
  pos: THREE.Vector3;
  heading: number;
  length: number;
  beam: number;
  speed: number;
}

interface Boat {
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** The way the tide sets, out from the quay. */
  ox: number;
  oz: number;
  yaw: number;
  spin: number;
  age: number;
  life: number;
  seed: number;
  r: number;
  g: number;
  b: number;
}

/** A little paper boat with a square paper lantern standing amidships: glow 0 dark .. 1 the lantern's paper. */
function boatGeometry() {
  const paint = (g: THREE.BufferGeometry, glow: number) => {
    const n = g.getAttribute('position').count;
    g.setAttribute('aGlow', new THREE.Float32BufferAttribute(new Float32Array(n).fill(glow), 1));
    if (g.getAttribute('uv')) g.deleteAttribute('uv');
    return g.index ? g.toNonIndexed() : g;
  };
  // the hull: a box folded in at the keel, its ends drawn up to points
  const hull = new THREE.BoxGeometry(0.24, 0.1, 0.36, 1, 1, 2);
  const p = hull.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const z = p.getZ(i);
    if (y < 0) {
      p.setX(i, p.getX(i) * 0.55);
      p.setZ(i, z * 0.75);
    } else if (Math.abs(z) > 0.1) p.setZ(i, Math.sign(z) * 0.27);
    if (Math.abs(z) > 0.1 && y > 0) p.setY(i, 0.09);
    p.setY(i, p.getY(i) + 0.03);
  }
  hull.computeVertexNormals();
  const lantern = new THREE.CylinderGeometry(0.075, 0.085, 0.17, 4, 1, true).rotateY(Math.PI / 4).translate(0, 0.205, 0);
  const cap = new THREE.ConeGeometry(0.105, 0.07, 4).rotateY(Math.PI / 4).translate(0, 0.325, 0);
  return mergeGeometries([paint(hull, 0.18), paint(lantern, 1), paint(cap, 0)])!;
}

export class LanternBoats {
  /** The boats themselves (opaque pass). */
  readonly mesh: THREE.InstancedMesh;
  /** Their candlelight on the water (water/fx pass). */
  readonly pools: THREE.InstancedMesh;
  private boats: Boat[] = [];
  private tint: THREE.InstancedBufferAttribute;
  private poolTint: THREE.InstancedBufferAttribute;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler(0, 0, 0, 'YXZ');
  private v = new THREE.Vector3();
  private s = new THREE.Vector3(1, 1, 1);

  constructor(fx: Record<string, THREE.IUniform>) {
    const geo = boatGeometry();
    this.tint = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aTint', this.tint);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: globalUniforms.uTime, uLight: globalUniforms.uLight, uFogRange: globalUniforms.uFogRange, uMist: globalUniforms.uMist },
      vertexShader: /* glsl */ `
        attribute float aGlow; attribute vec4 aTint;
        uniform vec2 uFogRange; uniform float uMist;
        varying float vGlow; varying vec4 vTint; varying float vFace; varying float vFog; varying float vSeed;
        void main() {
          vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vec3 n = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
          vec3 toEye = cameraPosition - wp.xyz;
          float d = length(toEye);
          vFace = abs(dot(n, toEye / d));
          vGlow = aGlow; vTint = aTint;
          vSeed = fract(instanceMatrix[3].x * 0.137 + instanceMatrix[3].z * 0.071);
          vFog = max(smoothstep(uFogRange.x, uFogRange.y, d) * 0.85, (1.0 - exp(-d * 0.0045)) * uMist * 0.6);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uLight;
        varying float vGlow; varying vec4 vTint; varying float vFace; varying float vFog; varying float vSeed;
        void main() {
          float flick = 0.86 + 0.14 * sin(uTime * 12.0 + vSeed * 70.0) * sin(uTime * 7.1 + vSeed * 23.0);
          float k = vTint.w * flick;
          vec3 paper = vec3(0.92, 0.88, 0.8);
          // the lantern glows through its paper; the folded hull catches the candle from above
          // (lit only after dark, under the night's lifted exposure: held to a candle's glow)
          vec3 lit = vTint.rgb * vGlow * (0.5 + 1.8 * vFace * vFace) * 1.2 * k;
          lit += vec3(1.0, 0.7, 0.38) * step(0.5, vGlow) * pow(vFace, 6.0) * 0.8 * k;
          vec3 base = mix(vec3(0.06, 0.045, 0.03), paper, step(0.05, vGlow)) * (uLight * 0.9 + vec3(0.02));
          vec3 c = base + lit;
          c *= 1.0 - vFog;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, CAP);
    this.mesh.name = 'lantern-boats';
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.userData.noLod = true;

    const pg = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.poolTint = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4).setUsage(THREE.DynamicDrawUsage);
    pg.setAttribute('aTint', this.poolTint);
    const pm = new THREE.ShaderMaterial({
      uniforms: fx,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      premultipliedAlpha: true,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec4 aTint;
        varying vec4 vTint; varying vec2 vUv; varying float vViewZ;
        void main() {
          vTint = aTint; vUv = uv;
          vec4 mv = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
          vViewZ = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uSceneDepth; uniform vec2 uResolution; uniform vec2 uCamNearFar;
        varying vec4 vTint; varying vec2 vUv; varying float vViewZ;
        float linearDepth(float d) { float n = uCamNearFar.x, f = uCamNearFar.y; return (n * f) / (f - d * (f - n)); }
        void main() {
          vec2 q = vUv * 2.0 - 1.0;
          float r2 = dot(q, q);
          if (r2 > 1.0) discard;
          float a = exp(-r2 * 4.5) * 0.16 + exp(-r2 * 28.0) * 0.22;
          // tucked behind anything standing in front (a hull, the quay)
          float sz = linearDepth(texture2D(uSceneDepth, gl_FragCoord.xy / uResolution).r);
          a *= clamp((sz - vViewZ) * 0.5, 0.0, 1.0) * vTint.w;
          if (a < 0.002) discard;
          gl_FragColor = vec4(vTint.rgb * a, 0.0);
        }`,
    });
    this.pools = new THREE.InstancedMesh(pg, pm, CAP);
    this.pools.name = 'lantern-pools';
    this.pools.count = 0;
    this.pools.frustumCulled = false;
    this.pools.renderOrder = 4;
    this.pools.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }

  get count() {
    return this.boats.length;
  }

  get full() {
    return this.boats.length >= CAP;
  }

  /** Sets one on the water at (x, z), to drift out along (ox, oz), its lantern glowing `tint` (linear rgb). */
  launch(x: number, z: number, ox: number, oz: number, tint: THREE.Color) {
    if (this.full) return;
    const sp = 0.12 + Math.random() * 0.1;
    this.boats.push({
      x, z, vx: ox * sp, vz: oz * sp, ox, oz,
      yaw: Math.random() * TAU, spin: (Math.random() - 0.5) * 0.3,
      age: 0, life: 150 + Math.random() * 110, seed: Math.random() * 100,
      r: tint.r, g: tint.g, b: tint.b,
    });
  }

  clear() {
    this.boats.length = 0;
    this.mesh.count = this.pools.count = 0;
  }

  update(dt: number, world: World, pushers: Pusher[]) {
    const bs = this.boats;
    if (!bs.length) {
      this.mesh.count = this.pools.count = 0;
      return;
    }
    const wind = world.wind;
    const T = this.tint.array as Float32Array;
    const PT = this.poolTint.array as Float32Array;
    const k = 1 - Math.exp(-0.6 * dt);
    for (let i = bs.length - 1; i >= 0; i--) {
      const b = bs[i];
      b.age += dt;
      if (b.age > b.life) {
        bs[i] = bs[bs.length - 1];
        bs.pop();
      }
    }
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      // the ebb draws them out, the breeze leans on them, each wanders a little its own way
      const wander = Math.sin(b.age * 0.11 + b.seed) * 0.09;
      const tx = b.ox * 0.3 + wind.dirX * 0.1 * wind.strength - b.oz * wander;
      const tz = b.oz * 0.3 + wind.dirZ * 0.1 * wind.strength + b.ox * wander;
      b.vx += (tx - b.vx) * k;
      b.vz += (tz - b.vz) * k;
      // shouldered aside by any hull sailing through them, and dragged along in her wash
      for (const s of pushers) {
        const dx = b.x - s.pos.x;
        const dz = b.z - s.pos.z;
        const half = s.length * 0.5 + 1;
        if (dx * dx + dz * dz > half * half) continue;
        const fx = Math.sin(s.heading);
        const fz = Math.cos(s.heading);
        const lz = dx * fx + dz * fz;
        const lx = dx * fz - dz * fx;
        const u = Math.min(1, Math.abs(lz) / half);
        const hb = (s.beam * 0.5 + 0.7) * Math.sqrt(1 - u * u);
        if (Math.abs(lx) >= hb) continue;
        const side = lx < 0 ? -1 : 1;
        const push = hb - Math.abs(lx);
        b.x += fz * side * push;
        b.z += -fx * side * push;
        b.vx += (fz * side * 0.8 + fx * s.speed * 0.3) * Math.min(1, push);
        b.vz += (-fx * side * 0.8 + fz * s.speed * 0.3) * Math.min(1, push);
        b.spin += side * 0.4 * Math.min(1, push);
      }
      b.spin *= 1 - Math.min(1, dt * 0.08);
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      b.yaw += b.spin * dt;
      // riding the swell
      const y = world.waterHeight(b.x, b.z);
      const hx = world.waterHeight(b.x + 0.35, b.z) - y;
      const hz = world.waterHeight(b.x, b.z + 0.35) - y;
      const cy = Math.cos(b.yaw);
      const sy = Math.sin(b.yaw);
      // slope along the boat's own axes: pitch along z, roll along x
      const along = hx * sy + hz * cy;
      const across = hx * cy - hz * sy;
      this.e.set(-Math.atan2(along, 0.35), b.yaw, Math.atan2(across, 0.35));
      this.q.setFromEuler(this.e);
      this.m.compose(this.v.set(b.x, y - 0.015, b.z), this.q, this.s.set(1, 1, 1));
      this.mesh.setMatrixAt(i, this.m);
      this.m.compose(this.v.set(b.x, y + 0.03, b.z), this.q.identity(), this.s.set(2.6, 1, 2.6));
      this.pools.setMatrixAt(i, this.m);
      // lit as it's set down, and guttering out at the end
      const fade = Math.min(1, b.age / 0.8);
      const left = b.life - b.age;
      const gutter = left < 12 ? Math.max(0, left / 12) * (0.6 + 0.4 * Math.abs(Math.sin(b.age * 9 + b.seed))) : 1;
      const w = fade * gutter;
      T[i * 4] = b.r;
      T[i * 4 + 1] = b.g;
      T[i * 4 + 2] = b.b;
      T[i * 4 + 3] = w;
      PT[i * 4] = b.r * 0.6 + 0.4;
      PT[i * 4 + 1] = b.g * 0.6 + 0.25;
      PT[i * 4 + 2] = b.b * 0.6 + 0.1;
      PT[i * 4 + 3] = w;
    }
    this.mesh.count = this.pools.count = bs.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.pools.instanceMatrix.needsUpdate = true;
    this.tint.needsUpdate = true;
    this.poolTint.needsUpdate = true;
  }
}
