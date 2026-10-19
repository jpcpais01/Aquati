import * as THREE from 'three';
import { getSharedTextures } from '../render/textures';

// CPU-simulated, GPU-instanced billboard particles. Two pools: alpha
// (premultiplied: smoke, spray, splinters) and additive (fire, flashes,
// sparks). Soft-depth fade against the opaque scene keeps intersections clean.

interface P {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number;
  s0: number; s1: number;
  r0: number; g0: number; b0: number;
  r1: number; g1: number; b1: number;
  a: number;
  drag: number;
  grav: number;
  rot: number; spin: number;
  kind: number; // 0 soft, 1 smoke, 2 spark/streak, 3 chunk
  fadeIn: number;
}

export interface Emit {
  x: number; y: number; z: number;
  vx?: number; vy?: number; vz?: number;
  life: number;
  size: number;
  sizeEnd?: number;
  color: [number, number, number];
  colorEnd?: [number, number, number];
  alpha?: number;
  drag?: number;
  grav?: number;
  spin?: number;
  kind?: number;
  fadeIn?: number;
}

class Pool {
  readonly mesh: THREE.Mesh;
  private ps: P[] = [];
  private next = 0;
  private aPos: Float32Array;
  private aCol: Float32Array;
  private aMisc: Float32Array;
  private geo: THREE.InstancedBufferGeometry;
  private attrPos: THREE.InstancedBufferAttribute;
  private attrCol: THREE.InstancedBufferAttribute;
  private attrMisc: THREE.InstancedBufferAttribute;

  constructor(private cap: number, additive: boolean, uniforms: Record<string, THREE.IUniform>) {
    for (let i = 0; i < cap; i++) {
      this.ps.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 0, s0: 0, s1: 0, r0: 0, g0: 0, b0: 0, r1: 0, g1: 0, b1: 0, a: 0, drag: 0, grav: 0, rot: 0, spin: 0, kind: 0, fadeIn: 0 });
    }
    this.aPos = new Float32Array(cap * 3);
    this.aCol = new Float32Array(cap * 4);
    this.aMisc = new Float32Array(cap * 4);
    this.geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geo.index = quad.index;
    this.geo.setAttribute('position', quad.getAttribute('position'));
    this.attrPos = new THREE.InstancedBufferAttribute(this.aPos, 3).setUsage(THREE.DynamicDrawUsage);
    this.attrCol = new THREE.InstancedBufferAttribute(this.aCol, 4).setUsage(THREE.DynamicDrawUsage);
    this.attrMisc = new THREE.InstancedBufferAttribute(this.aMisc, 4).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aPos', this.attrPos);
    this.geo.setAttribute('aCol', this.attrCol);
    this.geo.setAttribute('aMisc', this.attrMisc);
    this.geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      premultipliedAlpha: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      defines: { ADDITIVE: additive ? 1 : 0 },
      vertexShader: /* glsl */ `
        attribute vec3 aPos; attribute vec4 aCol; attribute vec4 aMisc; // size, rot, kind, seed
        varying vec4 vCol; varying vec2 vUv; varying float vKind; varying float vSeed; varying float vViewZ;
        void main() {
          vCol = aCol; vUv = position.xy * 2.0; vKind = aMisc.z; vSeed = aMisc.w;
          vec4 mv = viewMatrix * vec4(aPos, 1.0);
          float c = cos(aMisc.y), s = sin(aMisc.y);
          vec2 q = position.xy * aMisc.x;
          mv.xy += vec2(c * q.x - s * q.y, s * q.x + c * q.y);
          vViewZ = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uNoiseTex; uniform sampler2D uSceneDepth; uniform vec2 uResolution; uniform vec2 uCamNearFar;
        varying vec4 vCol; varying vec2 vUv; varying float vKind; varying float vSeed; varying float vViewZ;
        float linearDepth(float d) { float n = uCamNearFar.x, f = uCamNearFar.y; return (n * f) / (f - d * (f - n)); }
        void main() {
          float r = length(vUv);
          if (r > 1.0) discard;
          float a;
          if (vKind < 0.5) {
            a = pow(1.0 - r, 1.6);
          } else if (vKind < 1.5) {
            vec2 nuv = vUv * 0.22 + vec2(vSeed, vSeed * 1.7);
            float n = texture(uNoiseTex, nuv).g * 0.7 + texture(uNoiseTex, nuv * 2.3).a * 0.3;
            a = smoothstep(0.0, 0.55, (1.0 - r) * (0.55 + n * 0.9) - 0.12);
          } else if (vKind < 2.5) {
            a = pow(max(1.0 - r, 0.0), 3.0) * 1.6;
          } else {
            a = 1.0 - smoothstep(0.55, 0.8, r);
          }
          vec2 suv = gl_FragCoord.xy / uResolution;
          float sz = linearDepth(texture(uSceneDepth, suv).r);
          a *= clamp((sz - vViewZ) * 0.6, 0.0, 1.0);
          a *= vCol.a;
          if (a < 0.003) discard;
          #if ADDITIVE
            gl_FragColor = vec4(vCol.rgb * a, 0.0);
          #else
            gl_FragColor = vec4(vCol.rgb * a, a);
          #endif
        }`,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 20 : 10;
  }

  spawn(e: Emit) {
    const p = this.ps[this.next];
    this.next = (this.next + 1) % this.cap;
    p.x = e.x; p.y = e.y; p.z = e.z;
    p.vx = e.vx ?? 0; p.vy = e.vy ?? 0; p.vz = e.vz ?? 0;
    p.life = 0; p.max = e.life;
    p.s0 = e.size; p.s1 = e.sizeEnd ?? e.size;
    p.r0 = e.color[0]; p.g0 = e.color[1]; p.b0 = e.color[2];
    const ce = e.colorEnd ?? e.color;
    p.r1 = ce[0]; p.g1 = ce[1]; p.b1 = ce[2];
    p.a = e.alpha ?? 1;
    p.drag = e.drag ?? 0;
    p.grav = e.grav ?? 0;
    p.rot = Math.random() * Math.PI * 2;
    p.spin = e.spin ?? 0;
    p.kind = e.kind ?? 0;
    p.fadeIn = e.fadeIn ?? 0.08;
  }

  update(dt: number) {
    let n = 0;
    const P = this.aPos;
    const Cc = this.aCol;
    const M = this.aMisc;
    for (let i = 0; i < this.cap; i++) {
      const p = this.ps[i];
      if (p.life >= p.max) continue;
      p.life += dt;
      if (p.life >= p.max) continue;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy *= k; p.vz *= k;
      p.vy -= p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.rot += p.spin * dt;
      const t = p.life / p.max;
      const fin = Math.min(1, p.life / Math.max(p.fadeIn, 1e-3));
      const fout = 1 - t * t;
      P[n * 3] = p.x; P[n * 3 + 1] = p.y; P[n * 3 + 2] = p.z;
      Cc[n * 4] = p.r0 + (p.r1 - p.r0) * t;
      Cc[n * 4 + 1] = p.g0 + (p.g1 - p.g0) * t;
      Cc[n * 4 + 2] = p.b0 + (p.b1 - p.b0) * t;
      Cc[n * 4 + 3] = p.a * fin * fout;
      M[n * 4] = p.s0 + (p.s1 - p.s0) * Math.sqrt(t);
      M[n * 4 + 1] = p.rot;
      M[n * 4 + 2] = p.kind;
      M[n * 4 + 3] = (i * 0.618) % 1;
      n++;
    }
    this.geo.instanceCount = n;
    if (n > 0) {
      this.attrPos.clearUpdateRanges();
      this.attrPos.addUpdateRange(0, n * 3);
      this.attrPos.needsUpdate = true;
      this.attrCol.clearUpdateRanges();
      this.attrCol.addUpdateRange(0, n * 4);
      this.attrCol.needsUpdate = true;
      this.attrMisc.clearUpdateRanges();
      this.attrMisc.addUpdateRange(0, n * 4);
      this.attrMisc.needsUpdate = true;
    }
  }
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class Particles {
  readonly group = new THREE.Group();
  private alpha: Pool;
  private add: Pool;
  readonly uniforms = {
    uNoiseTex: { value: getSharedTextures().noise as THREE.Texture },
    uSceneDepth: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uCamNearFar: { value: new THREE.Vector2(1, 1000) },
  };

  constructor(scale = 1) {
    this.alpha = new Pool(Math.floor(2600 * scale), false, this.uniforms);
    this.add = new Pool(Math.floor(1400 * scale), true, this.uniforms);
    this.group.add(this.alpha.mesh, this.add.mesh);
  }

  update(dt: number) {
    this.alpha.update(dt);
    this.add.update(dt);
  }

  emit(e: Emit, additive = false) {
    (additive ? this.add : this.alpha).spawn(e);
  }

  // ------------------------------------------------------------- recipes

  muzzle(pos: THREE.Vector3, dir: THREE.Vector3, carry: THREE.Vector3) {
    // flash core
    this.emit({ x: pos.x, y: pos.y, z: pos.z, life: 0.12, size: 2.6, sizeEnd: 4.2, color: [9, 6, 2.6], colorEnd: [4, 1.4, 0.3], kind: 0, fadeIn: 0.001 }, true);
    for (let i = 0; i < 5; i++) {
      const sp = rand(10, 22);
      this.emit({
        x: pos.x, y: pos.y, z: pos.z,
        vx: dir.x * sp + rand(-2, 2) + carry.x, vy: dir.y * sp + rand(-1, 2), vz: dir.z * sp + rand(-2, 2) + carry.z,
        life: rand(0.1, 0.22), size: rand(0.8, 1.6), sizeEnd: 0.3, color: [6, 3.2, 1.0], colorEnd: [2, 0.5, 0.1], drag: 6, kind: 0, fadeIn: 0.001,
      }, true);
    }
    // billowing smoke
    for (let i = 0; i < 9; i++) {
      const sp = rand(3, 13);
      const g = rand(0.72, 0.92);
      this.emit({
        x: pos.x + dir.x * 0.6, y: pos.y, z: pos.z + dir.z * 0.6,
        vx: dir.x * sp + rand(-1.2, 1.2) + carry.x * 0.6, vy: rand(0.2, 1.6), vz: dir.z * sp + rand(-1.2, 1.2) + carry.z * 0.6,
        life: rand(2.2, 3.8), size: rand(1.2, 2.0), sizeEnd: rand(5.5, 8.5), color: [g * 1.15, g * 1.12, g * 1.08], colorEnd: [g, g, g * 1.02],
        alpha: rand(0.45, 0.7), drag: 1.7, grav: -0.25, spin: rand(-0.4, 0.4), kind: 1, fadeIn: 0.05,
      });
    }
  }

  splash(pos: THREE.Vector3, scale = 1) {
    for (let i = 0; i < 22 * scale; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = rand(0.5, 3.2);
      this.emit({
        x: pos.x + Math.cos(a) * 0.3, y: pos.y + 0.1, z: pos.z + Math.sin(a) * 0.3,
        vx: Math.cos(a) * r, vy: rand(7, 15) * scale, vz: Math.sin(a) * r,
        life: rand(0.8, 1.4), size: rand(0.35, 0.8), sizeEnd: 0.25, color: [1.3, 1.4, 1.45], alpha: 0.95, grav: 16, drag: 0.6, kind: 0, fadeIn: 0.01,
      });
    }
    // central column + mist
    for (let i = 0; i < 4; i++) {
      this.emit({
        x: pos.x, y: pos.y + 0.3 + i * 0.6, z: pos.z, vy: rand(4, 9) * scale,
        life: rand(0.7, 1.0), size: 1.0 * scale, sizeEnd: 2.4 * scale, color: [1.3, 1.38, 1.42], alpha: 0.7, grav: 9, drag: 1.2, kind: 1,
      });
    }
    for (let i = 0; i < 5; i++) {
      this.emit({
        x: pos.x + rand(-1, 1), y: pos.y + 0.4, z: pos.z + rand(-1, 1), vx: rand(-1, 1), vy: rand(0.5, 1.5), vz: rand(-1, 1),
        life: rand(1.4, 2.4), size: 1.4 * scale, sizeEnd: 4.5 * scale, color: [1.2, 1.28, 1.32], alpha: 0.35, drag: 1.5, kind: 1,
      });
    }
  }

  woodHit(pos: THREE.Vector3, normal: THREE.Vector3) {
    this.emit({ x: pos.x, y: pos.y, z: pos.z, life: 0.16, size: 3.2, sizeEnd: 4.5, color: [8, 4.5, 1.6], colorEnd: [3, 0.8, 0.2], fadeIn: 0.001 }, true);
    for (let i = 0; i < 16; i++) {
      const sp = rand(4, 13);
      const br = rand(0.55, 0.9);
      this.emit({
        x: pos.x, y: pos.y, z: pos.z,
        vx: normal.x * sp + rand(-4, 4), vy: rand(3, 11), vz: normal.z * sp + rand(-4, 4),
        life: rand(0.9, 1.7), size: rand(0.18, 0.42), color: [0.55 * br, 0.36 * br, 0.2 * br], grav: 18, drag: 0.4, spin: rand(-14, 14), kind: 3, fadeIn: 0.001,
      });
    }
    for (let i = 0; i < 7; i++) {
      this.emit({
        x: pos.x, y: pos.y, z: pos.z, vx: normal.x * rand(1, 4) + rand(-1, 1), vy: rand(0.5, 2.5), vz: normal.z * rand(1, 4) + rand(-1, 1),
        life: rand(1.5, 2.6), size: 1.2, sizeEnd: rand(4, 6), color: [0.42, 0.4, 0.38], colorEnd: [0.62, 0.6, 0.58], alpha: 0.6, drag: 1.3, grav: -0.6, kind: 1,
      });
    }
    for (let i = 0; i < 8; i++) {
      this.emit({
        x: pos.x, y: pos.y, z: pos.z, vx: rand(-9, 9), vy: rand(2, 10), vz: rand(-9, 9),
        life: rand(0.3, 0.7), size: rand(0.12, 0.25), color: [8, 4, 1.2], colorEnd: [3, 0.6, 0.1], grav: 14, kind: 2, fadeIn: 0.001,
      }, true);
    }
  }

  sandHit(pos: THREE.Vector3) {
    for (let i = 0; i < 10; i++) {
      this.emit({
        x: pos.x, y: pos.y, z: pos.z, vx: rand(-4, 4), vy: rand(2, 8), vz: rand(-4, 4),
        life: rand(1, 2), size: 1, sizeEnd: rand(3, 5), color: [1.0, 0.9, 0.7], alpha: 0.55, drag: 1.6, grav: 2, kind: 1,
      });
    }
  }

  flame(pos: THREE.Vector3, intensity = 1) {
    this.emit({
      x: pos.x + rand(-0.5, 0.5), y: pos.y + rand(0, 0.4), z: pos.z + rand(-0.5, 0.5), vx: rand(-0.4, 0.4), vy: rand(2, 4.5), vz: rand(-0.4, 0.4),
      life: rand(0.45, 0.8), size: rand(0.9, 1.6) * intensity, sizeEnd: 0.3, color: [7, 3.2, 0.8], colorEnd: [3, 0.5, 0.08], spin: rand(-2, 2), kind: 0, fadeIn: 0.05,
    }, true);
    if (Math.random() < 0.55) {
      this.emit({
        x: pos.x + rand(-0.4, 0.4), y: pos.y + 1.2, z: pos.z + rand(-0.4, 0.4), vx: rand(-0.3, 0.3), vy: rand(2.5, 4.5), vz: rand(-0.3, 0.3),
        life: rand(2.5, 4.5), size: 1.3 * intensity, sizeEnd: rand(5, 8) * intensity, color: [0.22, 0.2, 0.19], colorEnd: [0.45, 0.44, 0.43], alpha: 0.55, drag: 0.35, grav: -0.3, spin: rand(-0.5, 0.5), kind: 1, fadeIn: 0.2,
      });
    }
  }

  explosion(pos: THREE.Vector3, scale = 1) {
    this.emit({ x: pos.x, y: pos.y + 1, z: pos.z, life: 0.35, size: 9 * scale, sizeEnd: 16 * scale, color: [12, 6, 2], colorEnd: [3, 0.8, 0.15], fadeIn: 0.001 }, true);
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(3, 12) * scale;
      this.emit({
        x: pos.x, y: pos.y + 1, z: pos.z, vx: Math.cos(a) * sp, vy: rand(3, 14) * scale, vz: Math.sin(a) * sp,
        life: rand(0.5, 1.1), size: rand(1.4, 2.8) * scale, sizeEnd: 0.5, color: [8, 3.4, 0.9], colorEnd: [2.2, 0.4, 0.05], drag: 2.2, grav: 3, kind: 0, fadeIn: 0.001,
      }, true);
    }
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(5, 18) * scale;
      const br = rand(0.4, 0.8);
      this.emit({
        x: pos.x, y: pos.y + 1, z: pos.z, vx: Math.cos(a) * sp, vy: rand(6, 20), vz: Math.sin(a) * sp,
        life: rand(1.2, 2.4), size: rand(0.3, 0.8), color: [0.5 * br, 0.34 * br, 0.2 * br], grav: 18, drag: 0.3, spin: rand(-12, 12), kind: 3, fadeIn: 0.001,
      });
    }
    for (let i = 0; i < 16; i++) {
      this.emit({
        x: pos.x + rand(-2, 2), y: pos.y + rand(1, 3), z: pos.z + rand(-2, 2), vx: rand(-2, 2), vy: rand(1.5, 5), vz: rand(-2, 2),
        life: rand(3, 6), size: 3 * scale, sizeEnd: rand(10, 16) * scale, color: [0.2, 0.19, 0.18], colorEnd: [0.5, 0.49, 0.48], alpha: 0.6, drag: 0.8, grav: -0.4, spin: rand(-0.3, 0.3), kind: 1, fadeIn: 0.1,
      });
    }
  }

  trail(pos: THREE.Vector3) {
    this.emit({ x: pos.x, y: pos.y, z: pos.z, vy: 0.3, life: 0.9, size: 0.35, sizeEnd: 1.4, color: [0.9, 0.9, 0.9], alpha: 0.28, drag: 1, kind: 1 });
  }

  sparkle(pos: THREE.Vector3, tint?: [number, number, number], scale = 1) {
    const c: [number, number, number] = tint ? [tint[0] * 2.2, tint[1] * 2.2, tint[2] * 2.2] : [6, 4.6, 1.6];
    this.emit({ x: pos.x + rand(-0.8, 0.8) * scale, y: pos.y + rand(0.2, 1.4) * scale, z: pos.z + rand(-0.8, 0.8) * scale, vy: 0.8 * scale, life: rand(0.5, 0.9), size: rand(0.3, 0.6) * scale, sizeEnd: 0.05, color: c, kind: 2, fadeIn: 0.1 }, true);
  }

  /** Treasure pickup: a flash, a fountain of coins and a ring of rarity-coloured sparks. */
  treasure(pos: THREE.Vector3, tint: [number, number, number], tier: number) {
    const big = 0.6 + tier * 0.35;
    const t = (k: number): [number, number, number] => [tint[0] * k, tint[1] * k, tint[2] * k];
    this.emit({ x: pos.x, y: pos.y + 0.8, z: pos.z, life: 0.35 + tier * 0.08, size: 2 * big, sizeEnd: 6 * big, color: t(2.4), colorEnd: t(0.4), kind: 0, fadeIn: 0.001 }, true);
    // gold coins tumbling up and back down
    for (let i = 0; i < 8 + tier * 8; i++) {
      const a = Math.random() * Math.PI * 2, r = rand(1, 3.5) * big;
      this.emit({
        x: pos.x, y: pos.y + 0.6, z: pos.z, vx: Math.cos(a) * r, vy: rand(6, 11) * Math.sqrt(big), vz: Math.sin(a) * r,
        life: rand(0.8, 1.3), size: rand(0.16, 0.26), color: [5.5, 3.8, 1.1], colorEnd: [3, 1.6, 0.3], grav: 16, drag: 0.4, spin: rand(-14, 14), kind: 3, fadeIn: 0.001,
      }, true);
    }
    // ring of rarity sparks racing outward across the water
    const ring = 10 + tier * 8;
    for (let i = 0; i < ring; i++) {
      const a = (i / ring) * Math.PI * 2 + rand(-0.1, 0.1), sp = rand(5, 8) * big;
      this.emit({
        x: pos.x, y: pos.y + 0.4, z: pos.z, vx: Math.cos(a) * sp, vy: rand(0.5, 2), vz: Math.sin(a) * sp,
        life: rand(0.5, 0.8), size: rand(0.25, 0.45), sizeEnd: 0.05, color: t(3), colorEnd: t(0.8), drag: 2.4, kind: 2, fadeIn: 0.001,
      }, true);
    }
    // epic and legendary: a pillar of motes spiralling up to the sky
    if (tier >= 3) {
      for (let i = 0; i < tier * 10; i++) {
        const a = i * 0.7, r = rand(0.4, 1.4);
        this.emit({
          x: pos.x + Math.cos(a) * r, y: pos.y + rand(0, 2), z: pos.z + Math.sin(a) * r, vx: -Math.sin(a) * 1.5, vy: rand(5, 12), vz: Math.cos(a) * 1.5,
          life: rand(0.9, 1.6), size: rand(0.25, 0.5), sizeEnd: 0.05, color: t(2.6), colorEnd: [1.5, 1.2, 0.5], drag: 0.6, kind: 2, fadeIn: 0.02,
        }, true);
      }
    }
  }

  setScene(depth: THREE.Texture, w: number, h: number, cam: THREE.PerspectiveCamera) {
    this.uniforms.uSceneDepth.value = depth;
    this.uniforms.uResolution.value.set(w, h);
    this.uniforms.uCamNearFar.value.set(cam.near, cam.far);
  }
}
